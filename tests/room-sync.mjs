// Run: node tests/room-sync.mjs (Node 22+, CHROMIUM and LONETI_FIXTURES optional).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const dump = process.env.LONETI_FIXTURES || join(repo, 'Dumped');
const browser = [
  process.env.CHROMIUM, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(path => path && existsSync(path));
const room = join(dump, 'Guest.html');
const assets = join(dump, 'Guest_files');
const bundle = name => readdirSync(assets).find(file => file === name + '.js' || file.startsWith(name + '.js.'));
if (!browser || !globalThis.WebSocket || !existsSync(room) || !existsSync(assets) ||
    !bundle('mainer') || !bundle('chat')) {
  console.log('SKIP room sync (requires Node 22+, Chromium, and local saved Guest room fixtures)');
  process.exit(0);
}

const native = ['editor/png.js', 'editor/native.js'].map(path => readFileSync(join(repo, path), 'utf8')).join('\n')
  + '\nwindow.fixtureEditor = getNativeEditor; window.fixtureEngine = () => nativeEditorEngine;';
const main = readFileSync(join(assets, bundle('mainer')));
const chat = readFileSync(join(assets, bundle('chat')));
// Only use the editor's element structure. Saved messages, inline scripts,
// attributes containing account data, media, and URLs never reach the fixture.
const structure = readFileSync(room, 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<(script|style|iframe|object)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  .replace(/<(?:meta|link|base|embed)\b[^>]*>/gi, '')
  .replace(/>([^<>]+)</g, '><')
  .replace(/<([\w-]+)\b([^>]*)>/g, (_, element, attributes) => {
    const allowed = attributes.match(/\s(?:class|id|type|data-tool|data-action|data-type-model|lang)=(?:"[^"]*"|'[^']*')/gi);
    return '<' + element + (allowed?.join('') || '') + '>';
  });
const csp = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data:; " +
  "connect-src 'none'; frame-src 'self'; form-action 'none'; base-uri 'none'";
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const member = url.searchParams.get('member') === '456' ? 456 : 123;
  const sources = {
    '/chat': () => structure.replace(/<head>/i, '<head>' +
      '<style>.js--container-work-canvas{width:700px;height:600px}</style>' +
      '<script src="/native.js"></script><script src="/mainer.js"></script>' +
      '<script src="/globals.js?member=' + member + '"></script><script src="/chat.js"></script>'),
    '/globals.js': () => 'Object.assign(window,{id_user:' + member +
      ',id_room:1,auth_hash:"fixture",is_privilege:false,is_sweaper:false,t:key=>key,scriptError:error=>{throw error;}});',
    '/native.js': () => native,
    '/mainer.js': () => main,
    '/chat.js': () => chat,
  };
  if (request.method !== 'GET' || !Object.hasOwn(sources, url.pathname)) return response.writeHead(404).end();
  response.setHeader('Content-Security-Policy', csp);
  response.setHeader('Content-Type', url.pathname === '/chat' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8');
  response.end(sources[url.pathname]());
});

async function regression() {
  async function waitFor(check, message) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await check();
      if (result) return result;
      await new Promise(resolve => setTimeout(resolve, 35));
    }
    throw Error(message);
  }
  function require(condition, message) {
    if (!condition) throw Error(message);
  }
  function ready(frame) {
    const engine = frame.fixtureEngine();
    const id = engine.getIdUser();
    engine.parent_context.socket = { connected: true, io: { engine: { maxPayload: 1000000 } }, emit() {}, open() {} };
    engine.parent_context.is_connect_draw = true;
    engine.addNewUser({ id, vis_name: 'Fixture' });
    engine.users_canvas.getMyUser().events_draw.setDraw();
    return engine;
  }
  const iframe = document.createElement('iframe');
  iframe.src = '/chat?member=456';
  document.body.append(iframe);
  await waitFor(() => window.fixtureEngine?.() && iframe.contentWindow.fixtureEngine?.(), 'Two native room editors did not initialize');
  const sender = ready(window);
  const recipient = ready(iframe.contentWindow);
  const member = sender.getIdUser();
  require(member !== recipient.getIdUser(), 'Expected different synthetic room members');
  recipient.addNewUser({ id: member, vis_name: 'Fixture sender' });
  recipient.draw_users.drawing_actions.startAnimateUserActions();
  const receiverLayer = recipient.list_layers.getLayerOnId(member, recipient.DEFAULT_INDEX_LAYER);
  const api = window.fixtureEditor();
  const { width, height } = api;
  const user = sender.users_canvas.getMyUser();
  const sourceLayer = user.user_layers.getActiveLayer();
  const history = user.states_history;
  const queue = sender.draw_users.send_actions;
  const hash = async bytes => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)).join(',');
  function gradient(start, end) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const paint = ctx.createLinearGradient(20, 30, 1050, 810);
    paint.addColorStop(0, start);
    paint.addColorStop(1, end);
    ctx.fillStyle = paint;
    ctx.fillRect(0, 0, width, height);
    return { pixels: ctx.getImageData(0, 0, width, height), png: canvas.toDataURL('image/png') };
  }
  async function replay(action, expected, eventName) {
    await action();
    const actions = JSON.parse(JSON.stringify(queue.getActionsChat()));
    queue.clearActionsChat();
    require(actions.at(-1)?.event === eventName, 'Expected the native ' + eventName + ' action');
    require(actions.at(-1).data?.data?.image_src?.length < 1000000, 'Native action did not use a compact PNG');
    await recipient.draw_users.addDrawActions(member, actions);
    require(await hash(api.readLayer().data) === expected, 'Sender changed the expected pixels');
    await waitFor(async () => await hash(receiverLayer.ctx.getImageData(0, 0, width, height).data) === expected,
      'Unmodified recipient failed to reproduce ' + eventName);
  }

  const original = gradient('#0a9ec3', '#ffd112');
  const next = gradient('#ff0000', '#0c23c8');
  require(original.png.length > 1000000 && next.png.length > 1000000, 'Fixture must need compression on both sides');
  sourceLayer.ctx.putImageData(original.pixels, 0, 0);
  user.events_draw.setDraw();
  await recipient.drawBase64Layer(member, original.png);
  await replay(() => api.commitLayer(next.pixels), await hash(next.pixels.data), 'history_repeat');
  await replay(() => sender.history_actions.actionHistoryAbort(), await hash(original.pixels.data), 'history_abort');
  await replay(() => sender.history_actions.actionHistoryRepeat(), await hash(next.pixels.data), 'history_repeat');

  const noise = new ImageData(width, height);
  for (let i = 0; i < noise.data.length; i += 65536) crypto.getRandomValues(noise.data.subarray(i, i + 65536));
  for (let i = 3; i < noise.data.length; i += 4) noise.data[i] = 255;
  sourceLayer.ctx.putImageData(noise, 0, 0);
  user.events_draw.setDraw();
  const before = history.getCurrentState();
  const cursor = history.current_index;
  const pending = queue.getActionsChat().length;
  const pixelHash = await hash(api.readLayer().data);
  try {
    await api.commitLayer(new ImageData(width, height));
    throw Error('Expected incompressible Undo to prevent the edit');
  } catch (error) {
    require(error.editorCode === 'roomLimit', 'Expected roomLimit for incompressible Undo');
  }
  require(history.getCurrentState() === before && history.current_index === cursor &&
    queue.getActionsChat().length === pending && await hash(api.readLayer().data) === pixelHash,
  'Rejected edit changed pixels, history, or outgoing actions');
  return true;
}

