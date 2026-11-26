const saveAndroidSmilePack = (() => {
  'use strict';
  if (location.pathname !== '/settings') return;

  const handshake = 'loneti-smile-pack-export-v1';
  const chunkBytes = 32 * 1024;
  const maxBytes = 16 * 1024 * 1024;
  const timeoutMs = 35_000;
  let port = null;
  let transfer = null;

  function attach(event) {
    if (!event.isTrusted || event.data !== handshake || event.ports.length !== 1) return;
    if (event.source !== null && event.source !== window) return;
    if (event.origin && event.origin !== 'null' && event.origin !== location.origin) return;
    event.stopImmediatePropagation();
    if (transfer) abort(transfer);
    port?.close();
    port = event.ports[0];
    port.onmessage = receive;
  }

  function fail(status) {
    const error = new Error('Android pack export failed');
    error.androidPackExportStatus = status;
    return error;
  }

  function receive(event) {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!transfer?.pending || message?.id !== transfer.id) return;
    const { resolve, reject, timeout, status, offset } = transfer.pending;
    if (message.status === status && message.offset === offset) {
      clearTimeout(timeout);
      transfer.pending = null;
      resolve();
    } else if (['cancelled', 'unavailable', 'invalid', 'busy'].includes(message.status)) {
      clearTimeout(timeout);
      transfer.pending = null;
      reject(fail(message.status));
    }
  }

  function exchange(job, request, status, offset, timeout = timeoutMs) {
    return new Promise((resolve, reject) => {
      if (!port) {
        reject(fail('unavailable'));
        return;
      }
      const timer = timeout ? setTimeout(() => {
        job.pending = null;
        reject(fail('unavailable'));
      }, timeout) : null;
      job.pending = { status, offset, resolve, reject, timeout: timer };
      if (!request) return;
      try {
        port.postMessage(JSON.stringify({ id: job.id, ...request }));
      } catch {
        clearTimeout(timer);
        job.pending = null;
        reject(fail('unavailable'));
      }
    });
  }

  function abort(job) {
    if (job.pending) {
      clearTimeout(job.pending.timeout);
      job.pending.reject(fail('cancelled'));
      job.pending = null;
    }
    try {
      port?.postMessage(JSON.stringify({ id: job.id, type: 'abort' }));
    } catch {
      // Navigation can close the channel before the abort is delivered.
    }
  }

  window.addEventListener('message', attach, true);
  window.addEventListener('pagehide', () => {
    if (transfer) abort(transfer);
    port?.close();
    port = null;
  });

  return async function saveAndroidSmilePack(blob, filename) {
    if (transfer) throw fail('busy');
    if (!(blob instanceof Blob) || blob.size < 10 || blob.size > maxBytes) throw fail('invalid');
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)),
      byte => byte.toString(16).padStart(2, '0')).join('');
    const safeFilename = filename.replace(/[\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '_');
    const job = { id, pending: null };
    transfer = job;
    try {
      await exchange(job, { type: 'begin', filename: safeFilename, size: blob.size }, 'ready', 0);
      for (let offset = 0; offset < blob.size; offset += chunkBytes) {
        const bytes = new Uint8Array(await blob.slice(offset, offset + chunkBytes).arrayBuffer());
        const data = btoa(String.fromCharCode(...bytes));
        await exchange(job, { type: 'chunk', offset, data }, 'chunk', offset + bytes.length);
      }
      await exchange(job, { type: 'finish' }, 'picking', 0);
      await exchange(job, null, 'saved', blob.size, 0);
    } catch (error) {
      abort(job);
      throw error;
    } finally {
      transfer = null;
    }
  };
})();