const profile = mkdtempSync(join(tmpdir(), 'loneti-room-sync-'));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const chrome = spawn(browser, ['--headless', '--disable-background-networking', '--disable-component-update',
  '--disable-gpu', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore', windowsHide: true });
let socket;
const timeout = setTimeout(() => { socket?.close(); chrome.kill(); server.close(); process.exitCode = 1; }, 25000);
try {
  const portFile = join(profile, 'DevToolsActivePort');
  for (let attempt = 0; !existsSync(portFile) && attempt < 90; attempt++) await delay(50);
  const port = readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
  const target = (await fetch('http://127.0.0.1:' + port + '/json/list').then(response => response.json()))
    .find(tab => tab.type === 'page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  function command(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      function receive(event) {
        const message = JSON.parse(event.data);
        if (message.id !== id) return;
        socket.removeEventListener('message', receive);
        if (message.error) reject(Error(message.error.message));
        else resolve(message.result);
      }
      socket.addEventListener('message', receive);
      socket.addEventListener('close', () => reject(Error('Chromium disconnected')), { once: true });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  await command('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/chat' });
  // Give navigation time to switch from about:blank to the fixture realm.
  await delay(500);
  const result = await command('Runtime.evaluate', {
    expression: '(' + regression.toString() + ')()', awaitPromise: true, returnByValue: true,
  });
  if (result.result?.value !== true) throw Error(result.exceptionDetails?.exception?.description || 'Room regression failed');
  console.log('PASS compact room replay, native Undo/Redo, and over-limit rollback');
} finally {
  clearTimeout(timeout);
  socket?.close();
  const exited = new Promise(resolve => chrome.exitCode === null && chrome.signalCode === null ? chrome.once('close', resolve) : resolve());
  chrome.kill();
  server.close();
  await exited;
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch { /* Chromium helpers may still be exiting. */ }
}
