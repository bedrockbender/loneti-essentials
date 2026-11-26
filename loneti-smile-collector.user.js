// ==UserScript==
// @name         Loneti essentials
// @namespace    loneti-smile-collector
// @version      3.1.0
// @homepageURL  https://bedrockbender.github.io/loneti-smile-collector/
// @downloadURL  https://bedrockbender.github.io/loneti-smile-collector/loneti-smile-collector.user.js
// @updateURL    https://bedrockbender.github.io/loneti-smile-collector/loneti-smile-collector.user.js
// @icon         https://bedrockbender.github.io/loneti-smile-collector/icon.svg
// @description  Draw with polygon and color selections and custom gradients. Collect Smiles and share named packs.
// @description:ru Собирайте смайлы и делитесь наборами. Рисуйте с помощью выделения по многоугольнику и цвету и собственных градиентов.
// @match        https://loneti.art/draw*
// @match        https://loneti.ru/draw*
// @match        https://loneti.art/pict*
// @match        https://loneti.art/chat*
// @match        https://loneti.ru/pict*
// @match        https://loneti.ru/chat*
// @match        https://loneti.art/settings*
// @match        https://loneti.ru/settings*
// @grant        none
// @noframes
// @sandbox      raw
// @run-at       document-start
// ==/UserScript==

// BEGIN bundled drawing tools
(() => {
'use strict';
// Lossless fallback for native room snapshots too large for Engine.IO.
const roomPngCrcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});

function roomPngChunk(type, payload) {
  const result = new Uint8Array(payload.length + 12);
  const view = new DataView(result.buffer);
  view.setUint32(0, payload.length);
  result.set(new TextEncoder().encode(type), 4);
  result.set(payload, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < result.length - 4; i++) crc = (crc >>> 8) ^ roomPngCrcTable[(crc ^ result[i]) & 255];
  view.setUint32(result.length - 4, crc ^ 0xffffffff);
  return result;
}

function roomPngDataUrl(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return 'data:image/png;base64,' + btoa(binary);
}

function roomPngScanlines(pixels) {
  const { data, width, height } = pixels;
  let channels = 3;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) { channels = 4; break; }
  }
  const stride = width * channels;
  const scanlines = new Uint8Array(height * (stride + 1));
  const sub = new Uint8Array(stride);
  const up = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    let subScore = 0;
    let upScore = 0;
    for (let x = 0; x < width; x++) {
      const source = (y * width + x) * 4;
      for (let channel = 0; channel < channels; channel++) {
        const i = x * channels + channel;
        const pixel = source + channel;
        const horizontal = data[pixel] - (x ? data[pixel - 4] : 0);
        const vertical = data[pixel] - (y ? data[pixel - width * 4] : 0);
        sub[i] = horizontal;
        up[i] = vertical;
        subScore += Math.abs(horizontal);
        upScore += Math.abs(vertical);
      }
    }
    const offset = y * (stride + 1);
    scanlines[offset] = subScore <= upScore ? 1 : 2;
    scanlines.set(subScore <= upScore ? sub : up, offset + 1);
  }
  return { scanlines, channels };
}

async function compactRoomPng(pixels) {
  if (typeof CompressionStream !== 'function') return null;
  const { scanlines, channels } = roomPngScanlines(pixels);
  const compressed = new Blob([scanlines]).stream().pipeThrough(new CompressionStream('deflate'));
  const imageBytes = new Uint8Array(await new Response(compressed).arrayBuffer());
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, pixels.width);
  view.setUint32(4, pixels.height);
  header[8] = 8;
  header[9] = channels === 3 ? 2 : 6;
  const blob = new Blob([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    roomPngChunk('IHDR', header),
    roomPngChunk('IDAT', imageBytes),
    roomPngChunk('IEND', new Uint8Array()),
  ], { type: 'image/png' });
  return { blob, dataUrl: roomPngDataUrl(new Uint8Array(await blob.arrayBuffer())) };
}

// LONETI constructs the editor in a private bundle closure before DOM-ready handlers run.
// Observe that one initialization field in the page realm, then immediately restore Object.prototype.
let nativeEditorEngine;
const nativeEditorField = 'transform_canvas';
const nativeEditorRoute = /^\/(?:draw|chat)(?:\/|$)/.test(location.pathname) ||
  (location.pathname === '/settings' && ['smile', 'avatar'].includes(new URLSearchParams(location.search).get('new')));

function observeNativeEditor() {
  const prototype = Object.prototype;
  if (!nativeEditorRoute || Object.hasOwn(prototype, nativeEditorField)) return;
  const stop = () => {
    if (Object.getOwnPropertyDescriptor(prototype, nativeEditorField)?.set === observeAssignment) {
      delete prototype[nativeEditorField];
    }
  };
  function observeAssignment(value) {
    Object.defineProperty(this, nativeEditorField, {
      value, writable: true, enumerable: true, configurable: true,
    });
    if (typeof this.realCoords === 'function' &&
        typeof this.drawing_area?.getContainerWork === 'function' &&
        typeof this.users_canvas?.getMyUser === 'function' &&
        typeof this.layer_actions?.checkLockLayer === 'function' &&
        typeof value?.coordsToDisplay === 'function' &&
        typeof value.transform?.getInverted === 'function') {
      nativeEditorEngine = this;
      stop();
    }
  }
  Object.defineProperty(prototype, nativeEditorField, {
    set: observeAssignment, configurable: true,
  });
  document.addEventListener('DOMContentLoaded', () => {
    if (!document.querySelector('.js--work-canvas')) stop();
  }, { once: true });
  // A chat may be text-only. Never retain an observer indefinitely on such a page.
  setTimeout(stop, 60000);
}

observeNativeEditor();

function nativeEditorMode(engine) {
  if (engine.key_storage === 'smile' || engine.key_storage === 'avatar') return engine.key_storage;
  return engine.DEFAULT_INDEX_LAYER !== undefined && engine.parent_context ? 'room' : 'drawing';
}

function nativeEditorRoom(engine, mode) {
  if (mode === 'room') return engine.parent_context;
  if (mode === 'drawing' && engine.getIdCanvas?.()) return engine.msg_chat;
  return null;
}

function editorFailure(code) {
  const error = new Error(code);
  error.editorCode = code;
  return error;
}

function activeNativeLayer(engine) {
  const user = engine?.users_canvas.getMyUser();
  const layer = user?.user_layers?.getActiveLayer();
  return { user, layer };
}

function checkNativeEdit(engine, user, layer, canvas, width, height, mode) {
  const current = activeNativeLayer(engine);
  if (current.user !== user || current.layer !== layer ||
      layer.$layer !== canvas || canvas.width !== width || canvas.height !== height) {
    throw editorFailure('layerChanged');
  }
  const index = layer.index;
  const id = user.getIdUser();
  if (typeof user.checkMyUser !== 'function' || !user.checkMyUser() ||
      engine.list_layers.getLayerOnId(id, index) !== layer ||
      layer.params?.hide || engine.layer_actions.checkLockLayer(id, index) ||
      user.user_events?.getIsLock?.()) {
    throw editorFailure('layerUnavailable');
  }
  const tool = user.tools_draw?.getCurTool?.();
  if (tool?.is_draw?.start && !tool.is_draw.finish || tool?.checkTransformLayer?.()) {
    throw editorFailure('editorBusy');
  }
  const room = nativeEditorRoom(engine, mode);
  const sender = engine.draw_users?.send_actions;
  if (room && (!id || !room.is_connect_draw || !room.socket?.connected ||
      typeof sender?.getActionsChat !== 'function' ||
      typeof engine.history_actions?.actionHistoryRepeat !== 'function' ||
      typeof user.states_history?.getStateRepeat !== 'function' ||
      (mode === 'room' && index !== engine.DEFAULT_INDEX_LAYER))) {
    throw editorFailure('roomUnavailable');
  }
  return room;
}

// Socket.IO 4 documents this server default when its Engine.IO handshake
// does not provide a usable maxPayload.
const nativeEditorDefaultMaxPayload = 1_000_000;
const nativeEditorContours = new WeakMap();
const nativeEditorOutlineRenderers = new WeakSet();
const nativeEditorCompactSnapshots = new WeakMap();

function installNativeOutlineRenderer(tool) {
  if (nativeEditorOutlineRenderers.has(tool)) return;
  const drawLines = tool.drawLines;
  tool.drawLines = function (points) {
    const contours = nativeEditorContours.get(points);
    if (!contours || !this.user_context.checkMyUser()) return drawLines.call(this, points);
    this.clearCanvas();
    for (const contour of contours) {
      const scaled = this.scalePointsSelection(contour);
      this.drawColorLines(scaled, 8, 0, 'rgba(0,0,0,1)');
      this.drawColorLines(scaled, 8, -8, 'rgba(255,255,255,1)');
    }
  };
  nativeEditorOutlineRenderers.add(tool);
}

function checkNativeRoomSnapshot(engine, room, user, layer, imageUrl, points, toolName, undo = false) {
  const socket = room.socket;
  const advertised = socket.io?.engine?.maxPayload;
  const maxPayload = Number.isSafeInteger(advertised) && advertised > 0
    ? advertised : nativeEditorDefaultMaxPayload;
  if (imageUrl.length > maxPayload) throw editorFailure('roomLimit');

  // Measure the real UTF-8 JSON shape before changing pixels. The native
  // sender can batch pending strokes with the history state in one packet.
  // Undo is a future action. Its snapshot must fit in a fresh native batch.
  const actions = undo ? [] : engine.draw_users.send_actions.getActionsChat();
  const state = {
    type_state: user.states_history.STATE_DRAW,
    data: { index_layer: layer.index, image: {}, image_src: imageUrl,
      points_selection: points || undefined, tool_selection: toolName },
  };
  const frame = JSON.stringify(['actions', {
    id_canvas: engine.getIdCanvas?.() || undefined,
    actions: [...actions, ...(!points ? [{ event: 'reset_selection' }] : []),
      { event: undo ? 'history_abort' : 'history_repeat', data: state }],
  }]);
  // Prefix packet type, namespace and Engine.IO framing just as the site does.
  const bytes = new TextEncoder().encode(frame).length + new TextEncoder().encode(socket.nsp || '/').length + 8;
  if (bytes > maxPayload) {
    throw editorFailure('roomLimit');
  }
}

function nativeRoomSnapshotFits(...args) {
  try {
    checkNativeRoomSnapshot(...args);
    return true;
  } catch (error) {
    if (error.editorCode !== 'roomLimit') throw error;
    return false;
  }
}

function setNativeCompactSnapshot(snapshot, layerCanvas, compact) {
  const nativeDataUrl = snapshot.toDataURL;
  const nativeBlob = snapshot.toBlob;
  Object.defineProperties(snapshot, {
    toDataURL: {
      value(type, ...options) {
        return !type || type === 'image/png'
          ? compact.dataUrl : nativeDataUrl.call(this, type, ...options);
      },
    },
    toBlob: {
      value(callback, type, ...options) {
        if (!type || type === 'image/png') queueMicrotask(() => callback(compact.blob));
        else nativeBlob.call(this, callback, type, ...options);
      },
    },
  });
  nativeEditorCompactSnapshots.set(snapshot, { compact, layerCanvas });
}

function recordNativeEditorDraw(user, history, compact) {
  if (!compact) {
    user.events_draw.setDraw();
    return;
  }
  // Native Redo uses image.toDataURL() on the history canvas each time.
  // The room's checkpoint also calls toBlob() on that same snapshot.
  const descriptor = Object.getOwnPropertyDescriptor(history, 'createStateCanvas');
  const createStateCanvas = history.createStateCanvas;
  Object.defineProperty(history, 'createStateCanvas', {
    configurable: true,
    value: function (layerCanvas) {
      const snapshot = createStateCanvas.call(this, layerCanvas);
      setNativeCompactSnapshot(snapshot, layerCanvas, compact);
      return snapshot;
    },
  });
  try {
    user.events_draw.setDraw();
  } finally {
    if (descriptor) Object.defineProperty(history, 'createStateCanvas', descriptor);
    else delete history.createStateCanvas;
  }
}

function existingNativeCompactSnapshot(history, layer) {
  const state = history.getCurrentState();
  if (state?.type_state !== history.STATE_DRAW || state.data?.index_layer !== layer.index) return null;
  const image = state.data.image;
  const entry = nativeEditorCompactSnapshots.get(image);
  const canvas = layer.$layer;
  if (!entry || entry.layerCanvas !== canvas || image.width !== canvas.width || image.height !== canvas.height) return null;
  const saved = image.getContext('2d').getImageData(0, 0, image.width, image.height).data;
  const current = layer.ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return current.some((byte, index) => byte !== saved[index]) ? null : entry.compact;
}

function nativeEditorPublishHistory(engine, user, history) {
  const state = history.getCurrentState();
  const cursor = history.current_index;
  if (state?.type_state !== history.STATE_DRAW || !Number.isInteger(cursor)) {
    throw editorFailure('editorUnavailable');
  }
  const contours = nativeEditorContours.get(user.events_draw.getSelectionPoints());
  // Replay the new, already-recorded native edit through the same action as
  // the Redo button. No Undo is emitted, and the native history remains at
  // the new state so the edit is one step for the user.
  history.current_index = cursor - 1;
  try {
    if (history.getStateRepeat() !== state) throw editorFailure('editorUnavailable');
    engine.history_actions.actionHistoryRepeat();
  } finally {
    history.current_index = cursor;
  }
  const points = user.events_draw.getSelectionPoints();
  if (contours && points) {
    const lasso = user.tools_draw.getToolByName('lasso').tool;
    nativeEditorContours.set(points, contours);
    lasso.drawLines(points);
  }
}

function getNativeEditor() {
  const engine = nativeEditorEngine;
  if (!engine?.transform_canvas?.transform) return null;
  const surface = engine.drawing_area.getContainerWork();
  const { user, layer } = activeNativeLayer(engine);
  const canvas = layer?.$layer;
  if (!surface?.isConnected || !canvas?.width || !canvas.height ||
      typeof layer.ctx?.getImageData !== 'function' ||
      typeof user.events_draw?.setDraw !== 'function') return null;
  const width = canvas.width;
  const height = canvas.height;
  const mode = nativeEditorMode(engine);
  const ensureEdit = () => checkNativeEdit(engine, user, layer, canvas, width, height, mode);
  const history = user.states_history;

  return {
    canvas, layerKey: canvas, surface, mode, width, height,
    clientToCanvas(clientX, clientY) {
      const rect = surface.getBoundingClientRect();
      return engine.transform_canvas.transform.getInverted().getTransformedPoint({
        x: clientX - rect.left, y: clientY - rect.top,
      });
    },
    canvasToClient(x, y) {
      const rect = surface.getBoundingClientRect();
      const point = engine.transform_canvas.coordsToDisplay({ x, y });
      return { x: point.x + rect.left, y: point.y + rect.top };
    },
    readLayer() {
      ensureEdit();
      return layer.ctx.getImageData(0, 0, width, height);
    },
    async commitLayer(imageData) {
      const room = ensureEdit();
      if (!(imageData instanceof ImageData) || imageData.width !== width || imageData.height !== height) {
        throw editorFailure('layerChanged');
      }
      const previous = history.getCurrentState();
      const priorDraw = previous?.type_state === history.STATE_DRAW && previous.data?.index_layer === layer.index
        && previous.data.image?.width === width && previous.data.image.height === height
        ? previous.data : null;
      let compact;
      let compactUndo;
      if (room) {
        const copy = document.createElement('canvas');
        copy.width = width;
        copy.height = height;
        const context = copy.getContext('2d');
        context.putImageData(imageData, 0, 0);
        const points = user.events_draw.getSelectionPoints?.();
        const toolName = user.events_draw.getNameSelectionTool?.();
        const undoImage = priorDraw?.image || history.createStateCanvas(canvas);
        const undoPoints = priorDraw ? priorDraw.points_selection : points;
        const undoTool = priorDraw ? priorDraw.tool_selection : toolName;
        const undoCompact = nativeEditorCompactSnapshots.get(undoImage)?.compact;
        const undoUrl = undoCompact?.dataUrl || priorDraw?.image_src || undoImage.toDataURL('image/png');
        const nextUrl = copy.toDataURL('image/png');
        const canUndo = nativeRoomSnapshotFits(engine, room, user, layer, undoUrl, undoPoints, undoTool, true);
        const canApply = nativeRoomSnapshotFits(engine, room, user, layer, nextUrl, points, toolName);
        if (!canUndo || !canApply) {
          // A previously compacted native snapshot is already our best
          // encoding. Changing transport budgets can make that Undo unsafe.
          if (!canUndo && undoCompact) throw editorFailure('roomLimit');
          const cursor = history.current_index;
          const socket = room.socket;
          const connectionId = socket.id;
          const transport = socket.io?.engine;
          const selection = JSON.stringify(points);
          const baseline = layer.ctx.getImageData(0, 0, width, height).data;
          // Read the exact canonical pixels from the browser's canvas rather
          // than the caller's potentially non-canonical transparent pixels.
          const candidate = canApply ? null : context.getImageData(0, 0, width, height);
          [compact, compactUndo] = await Promise.all([
            candidate ? compactRoomPng(candidate) : null,
            canUndo ? null : compactRoomPng(undoImage.getContext('2d').getImageData(0, 0, width, height)),
          ]);
          if (ensureEdit() !== room || room.socket !== socket || socket.id !== connectionId ||
              socket.io?.engine !== transport) throw editorFailure('roomUnavailable');
          if (history.getCurrentState() !== previous || history.current_index !== cursor ||
              JSON.stringify(user.events_draw.getSelectionPoints?.()) !== selection ||
              user.events_draw.getNameSelectionTool?.() !== toolName ||
              layer.ctx.getImageData(0, 0, width, height).data.some((byte, index) => byte !== baseline[index])) {
            throw editorFailure('layerChanged');
          }
          checkNativeRoomSnapshot(engine, room, user, layer, compactUndo?.dataUrl || undoUrl, undoPoints, undoTool, true);
          checkNativeRoomSnapshot(engine, room, user, layer, compact?.dataUrl || nextUrl, points, toolName);
          // Keep the asynchronously committed pixels independent of the
          // caller's ImageData after its native snapshot has been planned.
          imageData = candidate || context.getImageData(0, 0, width, height);
        }
      }
      if (!priorDraw) history.save(history.STATE_DRAW, null);
      if (compactUndo) {
        const undoState = history.getCurrentState();
        setNativeCompactSnapshot(undoState.data.image, canvas, compactUndo);
      }
      layer.ctx.putImageData(imageData, 0, 0);
      engine.layer_actions.savePreviewLayer(user.getIdUser(), layer.index);
      engine.updateArtCanvas(true);
      // This is the native end-of-draw operation. It updates undo and the
      // normal local draft pipeline, and persists the room layer on its editor.
      recordNativeEditorDraw(user, history, compact);
      if (room) nativeEditorPublishHistory(engine, user, history);
      // Native Save can open its preview before the next animation frame.
      engine.art_canvas.renderLayers();
    },
    setSelection(mask, maskWidth = width, maskHeight = height) {
      const room = ensureEdit();
      if (maskWidth !== width || maskHeight !== height) throw editorFailure('layerChanged');
      const lasso = user.tools_draw?.getToolByName?.('lasso')?.tool;
      if (!lasso || typeof lasso.drawLines !== 'function') return false;
      const outline = mask ? nativeEditorSelectionOutline(mask, width, height) : null;
      let points = outline?.points;
      let compact;
      if (room && points) {
        compact = existingNativeCompactSnapshot(history, layer);
        try {
          checkNativeRoomSnapshot(engine, room, user, layer, compact?.dataUrl || canvas.toDataURL('image/png'), points, 'lasso');
        } catch (error) {
          if (error.editorCode !== 'roomLimit') throw error;
          points = null;
        }
      }
      if (user.events_draw.getSelectionPoints()) engine.hotkeyClearSelection();
      if (points?.length) {
        installNativeOutlineRenderer(lasso);
        nativeEditorContours.set(points, outline.contours);
        user.events_draw.setSelectionPoints('lasso', points);
        lasso.drawLines(points);
      }
      engine.updateArtCanvas(true);
      if (room && points) {
        // Match a normal native lasso completion so remote brush replay
        // receives the same clip before any new stroke.
        recordNativeEditorDraw(user, history, compact);
        nativeEditorPublishHistory(engine, user, history);
      }
      return mask === null || Boolean(points);
    },
    selectionKey() {
      const { layer: currentLayer } = activeNativeLayer(engine);
      return currentLayer === layer ? user.events_draw.getSelectionPoints?.() || null : null;
    },
    readSelection() {
      const points = this.selectionKey();
      if (!points || points.length < 3) return null;
      const buffer = document.createElement('canvas');
      buffer.width = width;
      buffer.height = height;
      const ctx = buffer.getContext('2d');
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.fill();
      const rgba = ctx.getImageData(0, 0, width, height).data;
      const result = new Uint8Array(width * height);
      for (let i = 0; i < result.length; i++) result[i] = rgba[i * 4 + 3] >= 128 ? 1 : 0;
      return result;
    },
  };
}

// Trace directed cell edges, with the selected pixel always on the right.
// Hole outlines then have opposite winding. Double back over each bridge
// so disconnected outlines can share the site's single nonzero-winding path.
function nativeEditorSelectionOutline(mask, width, height) {
  if (mask.length !== width * height) return null;
  const stride = width + 1;
  const edges = new Map();
  const deltas = [1, stride, -1, -stride];
  let edgeCount = 0;
  const add = (vertex, direction) => {
    edges.set(vertex, (edges.get(vertex) || 0) | (1 << direction));
    return ++edgeCount <= 24000;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      const tl = y * stride + x;
      const tr = tl + 1;
      const bl = tl + stride;
      const br = bl + 1;
      if ((y === 0 || !mask[i - width]) && !add(tl, 0) ||
          (x === width - 1 || !mask[i + 1]) && !add(tr, 1) ||
          (y === height - 1 || !mask[i + width]) && !add(br, 2) ||
          (x === 0 || !mask[i - 1]) && !add(bl, 3)) return null;
    }
  }
  if (!edges.size) return null;

  const contours = [];
  let pointCount = 0;
  while (edges.size) {
    const start = edges.keys().next().value;
    let current = start;
    let previousDirection = 0;
    const contour = [];
    do {
      const outgoing = edges.get(current);
      if (!outgoing) return null;
      const direction = [1, 0, 3, 2].map(turn => (previousDirection + turn) % 4)
        .find(next => outgoing & (1 << next));
      if (direction !== previousDirection || !contour.length) {
        contour.push({ x: current % stride, y: Math.floor(current / stride) });
      }
      const remaining = outgoing & ~(1 << direction);
      if (remaining) edges.set(current, remaining);
      else edges.delete(current);
      previousDirection = direction;
      current += deltas[direction];
    } while (current !== start);
    contour.push(contour[0]);
    pointCount += contour.length + 1;
    if (pointCount > 4096) return null;
    contours.push(contour);
  }
  const points = contours[0].slice();
  for (let i = 1; i < contours.length; i++) points.push(...contours[i], points[0]);
  return { points, contours };
}

// Vertex coordinates belong to the drawing, including points outside its bounds.
// Intersect scanlines through pixel centres with every edge before clipping spans.
function polygonMask(width, height, vertices) {
  const mask = new Uint8Array(width * height);
  if (vertices.length < 3) return mask;
  const edges = [];
  for (let i = 0; i < vertices.length; i++) {
    let a = vertices[i], b = vertices[(i + 1) % vertices.length];
    if (a.y === b.y) continue;
    if (a.y > b.y) [a, b] = [b, a];
    edges.push({ x: a.x, y: a.y, end: b.y, slope: (b.x - a.x) / (b.y - a.y) });
  }
  for (let y = 0; y < height; y++) {
    const sampleY = y + 0.5;
    const crossings = [];
    for (const edge of edges) {
      if (sampleY >= edge.y && sampleY < edge.end) crossings.push(edge.x + (sampleY - edge.y) * edge.slope);
    }
    crossings.sort((a, b) => a - b);
    for (let i = 1; i < crossings.length; i += 2) {
      const left = Math.max(0, Math.ceil(crossings[i - 1] - 0.5));
      const right = Math.min(width, Math.ceil(crossings[i] - 0.5));
      if (right > left) mask.fill(1, y * width + left, y * width + right);
    }
  }
  return mask;
}

function wandMask(image, point, tolerance, contiguous) {
  const { width, height, data } = image;
  const x = Math.floor(point.x), y = Math.floor(point.y);
  const mask = new Uint8Array(width * height);
  if (x < 0 || y < 0 || x >= width || y >= height) return mask;
  const seed = y * width + x;
  const alpha = data[seed * 4 + 3];
  const reference = [0, 1, 2].map(k => data[seed * 4 + k] * alpha);
  function matches(i) {
    const offset = i * 4, a = data[offset + 3];
    if (Math.abs(a - alpha) > tolerance) return false;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(data[offset + k] * a - reference[k]) > 255 * tolerance) return false;
    }
    return true;
  }
  if (!contiguous) {
    for (let i = 0; i < mask.length; i++) if (matches(i)) mask[i] = 1;
    return mask;
  }
  const queue = new Int32Array(mask.length);
  let count = 1;
  queue[0] = seed;
  mask[seed] = 1;
  function visit(i) {
    if (!mask[i] && matches(i)) {
      mask[i] = 1;
      queue[count++] = i;
    }
  }
  for (let head = 0; head < count; head++) {
    const i = queue[head], column = i % width;
    if (column > 0) visit(i - 1);
    if (column + 1 < width) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i + width < mask.length) visit(i + width);
  }
  return mask;
}

function combineMasks(previous, next, operation) {
  if (!previous || operation === 'replace') return next;
  for (let i = 0; i < next.length; i++) {
    if (operation === 'add') next[i] |= previous[i];
    else if (operation === 'subtract') next[i] = previous[i] & (1 - next[i]);
    else next[i] &= previous[i];
  }
  return next;
}

function drawingCanvas(width, height) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

function maskTexture(mask, width, height, outline) {
  const canvas = drawingCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  const rgba = image.data;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = i % width, y = Math.floor(i / width);
    if (outline && x && x + 1 < width && y && y + 1 < height &&
        mask[i-1] && mask[i+1] && mask[i-width] && mask[i+width]) continue;
    const light = ((x + y) & 4) !== 0;
    rgba[i*4] = light ? 255 : 15;
    rgba[i*4+1] = light ? 255 : 78;
    rgba[i*4+2] = light ? 255 : 73;
    rgba[i*4+3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function gradientPaint(ctx, type, a, b, stops) {
  const gradient = type === 'radial'
    ? ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, Math.max(0.001, Math.hypot(b.x-a.x, b.y-a.y)))
    : ctx.createLinearGradient(a.x, a.y, b.x, b.y);
  for (const stop of stops) gradient.addColorStop(stop.at / 100, stop.color);
  return gradient;
}

function maskedPaint(source, mask, paint, erase) {
  const canvas = drawingCanvas(source.width, source.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!erase) {
    ctx.fillStyle = paint(ctx);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // Retain every unselected byte, including hidden colour in transparent pixels.
  const original = new Uint32Array(source.data.buffer, source.data.byteOffset, source.data.length / 4);
  const result = new Uint32Array(pixels.data.buffer);
  if (mask) for (let i = 0; i < mask.length; i++) if (!mask[i]) result[i] = original[i];
  return pixels;
}

const OVERLAY_TEMPLATE = `
<style>
canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;pointer-events:none}
[role=status]{position:absolute;top:8px;left:50%;transform:translateX(-50%);width:max-content;max-width:calc(100% - 32px);box-sizing:border-box;background:#fff;color:#262626;border:1px solid #bcbcbc;border-radius:5px;box-shadow:0 2px 8px #0002;padding:5px 9px;font:13px/1.4 system-ui,sans-serif;pointer-events:none}
</style>
<canvas tabindex="-1" aria-hidden="true"></canvas>
<div role="status" hidden></div>`;

const OPTIONS_TEMPLATE = `
<style>
:host{display:block;font:13px/1.4 system-ui,sans-serif;color:#303030;text-align:left}
:host([hidden]){display:none}
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
.bar,.row{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.bar{justify-content:space-between;margin-bottom:6px}
button,select,input{font:inherit}
button,select{min-height:30px;border-radius:4px;border:1px solid #bcbcbc;background:white;color:#303030;padding:3px 7px;cursor:pointer}
button:hover:enabled{background:#f4f4f4;border-color:#888}
button:disabled{opacity:.45;cursor:default}
button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #126253;outline-offset:2px}
.block{margin-top:8px;padding-top:8px;border-top:1px solid #ccc}
.pair{display:flex;align-items:center;justify-content:space-between;gap:8px}
.pair+label,.pair+.pair,.row+.pair,.pair+.row{margin-top:6px}
.pair input[type=range]{flex:1;min-width:55px;max-width:125px}
.pair input[type=color],.row input[type=color]{width:40px;height:33px;padding:2px;cursor:pointer}
.pair select{min-width:0;max-width:65%}
p{margin:5px 0}
[data-rail]{height:23px;position:relative;border:1px solid #a4afa6;margin:10px 10px 14px;cursor:crosshair}
[data-rail] button{position:absolute;top:10px;transform:translateX(-50%);width:17px;min-height:19px;padding:0;border:2px solid white;border-radius:7px;box-shadow:0 0 0 1px #345}
[data-rail] button[aria-pressed=true]{outline:2px solid #18352c;outline-offset:2px}
[data-use]{display:none}
@media(max-width:1000px){[data-use]{display:inline-block}}
</style>
<section class="panel">
 <div class="bar">
  <strong data-active></strong>
  <button type="button" data-end data-ru="Выйти">Exit tool</button>
 </div>
 <button type="button" data-use data-ru="Перейти к холсту">Return to canvas</button>
 <div class="row" data-polygon-options hidden>
  <button type="button" hidden data-back data-ru="Шаг назад">Undo point</button>
  <button type="button" hidden data-finish data-ru="Готово">Finish</button>
 </div>
  <label class="pair" data-combine-label><span data-ru="Выделение">Selection</span>
   <select data-combine>
    <option value="replace" data-ru="Заменить">Replace</option>
    <option value="add" data-ru="Добавить">Add</option>
    <option value="subtract" data-ru="Вычесть">Subtract</option>
    <option value="intersect" data-ru="Пересечь">Intersect</option>
   </select>
  </label>
  <div class="block" data-wand-options hidden>
   <p data-ru="Коснитесь цвета на активном слое. Допуск можно менять после выбора.">Tap a color on the active layer. You can adjust the tolerance after picking.</p>
   <label class="pair"><span data-ru="Допуск">Tolerance</span><input data-tolerance type="range" min="0" max="255" value="24"><output data-tolerance-value>24</output></label>
   <label><input data-contiguous type="checkbox" checked><span data-ru="Только смежные пиксели">Contiguous pixels only</span></label>
  </div>
  <div class="block" data-gradient-options hidden>
   <p data-ru="Проведите линию от начала градиента до его конца.">Drag from the start of the gradient to its end.</p>
   <label class="pair"><span data-ru="Вид">Type</span><select data-kind><option value="linear" data-ru="Линейный">Linear</option><option value="radial" data-ru="Радиальный">Radial</option></select></label>
   <label class="pair"><span data-ru="Пресет">Preset</span><select data-preset></select></label>
   <div data-rail></div>
   <label class="pair"><span data-ru="Цвет точки">Stop color</span><input data-stop-color type="color"></label>
   <label class="pair"><span data-ru="Положение">Position</span><input data-position type="range" min="0" max="100"><output data-stop-value></output></label>
   <div class="row"><button data-add-stop data-ru="Добавить точку">Add stop</button><button data-remove data-ru="Удалить точку">Remove stop</button></div>
   <div class="block row"><button data-save-preset data-ru="Сохранить пресет">Save preset</button><button data-rename-preset data-ru="Переименовать">Rename</button><button data-delete-preset data-ru="Удалить">Delete</button></div>
  </div>
  <div class="row block" data-selection-actions><label><span data-ru="Цвет заливки">Fill color</span> <input type="color" data-fill-color value="#42764f"></label>
   <button type="button" disabled data-fill data-ru="Залить">Fill selection</button>
   <button type="button" disabled data-erase data-ru="Стереть">Erase selection</button>
   <button type="button" disabled data-clear data-ru="Снять выделение">Deselect</button>
  </div>
</section>
`;

const toolIcons = {
  polygon: '<path d="m4 17 4-13 13 6-4 10Z" stroke-dasharray="2 2"/><g fill="white"><path d="M2.5 15.5h3v3h-3zM6.5 2.5h3v3h-3zM19.5 8.5h3v3h-3zM15.5 18.5h3v3h-3z"/></g>',
  wand: '<path d="m3 19 11-11 2.6 2.6-11 11z" fill="currentColor"/><path d="m12.7 12.5 2.5 2.5" stroke="white"/><path d="m9 3 .6 1.8L11.5 5l-1.9.6L9 7.5l-.6-1.9L6.5 5l1.9-.2ZM18 2l.7 2.3L21 5l-2.3.7L18 8l-.7-2.3L15 5l2.3-.7ZM20 12v4m-2-2h4" stroke-width="1.2"/>',
  gradient: '<defs><linearGradient id="le-tool-ramp" x2="1" y2=".4" gradientUnits="objectBoundingBox"><stop stop-color="#303030"/><stop offset="1" stop-color="white"/></linearGradient></defs><rect x="2" y="4.5" width="20" height="15" rx="1.5" fill="url(#le-tool-ramp)"/>',
};

function createToolButtons(toolbar, tr, chooseTool) {
  const items = [
    ['polygon', tr('Polygon','Многоугольник'), tr('Click to place vertices. Click the first vertex to finish.','Ставьте вершины щелчком. Нажмите на первую, чтобы замкнуть контур.'), 'lasso'],
    ['wand', tr('Magic wand','Волшебная палочка'), tr('Select pixels of a similar color.','Нажмите на цвет, чтобы выделить похожие пиксели.'), 'polygon'],
    ['gradient', tr('Gradient','Градиент'), tr('Drag to blend colors across the layer or selection.','Проведите линию, чтобы растянуть цвета по слою или выделению.'), 'fillbrush'],
  ];
  return items.map(([name, label, hint, after]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'one_tool';
    button.dataset.leTool = name;
    button.title = label + ' — ' + hint;
    button.setAttribute('aria-label', label);
    button.innerHTML = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' + toolIcons[name] + '</svg>';
    button.onclick = event => {
      // The native delegated click handler only knows LONETI's own tool IDs.
      event.stopPropagation();
      chooseTool(name);
    };
    const neighbor = toolbar.querySelector('[data-tool="'+after+'"],[data-le-tool="'+after+'"]');
    if (neighbor) neighbor.after(button);
    else toolbar.append(button);
    return button;
  });
}

const TOOLBAR_STYLE = `
#tools > button[data-le-tool]{appearance:none;box-sizing:inherit;padding:0;color:#383838;display:inline-grid;place-items:center}
#tools > button[data-le-tool] svg{width:80%;height:80%;pointer-events:none}
#tools > button[data-le-tool][aria-pressed=true]{background-color:#d2d2d2;border-color:#999}
#tools > button[data-le-tool]:focus-visible{outline:2px solid #126253;outline-offset:1px}
[data-le-custom-active] .one_tool.active_tool{background-color:#f0f0f0;border-color:#dcdcdc}
#cont_config[data-le-custom-active] > .one_config{display:none}
`;

function gradientEditor(container, tr, notify) {
  const storageKey = 'loneti-essentials:gradients:v1';
  const builtin = [
    { name: tr('Graphite', 'Графит'), type: 'linear', stops: [{ at: 0, color: '#20242c' }, { at: 100, color: '#ffffff' }] },
    { name: tr('Sunset', 'Закат'), type: 'linear', stops: [{ at: 0, color: '#522886' }, { at: 48, color: '#ed6380' }, { at: 100, color: '#ffda84' }] },
    { name: tr('Lagoon', 'Лагуна'), type: 'radial', stops: [{ at: 0, color: '#e3fbc2' }, { at: 40, color: '#68ccd3' }, { at: 100, color: '#284779' }] }
  ];
  const valid = item => item && typeof item.name === 'string' && item.name.trim() &&
    ['linear','radial'].includes(item.type) && Array.isArray(item.stops) && item.stops.length >= 2 &&
    item.stops.every(s => s && Number.isFinite(s.at) && s.at >= 0 && s.at <= 100 && /^#[0-9a-f]{6}$/i.test(s.color));
  let saved = [];
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(stored)) saved = stored.filter(valid);
  } catch { /* Factory presets also work with storage disabled. */ }
  let stops, type, active, chosen = 0;
  function option(value, label) {
    const node = document.createElement('option');
    node.value = value;
    node.textContent = label;
    return node;
  }
  const menu = container.querySelector('[data-preset]');
  const kind = container.querySelector('[data-kind]');
  const rail = container.querySelector('[data-rail]');
  const color = container.querySelector('[data-stop-color]');
  const position = container.querySelector('[data-position]');
  const remove = container.querySelector('[data-remove]');
  const write = (items) => {
    try { localStorage.setItem(storageKey, JSON.stringify(items)); saved = items; return true; }
    catch { notify(tr('Could not save presets on this device.', 'Не удалось сохранить пресеты на устройстве.')); return false; }
  };
  function sort() { return stops.slice().sort((a,b) => a.at - b.at); }
  function draw() {
    rail.style.backgroundImage = 'linear-gradient(to right,' + sort().map(s => s.color + ' ' + s.at + '%').join(',') + ')';
    rail.replaceChildren();
    stops.forEach((stop, index) => {
      const marker = document.createElement('button');
      marker.type = 'button';
      marker.title = stop.at + '% ' + stop.color;
      marker.setAttribute('aria-label', tr('Color stop ', 'Цветовая точка ') + (index + 1) + ', ' + marker.title);
      marker.setAttribute('aria-pressed', String(stop === active));
      marker.style.left = stop.at + '%';
      marker.style.backgroundColor = stop.color;
      marker.addEventListener('click', event => { event.stopPropagation(); active = stop; draw(); color.focus(); });
      rail.append(marker);
    });
    position.value = active.at;
    color.value = active.color;
    remove.disabled = stops.length <= 2;
    container.querySelector('[data-stop-value]').textContent = active.at + '%';
    kind.value = type;
    container.querySelector('[data-delete-preset]').disabled = chosen < builtin.length;
    container.querySelector('[data-rename-preset]').disabled = chosen < builtin.length;
  }
  function open(index) {
    chosen = index;
    const item = [...builtin, ...saved][index];
    type = item.type;
    stops = item.stops.map(s => ({...s}));
    active = stops[0];
    menu.replaceChildren(...[...builtin, ...saved].map((p,i) => option(i,p.name)));
    menu.value = String(index);
    draw();
  }
  function nameInput(initial) {
    const result = window.prompt(tr('Preset name', 'Название пресета'), initial)?.trim();
    return result || '';
  }
  function add(at) {
    const ordered = sort();
    const next = ordered.find(s => s.at > at) || ordered[ordered.length - 1];
    const left = ordered.filter(s => s.at <= at).pop() || ordered[0];
    const f = left.at === next.at ? 0 : Math.max(0,Math.min(1,(at-left.at)/(next.at-left.at)));
    let hex = '#';
    for (const p of [1,3,5]) {
      const a = parseInt(left.color.slice(p,p+2),16), b = parseInt(next.color.slice(p,p+2),16);
      hex += Math.round(a + (b-a)*f).toString(16).padStart(2,'0');
    }
    active = { at, color: hex };
    stops.push(active);
    draw();
  }
  rail.addEventListener('click', event => {
    const box = rail.getBoundingClientRect();
    add(Math.max(0,Math.min(100,Math.round((event.clientX-box.left)*100/box.width))));
  });
  menu.onchange = () => open(Number(menu.value));
  kind.onchange = () => { type = kind.value; };
  color.oninput = () => { active.color = color.value; draw(); };
  position.oninput = () => { active.at = Number(position.value); draw(); };
  container.querySelector('[data-add-stop]').onclick = () => {
    const ordered = [{at:0}, ...sort(), {at:100}];
    let best = 0, mid = 50;
    for (let i = 1; i < ordered.length; i++) {
      const gap = ordered[i].at - ordered[i-1].at;
      if (gap > best) { best = gap; mid = Math.round((ordered[i].at + ordered[i-1].at)/2); }
    }
    add(mid);
  };
  remove.onclick = () => {
    if (stops.length <= 2) return;
    stops.splice(stops.indexOf(active),1);
    active = stops[0];
    draw();
  };
  container.querySelector('[data-save-preset]').onclick = () => {
    const name = nameInput(chosen >= builtin.length ? saved[chosen-builtin.length].name : '');
    if (!name) return;
    if (builtin.some(p => p.name === name)) { notify(tr('Choose a new preset name.', 'Выберите другое название.')); return; }
    let i = saved.findIndex(p => p.name === name);
    if (i >= 0 && !window.confirm(tr('Replace this saved preset?', 'Заменить сохранённый пресет?'))) return;
    if (i < 0) i = saved.length;
    const items = saved.slice();
    items[i] = {name, type, stops:sort()};
    if (write(items)) open(builtin.length+i);
  };
  container.querySelector('[data-rename-preset]').onclick = () => {
    const i = chosen-builtin.length;
    if (!saved[i]) return;
    const name = nameInput(saved[i].name);
    if (!name || name === saved[i].name) return;
    if ([...builtin, ...saved].some(p => p.name === name)) { notify(tr('That name is in use.', 'Такое название уже есть.')); return; }
    const items = saved.slice();
    items[i] = {...items[i], name};
    if (write(items)) { menu.selectedOptions[0].textContent = name; }
  };
  container.querySelector('[data-delete-preset]').onclick = () => {
    const i = chosen-builtin.length;
    if (!saved[i] || !window.confirm(tr('Delete this saved preset?', 'Удалить сохранённый пресет?'))) return;
    if (write(saved.filter((_,id) => id !== i))) open(0);
  };
  open(0);
  return () => ({type, stops:sort()});
}

function installDrawingTools(surface, toolbar, config) {
  const ru = (document.documentElement.lang || (location.hostname.endsWith('.ru') ? 'ru' : 'en')).toLowerCase().startsWith('ru');
  const tr = (en, russian) => ru ? russian : en;
  const host = document.createElement('div');
  host.dataset.lonetiEssentials = 'tools';
  host.style.cssText = 'position:absolute;inset:0;z-index:12;pointer-events:none';
  surface.append(host);
  const overlay = host.attachShadow({mode:'open'});
  overlay.innerHTML = OVERLAY_TEMPLATE;
  const pad = overlay.querySelector('canvas'), toast = overlay.querySelector('[role=status]');
  const options = document.createElement('div');
  options.dataset.lonetiEssentials = 'options';
  options.hidden = true;
  config.prepend(options);
  const root = options.attachShadow({mode:'open'});
  root.innerHTML = OPTIONS_TEMPLATE;
  for (const el of root.querySelectorAll('[data-ru]')) {
    if (ru) el.textContent = el.dataset.ru;
  }
  options.lang = host.lang = ru ? 'ru' : 'en';
  const buttons = createToolButtons(toolbar, tr, chooseTool);
  const toolsContainer = toolbar.closest('#cont_tools') || toolbar;
  const skin = document.createElement('style');
  skin.textContent = TOOLBAR_STYLE;
  document.head.append(skin);
  const q = s => root.querySelector(s);
  const finishBtn = q('[data-finish]'), undoPt = q('[data-back]'), end = q('[data-end]');
  const labels = Object.fromEntries(buttons.map(b => [b.dataset.leTool,b.getAttribute('aria-label')]));
  let tool = '', busy = false, editor = null, mask = null, nativeKey = null, handedOff = true;
  let showSelection = false;
  let points = [], hover = null, drag = null, pointer = null, gradientLayer = null, edge = null, stencil = null;
  let wandBase, frame = 0, toastTimer;
  function notify(text) {
    clearTimeout(toastTimer);
    toast.textContent = text;
    toast.hidden = !text;
    if (text) toastTimer = setTimeout(() => { toast.hidden = true; }, 6500);
  }
  const gradient = gradientEditor(q('[data-gradient-options]'), tr, notify);
  function failure(error) {
    const messages = {
      layerUnavailable: tr('Select one of your visible, unlocked layers.', 'Выберите свой видимый незаблокированный слой.'),
      layerChanged: tr('The active layer changed. Make the selection again.', 'Активный слой изменился. Выделите область заново.'),
      editorBusy: tr('Finish the current edit first.', 'Сначала завершите текущее действие.'),
      roomUnavailable: tr('Drawing is unavailable on this room layer.', 'На этом слое комнаты рисование недоступно.'),
      roomLimit: tr('This edit is too large to sync to the room.', 'Это изменение слишком велико для отправки в комнату.'),
      startup: typeof saveAndroidSmilePack === 'function'
        ? tr('Reopen the drawing. If the tools stay unavailable, update Android System WebView.', 'Откройте рисунок заново. Если инструменты недоступны, обновите Android System WebView.')
        : tr('In Tampermonkey settings choose Content Script API → UserScripts API Dynamic, then reload the drawing.', 'В настройках Tampermonkey выберите Content Script API → UserScripts API Dynamic и обновите рисунок.')
    };
    notify(messages[error?.editorCode] || tr('The editor is unavailable. Reload the drawing and try again.', 'Редактор недоступен. Обновите страницу рисунка и попробуйте ещё раз.'));
  }
  function requireEditor() {
    const current = getNativeEditor();
    if (!current || current.surface !== surface) throw Object.assign(new Error(), {
      editorCode: nativeEditorEngine ? 'layerUnavailable' : 'startup'
    });
    if (!editor || current.layerKey !== editor.layerKey || current.width !== editor.width || current.height !== editor.height) {
      const changed = !!editor;
      editor = current;
      resetGesture();
      adoptMask(current.readSelection(), true);
      if (changed) throw Object.assign(new Error(), {editorCode:'layerChanged'});
    } else {
      editor = current;
      if (editor.selectionKey() !== nativeKey) {
        wandBase = null;
        adoptMask(editor.readSelection(), true);
      }
    }
    return current;
  }
  function adoptMask(next, wasHandedOff) {
    mask = next;
    nativeKey = editor.selectionKey();
    handedOff = wasHandedOff;
    edge = mask && maskTexture(mask, editor.width, editor.height, true);
    stencil = null;
    q('[data-erase]').disabled = q('[data-fill]').disabled = q('[data-clear]').disabled = !mask;
  }
  function selectMask(next) {
    const ok = editor.setSelection(next);
    adoptMask(next, ok);
    if (!ok) notify(tr('This selection applies to Gradient, Fill selection and Erase selection.', 'Это выделение действует для градиента, заливки и стирания выделенной области.'));
    requestDraw();
  }
  function resetGesture() { points = []; hover = null; drag = null; pointer = null; wandBase = null; }
  function controls() {
    options.hidden = !tool && !(showSelection && mask);
    toolsContainer.toggleAttribute('data-le-custom-active', !!tool);
    config.toggleAttribute('data-le-custom-active', !!tool);
    q('[data-active]').textContent = labels[tool] || tr('Selection','Выделение');
    q('[data-polygon-options]').hidden = finishBtn.hidden = undoPt.hidden = tool !== 'polygon';
    finishBtn.disabled = points.length < 3;
    undoPt.disabled = !points.length;
    end.hidden = !tool;
    pad.style.pointerEvents = tool ? 'auto' : 'none';
    pad.style.cursor = tool ? 'crosshair' : '';
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.leTool === tool));
    q('[data-use]').hidden = !tool;
    q('[data-selection-actions]').hidden = !mask;
    q('[data-wand-options]').hidden = tool !== 'wand';
    q('[data-gradient-options]').hidden = tool !== 'gradient';
    q('[data-combine-label]').hidden = tool !== 'polygon' && tool !== 'wand';
  }
  function closeMobilePalette() {
    toolbar.closest('.content-mobile-menu')?.classList.remove('content-mobile-menu--show');
  }
  function chooseTool(next) {
    if (!next) {
      tool = '';
      resetGesture();
      showSelection = false;
      notify('');
      controls(); requestDraw();
      return;
    }
    if (busy) return;
    try {
      requireEditor();
      if (tool !== next) resetGesture();
      tool = next;
      showSelection = false;
      controls();
      if (next === 'polygon') {
        closeMobilePalette();
        notify(tr('Tap vertices, then tap Finish or the first point.', 'Касайтесь вершин, затем нажмите «Готово» или первую точку.'));
      }
      if (next === 'gradient' || next === 'wand') notify('');
      requestDraw();
    } catch (e) { failure(e); }
  }
  function point(event) { return editor.clientToCanvas(event.clientX, event.clientY); }
  function inImage(p) { return p.x >= 0 && p.y >= 0 && p.x < editor.width && p.y < editor.height; }
  function polygonDone() {
    if (points.length < 3 || busy) return;
    try {
      requireEditor();
      const result = polygonMask(editor.width, editor.height, points);
      selectMask(combineMasks(mask, result, q('[data-combine]').value));
      tool = ''; showSelection = true; resetGesture(); controls(); requestDraw();
      if (handedOff) notify(tr('Selection ready.', 'Выделение готово.'));
    } catch (e) { failure(e); }
  }
  function wandAt(p, previous) {
    const next = wandMask(editor.readLayer(), p, Number(q('[data-tolerance]').value), q('[data-contiguous]').checked);
    selectMask(combineMasks(previous, next, q('[data-combine]').value));
    wandBase = { point:p, previous };
  }
  function adjustWand() {
    q('[data-tolerance-value]').textContent = q('[data-tolerance]').value;
    if (!wandBase || busy) return;
    try { requireEditor(); if (wandBase) wandAt(wandBase.point, wandBase.previous); } catch (e) { failure(e); }
  }
  async function paint(action, line) {
    if (busy) return;
    busy = true;
    try {
      const edit = requireEditor();
      if (!mask && action !== 'gradient') return;
      const source = edit.readLayer();
      const preset = gradient();
      const pixels = maskedPaint(source, mask, ctx => action === 'fill' ? q('[data-fill-color]').value :
        gradientPaint(ctx, preset.type, line.start, line.end, preset.stops), action === 'erase');
      await edit.commitLayer(pixels);
      if (action === 'gradient') notify(tr('Gradient applied.', 'Градиент применён.'));
    } catch (e) { failure(e); }
    finally { busy = false; controls(); requestDraw(); }
  }
  function down(event) {
    if (!tool || busy || pointer !== null || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    try {
      requireEditor();
      pad.focus({preventScroll:true});
      pointer = event.pointerId; pad.setPointerCapture(pointer);
      const p = point(event);
      closeMobilePalette();
      if (tool === 'gradient') drag = { start:p, end:p };
      hover = p;
      requestDraw();
    } catch (e) { pointer = null; failure(e); }
  }
  function move(event) {
    if (!tool || (pointer !== null && event.pointerId !== pointer)) return;
    if (pointer === null && tool !== 'polygon') return;
    if (!editor) return;
    hover = point(event);
    if (drag) drag.end = hover;
    requestDraw();
  }
  function up(event) {
    if (pointer !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation(); pointer = null;
    try {
      requireEditor();
      const p = point(event);
      if (tool === 'polygon') {
        // Keep the actual coordinate, even when it lies on the surrounding pasteboard.
        const first = points.length && editor.canvasToClient(points[0].x, points[0].y);
        if (points.length >= 3 && Math.hypot(first.x-event.clientX,first.y-event.clientY) <= 9) polygonDone();
        else if (!points.length || Math.hypot(p.x-points[points.length-1].x,p.y-points[points.length-1].y) > 0.001) points.push(p);
      } else if (tool === 'wand' && inImage(p)) wandAt(p, mask);
      else if (tool === 'gradient' && drag) {
        const line = {start:drag.start,end:p};
        drag = null;
        if (Math.hypot(p.x-line.start.x,p.y-line.start.y) >= 0.1) void paint('gradient',line);
      }
      controls(); requestDraw();
    } catch (e) { drag = null; failure(e); requestDraw(); }
  }
  function requestDraw() { if (!frame) frame = requestAnimationFrame(render); }
  function render() {
    frame = 0;
    if (!host.isConnected) return;
    const box = pad.getBoundingClientRect();
    const w = Math.round(box.width), h = Math.round(box.height);
    if (!w || !h) return;
    if (pad.width !== w || pad.height !== h) { pad.width = w; pad.height = h; }
    const ctx = pad.getContext('2d');
    ctx.clearRect(0,0,w,h);
    if (!editor || (!tool && handedOff)) return;
    const screen = p => {
      const c = editor.canvasToClient(p.x,p.y);
      return {x:c.x-box.left,y:c.y-box.top};
    };
    const origin = screen({x:0,y:0}), right = screen({x:editor.width,y:0}), bottom = screen({x:0,y:editor.height});
    ctx.save();
    ctx.setTransform((right.x-origin.x)/editor.width,(right.y-origin.y)/editor.width,
      (bottom.x-origin.x)/editor.height,(bottom.y-origin.y)/editor.height,origin.x,origin.y);
    ctx.imageSmoothingEnabled = false;
    if (drag && Math.hypot(drag.end.x-drag.start.x,drag.end.y-drag.start.y) >= 0.1) {
      const preset = gradient();
      if (!gradientLayer || gradientLayer.width !== editor.width || gradientLayer.height !== editor.height) gradientLayer = drawingCanvas(editor.width,editor.height);
      const gc = gradientLayer.getContext('2d');
      gc.globalCompositeOperation = 'source-over';
      gc.fillStyle = gradientPaint(gc,preset.type,drag.start,drag.end,preset.stops);
      gc.fillRect(0,0,editor.width,editor.height);
      if (mask) {
        stencil ||= maskTexture(mask, editor.width, editor.height, false);
        gc.globalCompositeOperation = 'destination-in'; gc.drawImage(stencil,0,0);
      }
      ctx.drawImage(gradientLayer,0,0);
    }
    if (edge) ctx.drawImage(edge,0,0);
    ctx.restore();
    const line = drag ? [drag.start,drag.end] : [...points, ...(points.length && hover ? [hover] : [])];
    if (!line.length) return;
    const coords = line.map(screen);
    ctx.beginPath();
    coords.forEach(({x,y}, i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = '#214e52'; ctx.lineWidth = 1.5; ctx.setLineDash([5,4]); ctx.stroke(); ctx.setLineDash([]);
    for (const {x,y} of coords) {
      ctx.beginPath(); ctx.arc(x,y,3.5,0,2*Math.PI); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
    }
  }
  pad.onpointerdown = down; pad.onpointermove = move; pad.onpointerup = up;
  pad.onpointercancel = () => { pointer = null; drag = null; hover = null; requestDraw(); };
  pad.ondblclick = event => { event.preventDefault(); if (tool === 'polygon') polygonDone(); };
  for (const name of ['pointerdown','pointerup','mousedown','mousemove','mouseup','touchstart','touchmove','touchend','click','dblclick','contextmenu']) {
    host.addEventListener(name, e => e.stopPropagation());
  }
  q('[data-use]').onclick = () => {
    closeMobilePalette();
    pad.focus({preventScroll:true});
  };
  finishBtn.onclick = polygonDone;
  undoPt.onclick = () => { points.pop(); controls(); requestDraw(); };
  end.onclick = () => {
    const current = buttons.find(b => b.dataset.leTool === tool);
    chooseTool('');
    current?.focus({preventScroll:true});
  };
  q('[data-tolerance]').oninput = () => { q('[data-tolerance-value]').textContent = q('[data-tolerance]').value; };
  q('[data-tolerance]').onchange = q('[data-contiguous]').onchange = q('[data-combine]').onchange = adjustWand;
  q('[data-erase]').onclick = () => void paint('erase');
  q('[data-fill]').onclick = () => void paint('fill');
  q('[data-clear]').onclick = () => {
    try { requireEditor(); selectMask(null); wandBase = null; controls(); notify(''); } catch(e) { failure(e); }
  };
  const lifecycle = new AbortController();
  document.addEventListener('keydown', event => {
    if (!host.isConnected || !tool || busy || event.composedPath().some(el =>
      el.isContentEditable || el.matches?.('input,select,textarea,dialog,a[href]') ||
      (event.key === 'Enter' && el.tagName === 'BUTTON'))) return;
    if (event.key === 'Escape') chooseTool('');
    else if (event.key === 'Enter' && tool === 'polygon') polygonDone();
    else if (event.key === 'Backspace' && tool === 'polygon') { points.pop(); controls(); requestDraw(); }
    else return;
    event.preventDefault(); event.stopImmediatePropagation();
  }, {capture:true, signal:lifecycle.signal});
  toolsContainer.addEventListener('click', event => {
    if (event.target.closest?.('.one_tool[data-tool]:not(.one_tool--disabled)') && (tool || showSelection)) chooseTool('');
  }, {capture:true, signal:lifecycle.signal});
  // LONETI also selects tools from keyboard shortcuts, including its brush palette.
  const nativeSelection = new MutationObserver(records => {
    if ((tool || showSelection) && records.some(({target,oldValue}) => target.matches('.one_tool[data-tool]') &&
        target.classList.contains('active_tool') !== (oldValue || '').split(/\s+/).includes('active_tool'))) chooseTool('');
  });
  nativeSelection.observe(toolsContainer, {subtree:true,attributes:true,attributeFilter:['class'],attributeOldValue:true});
  options.addEventListener('keydown', event => event.stopPropagation());
  options.addEventListener('keyup', event => event.stopPropagation());
  surface.addEventListener('wheel', requestDraw, {passive:true,signal:lifecycle.signal});
  const resize = new ResizeObserver(requestDraw);
  resize.observe(surface);
  controls();
  return {
    mounted: () => toolbar.isConnected && config.isConnected && host.parentNode === surface &&
      options.parentNode === config && buttons.every(b => b.parentNode === toolbar),
    dispose() {
      lifecycle.abort(); resize.disconnect(); nativeSelection.disconnect();
      cancelAnimationFrame(frame); clearTimeout(toastTimer);
      toolsContainer.removeAttribute('data-le-custom-active');
      config.removeAttribute('data-le-custom-active');
      buttons.forEach(b => b.remove());
      options.remove(); host.remove(); skin.remove();
    }
  };
}

function startDrawingTools() {
  if (!nativeEditorRoute || !document.body) return;
  const active = new Map();
  function reconcile() {
    for (const [surface, ui] of active) {
      if (!surface.isConnected || !ui.mounted()) {
        ui.dispose();
        active.delete(surface);
      }
    }
    for (const surface of document.querySelectorAll('.js--container-work-canvas')) {
      if (active.has(surface)) continue;
      const drawing = surface.closest('.cont-draw') || document;
      const toolbar = drawing.querySelector('#tools'), config = drawing.querySelector('#cont_config');
      if (toolbar && config) active.set(surface, installDrawingTools(surface, toolbar, config));
    }
  }
  reconcile();
  const parts = '.js--container-work-canvas,#tools,#cont_config,[data-le-tool],[data-loneti-essentials]';
  const observer = new MutationObserver(changes => {
    for (const change of changes) {
      for (const node of [...change.addedNodes, ...change.removedNodes]) {
        if (node.nodeType === 1 && (node.matches(parts) || node.querySelector(parts))) {
          reconcile();
          return;
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startDrawingTools, {once:true});
else startDrawingTools();
})();
// END bundled drawing tools

(function startSmileLibrary() {
  'use strict';
  if (location.pathname === '/draw' || location.pathname.startsWith('/draw/')) return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startSmileLibrary, { once: true });
    return;
  }

  const russian = {
    "Add this Smile to My emotes": "Добавить этот смайл в «Мои смайлы»",
    "Smile image unavailable": "Изображение смайла недоступно",
    "Add this Smile?": "Добавить этот смайл?",
    "Smile preview": "Предпросмотр смайла",
    "Loading preview…": "Загрузка предпросмотра…",
    "Open My emotes": "Открыть «Мои смайлы»",
    "Cancel": "Отмена",
    "Add to my Smiles": "Добавить в «Мои смайлы»",
    "Close": "Закрыть",
    "Sign in to add a Smile": "Войдите, чтобы добавить смайл",
    "Sign in to LONETI, then select this Smile again.": "Войдите в LONETI и снова выберите этот смайл.",
    "Missing Smile image": "Изображение смайла отсутствует",
    "Unsupported image URL": "Ссылка на изображение имеет неподдерживаемый формат",
    "Already added": "Смайл уже добавлен",
    "Original unavailable": "Оригинал недоступен",
    "The original is needed to check the creator’s sharing preference.": "Нужен оригинал, чтобы проверить, разрешил ли автор копирование.",
    "The original is needed to check the creator’s sharing preference. Select the Smile again to retry.": "Нужен оригинал, чтобы проверить, разрешил ли автор копирование. Выберите смайл ещё раз, чтобы повторить попытку.",
    "Copying disabled": "Копирование отключено",
    "The creator marked this Smile to prevent collection.": "Автор запретил копировать этот смайл.",
    "Save a copy to My emotes?": "Сохранить копию в «Мои смайлы»?",
    "Adding to My emotes…": "Добавление в «Мои смайлы»…",
    "Added to My emotes": "Добавлено в «Мои смайлы»",
    "Your Smile is ready to use.": "Теперь вы можете использовать этот смайл.",
    "Unable to save": "Не удалось сохранить",
    "Save unconfirmed": "Сохранение не подтверждено",
    "Check that you are signed in and have permission to save Smiles.": "Убедитесь, что вы вошли в аккаунт и можете сохранять смайлы.",
    "LONETI declined the save.": "LONETI отклонил сохранение.",
    "Check My emotes before trying again. The request may have reached LONETI.": "Проверьте раздел «Мои смайлы» перед повторной попыткой. Запрос мог дойти до LONETI.",
    "The saved pack list could not be read.": "Не удалось прочитать сохранённый список наборов.",
    "A library update is already running in another tab. Try again when it finishes.": "Список смайлов уже обновляется в другой вкладке. Повторите попытку после завершения.",
    "A full-size original is required to check its copy preference.": "Нужен полноразмерный оригинал, чтобы проверить, разрешено ли копирование.",
    "Could not read My emotes. Check the connection and try again.": "Не удалось загрузить «Мои смайлы». Проверьте подключение и повторите попытку.",
    "The signed-in account changed or the session expired. Reload My emotes.": "Аккаунт сменился или сеанс завершился. Перезагрузите страницу «Мои смайлы».",
    "LONETI returned an unfamiliar Smile card. Reload My emotes.": "LONETI вернул карточку смайла в неизвестном формате. Перезагрузите страницу «Мои смайлы».",
    "A previous save of this Smile was interrupted. Its new copy could not be verified in My emotes. Send this Smile again?": "Предыдущее сохранение этого смайла прервалось. Не удалось проверить наличие новой копии в «Моих смайлах». Отправить смайл снова?",
    "Stopped before retrying the interrupted save.": "Повторное сохранение отменено.",
    "LONETI accepted the save, but the new image could not be verified. Check My emotes before retrying.": "LONETI принял запрос на сохранение, но проверить новое изображение не удалось. Проверьте раздел «Мои смайлы» перед повторной попыткой.",
    "The verified replacement is no longer in My emotes. Reload the library.": "Новая версия исчезла из раздела «Мои смайлы». Перезагрузите страницу.",
    "The old Smile changed. Reload My emotes.": "Прежний смайл изменился. Перезагрузите страницу «Мои смайлы».",
    "The new edition was verified. Reload My emotes to check whether LONETI removed the old entry.": "Новая версия подтверждена. Перезагрузите страницу «Мои смайлы», чтобы проверить, удалил ли LONETI прежнюю версию.",
    "The old Smile is still in My emotes. Use its checkbox again to retry removal.": "Прежний смайл остался в разделе «Мои смайлы». Чтобы снова попытаться удалить его, измените состояние его флажка.",
    "The library changed during replacement. Reload My emotes.": "Список смайлов изменился во время замены. Перезагрузите страницу «Мои смайлы».",
    "Replace this library entry with a protected Smile? The old entry will be removed after the replacement is verified. Earlier posts still reference the old image.": "Заменить этот смайл версией с защитой от копирования? Прежняя версия будет удалена из списка после проверки новой. В уже опубликованных сообщениях останется старое изображение.",
    "Replace this library entry with a shareable Smile? The old entry will be removed after the replacement is verified. Earlier posts still reference the old image.": "Заменить этот смайл версией, которую можно копировать? Прежняя версия будет удалена из списка после проверки новой. В уже опубликованных сообщениях останется старое изображение.",
    "This Smile changed. Reload My emotes.": "Этот смайл изменился. Перезагрузите страницу «Мои смайлы».",
    "The replacement image failed verification. The old library entry was kept.": "Новое изображение не прошло проверку. Прежний смайл остался в списке.",
    "Installing Smile {current} of {total}…": "Установка смайла {current} из {total}…",
    "{current} of {total} processed. {reason} Reopen this file to resume.": "Обработано {current} из {total}. {reason} Чтобы продолжить, снова откройте этот файл.",
    "Download {name}": "Скачать «{name}»",
    "Download .lesp": "Скачать .lesp",
    "Password (optional)": "Пароль (необязательно)",
    "Confirm password": "Повторите пароль",
    "Checking Smile {current} of {total}…": "Проверка смайла {current} из {total}…",
    "A file can hold up to {limit} shareable Smiles.": "В файл можно добавить до {limit} смайлов, доступных для копирования.",
    "This pack has no shareable Smiles.": "В этом наборе нет смайлов, доступных для копирования.",
    "Available to share: {count}.": "Доступно для копирования: {count}.",
    "Protected Smiles excluded: {count}.": "Исключено защищённых смайлов: {count}.",
    "Leave the password blank for an open pack.": "Чтобы сохранить набор без пароля, оставьте поле пустым.",
    "Could not prepare this pack. {reason}": "Не удалось подготовить этот набор. {reason}",
    "Could not download this pack.": "Не удалось скачать этот набор.",
    "Android save cancelled.": "Сохранение в Android отменено.",
    "Android is already saving a pack. Finish or cancel that save first.": "Android уже сохраняет набор. Завершите или отмените это сохранение.",
    "The passwords do not match.": "Пароли не совпадают.",
    "Smiles": "Смайлы",
    "{count} Smile downloaded.": "Скачан {count} смайл.",
    "{count} Smiles downloaded.": "Скачано смайлов: {count}.",
    "Install Smile pack": "Установить набор смайлов",
    "Choose a .lesp file": "Выберите файл .lesp",
    "Pack password": "Пароль набора",
    "Preview pack": "Предпросмотр набора",
    "Install pack": "Установить набор",
    "Could not read this pack.": "Не удалось прочитать этот набор.",
    "A Smile must be 300 × 300 pixels.": "Размер смайла должен быть 300 × 300 пикселей.",
    "Could not read the Smile canvas.": "Не удалось прочитать холст смайла.",
    "Could not mark the Smile output.": "Не удалось поставить отметку о защите смайла.",
    "Prevent copying this Smile": "Защитить этот смайл от копирования",
    "Could not update Smile copy protection.": "Не удалось изменить защиту смайла от копирования.",
    "The pack contains an invalid PNG.": "В наборе есть некорректный файл PNG.",
    "A Smile must be a 300 × 300 PNG.": "Смайл должен быть в формате PNG размером 300 × 300 пикселей.",
    "This pack contains a Smile marked to prevent copying.": "В наборе есть смайл с отметкой о защите от копирования.",
    "The pack contains an invalid or oversized PNG.": "В наборе есть некорректный или слишком большой файл PNG.",
    "Enter a password up to 1024 UTF-8 bytes.": "Введите пароль длиной не более 1024 байт в кодировке UTF-8.",
    "Enter a pack name.": "Введите название набора.",
    "The pack name is too long.": "Название набора слишком длинное.",
    "A pack must contain between 1 and 100 Smiles.": "В наборе должно быть от 1 до 100 смайлов.",
    "A pack may be at most 16 MiB.": "Размер набора не должен превышать 16 МиБ.",
    "A pack may be at most 16 MiB and must contain a LESP header.": "Размер набора не должен превышать 16 МиБ. Файл должен содержать заголовок LESP.",
    "Unsupported LESP pack format.": "Формат набора LESP не поддерживается.",
    "The LESP pack is truncated.": "Файл LESP неполный.",
    "The pack password is incorrect or the pack is damaged.": "Неверный пароль или файл набора повреждён.",
    "The LESP pack metadata is invalid.": "Некорректные метаданные набора LESP.",
    "The LESP pack name is invalid.": "Некорректное название набора LESP.",
    "The LESP pack contains an invalid PNG length.": "В наборе LESP указан некорректный размер файла PNG.",
    "The LESP pack contains unexpected trailing data.": "В конце файла LESP есть лишние данные.",
    "Unsorted": "Без набора",
    "Rename Smile pack": "Переименовать набор смайлов",
    "Name your Smile pack": "Введите название набора смайлов",
    "Enter a pack name between 1 and 80 characters.": "Введите название набора длиной от 1 до 80 символов.",
    "That pack name is already in use. Choose another name.": "Набор с таким названием уже есть. Выберите другое название.",
    "That Smile pack is no longer available.": "Этот набор смайлов больше недоступен.",
    "Could not update the Smile pack.": "Не удалось обновить набор смайлов.",
    "New pack": "Новый набор",
    "Move Smile to pack": "Переместить смайл в набор",
    "Copy protection": "Защита от копирования",
    "Checking copy protection…": "Проверка защиты от копирования…",
    "The old library entry was replaced with the protected edition.": "Смайл заменён версией с защитой от копирования.",
    "The old library entry was replaced with the shareable edition.": "Смайл заменён версией, которую можно копировать.",
    "Copy protection unavailable": "Защита от копирования недоступна",
    "Replace this library entry with the new sharing preference": "Заменить смайл версией с выбранной настройкой копирования",
    "Rename": "Переименовать",
    "Download pack": "Скачать набор",
    "This Smile is protected from collection": "Этот смайл защищён от копирования",
    "Could not process this Smile.": "Не удалось обработать этот смайл.",
    "This Smile is already in {pack}.": "Этот смайл уже есть в разделе «{pack}».",
    "A Smile in My emotes could not be read to check for duplicates. Try again when its image loads.": "Не удалось загрузить смайл из раздела «Мои смайлы» для поиска дубликатов. Повторите попытку, когда загрузится изображение.",
    "This pack already has {limit} Smiles. Move one out or choose another pack.": "В этом наборе уже {limit} смайлов. Переместите один смайл или выберите другой набор.",
    "Smiles in the file: {count}. Existing Smiles are reused. Named packs hold up to {limit} Smiles each.": "Смайлов в файле: {count}. Уже сохранённые смайлы используются повторно. В каждом именованном наборе помещается до {limit} смайлов.",
    "Added: {added}. Already in My emotes: {existing}.": "Добавлено: {added}. Уже в разделе «Мои смайлы»: {existing}.",
    "Existing Smiles stayed in their packs: {names}.": "Уже сохранённые смайлы остались в своих наборах: {names}.",
    "The matching edition remains in {pack}.": "Совпадающая версия осталась в наборе «{pack}»."
  };

  function supportedLocale(language) {
    switch (language?.trim().toLowerCase().split(/[-_]/)[0]) {
      case 'ru': return 'ru-RU';
      case 'en': return 'en-US';
      default: return null;
    }
  }

  const locale = supportedLocale(document.documentElement.lang) ||
    ({ 'loneti.ru': 'ru-RU', 'loneti.art': 'en-US' })[location.hostname] ||
    (navigator.languages || [navigator.language]).map(supportedLocale).find(Boolean) || 'en-US';

  function t(source, fields = {}) {
    const template = locale === 'ru-RU' ? (russian[source] ?? source) : source;
    return template.replace(/\{(\w+)\}/g, (placeholder, key) => fields[key] ?? placeholder);
  }

  class LocalizedError extends Error {}
  class SaveRejected extends LocalizedError {}

  function displayError(error, fallback = '') {
    return error instanceof LocalizedError ? error.message : t(fallback);
  }

  const smileSelector = [
    '.list_comments .one_comment .body_comment .smile_body > img',
    '#list_msg .one_msg .smile_msg > img',
  ].join(', ');
  const editorSize = 300;
  let currentDialog = null;
  const onSettings = location.pathname === '/settings';
  const query = new URLSearchParams(location.search);
  if (onSettings && query.get('new') !== 'smile' && query.get('act') !== 'smiles') return;

  const style = document.createElement('style');
  style.textContent = `
    img[data-lsc-smile] { cursor: pointer; }
    img[data-lsc-smile]:is(:hover, :focus-visible) {
      outline: 3px solid #006f79; outline-offset: 2px; border-radius: 4px;
      box-shadow: 0 0 0 3px white, 0 0 0 6px #006f7940;
    }
  `;

  function markSmile(img) {
    if (img.hasAttribute('data-lsc-smile')) return;
    img.setAttribute('data-lsc-smile', '');
    img.setAttribute('role', 'button');
    img.setAttribute('aria-haspopup', 'dialog');
    img.setAttribute('aria-label', t('Add this Smile to My emotes'));
    img.title = t('Add this Smile to My emotes');
    img.tabIndex = 0;
  }

  function markIn(root) {
    if (root.matches(smileSelector)) markSmile(root);
    root.querySelectorAll(smileSelector).forEach(markSmile);
  }

  function setupCollector() {
    document.head.append(style);
    markIn(document.body);
    new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element && node.isConnected) markIn(node);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', selectSmile, true);
    document.addEventListener('keydown', selectSmile, true);
  }

  function selectSmile(event) {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.matches(smileSelector)) return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    if (event.type === 'click' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (!currentDialog && !event.repeat) openPreview(img);
  }

  function originalFor(url) {
    if (url.origin !== location.origin || !/^\/pic\/smiles\/[^/]+-sm\.png$/i.test(url.pathname)) {
      return url;
    }
    const original = new URL(url);
    original.pathname = original.pathname.replace(/-sm\.png$/i, '.png');
    return original;
  }

  async function drawSource(url, canvas, signal, cache = 'default') {
    signal.throwIfAborted();
    const request = new AbortController();
    const cancel = () => request.abort();
    signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, 12000);
    let bitmap;
    try {
      const response = await fetch(url, { credentials: 'same-origin', cache, signal: request.signal });
      if (!response.ok) throw new LocalizedError(t('Smile image unavailable'));
      bitmap = await createImageBitmap(await response.blob());
      request.signal.throwIfAborted();
      const ctx = canvas.getContext('2d');
      const scale = Math.min(editorSize / bitmap.width, editorSize / bitmap.height);
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);
      // Match the editor's white-backed PNG and preserve the source proportions.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, editorSize, editorSize);
      ctx.drawImage(bitmap, (editorSize - width) / 2, (editorSize - height) / 2, width, height);
      return bitmap.width === editorSize && bitmap.height === editorSize;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      bitmap?.close();
    }
  }

  function makeDialog() {
    const host = document.createElement('div');
    host.lang = locale;
    const root = host.attachShadow({ mode: 'open' });
    // This template is static. Site messages and errors are inserted as text.
    root.innerHTML = `
      <style>
        dialog { all: initial; position: fixed; inset: 0; margin: auto; box-sizing: border-box;
          width: min(340px, calc(100vw - 24px)); height: fit-content; max-height: calc(100dvh - 24px); overflow: auto;
          padding: 22px; border-radius: 16px; color: #172e34; background: #fff;
          box-shadow: 0 12px 60px #16313940; font: 15px/1.45 system-ui, sans-serif; }
        dialog:not([open]), [hidden] { display: none !important; }
        dialog::backdrop { background: #122a3599; }
        h2 { margin: 0 0 14px; font-size: 21px; line-height: 1.25; }
        .smile-preview { width: min(180px, 100%, 32dvh); position: relative; margin: 0 auto; }
        canvas { display: block; margin: 0 auto 12px; width: 100%; height: auto; box-sizing: border-box;
          border: 1px solid #ccd9da; border-radius: 5px; }
        .smile-preview .lscp-picker-lock { position: absolute; top: 3px; right: 3px; width: 18px; height: 18px; pointer-events: none; }
        p { margin: 8px 0 14px; overflow-wrap: anywhere; }
        footer { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 8px; }
        button, a { font: inherit; font-weight: 600; cursor: pointer; }
        button { border: 0; border-radius: 8px; padding: 8px 12px; background: #edf2f2; color: #18383d; }
        button[data-add] { background: #006973; color: white; }
        button:disabled { opacity: .52; cursor: default; }
        a { color: #006973; margin-right: auto; }
        :is(button, a):focus-visible { outline: 2px solid #006973; outline-offset: 2px; }
      </style>
      <dialog aria-labelledby="title" aria-describedby="status">
        <h2 id="title">${t("Add this Smile?")}</h2>
        <div class="smile-preview"><canvas hidden role="img" aria-label="${t("Smile preview")}"></canvas></div>
        <p id="status" role="status">${t("Loading preview…")}</p>
        <footer>
          <a href="/settings?act=smiles" target="_blank" rel="noopener" hidden>${t("Open My emotes")}</a>
          <button data-close type="button" autofocus>${t("Cancel")}</button>
          <button data-add type="button" disabled>${t("Add to my Smiles")}</button>
        </footer>
      </dialog>`;
    document.body.append(host);
    return {
      host, dialog: root.querySelector('dialog'), title: root.querySelector('h2'),
      canvas: root.querySelector('canvas'), status: root.querySelector('p'),
      library: root.querySelector('a'), close: root.querySelector('[data-close]'),
      add: root.querySelector('[data-add]'),
    };
  }

  async function openPreview(img) {
    const ui = makeDialog();
    currentDialog = ui.dialog;
    const loader = new AbortController();
    let saving = false;
    let imageData;

    function finish(title, message, showLibrary = false) {
      ui.title.textContent = title;
      ui.status.textContent = message;
      ui.library.hidden = !showLibrary;
      ui.add.hidden = true;
      ui.close.textContent = t('Close');
      ui.close.disabled = false;
      ui.close.focus();
    }

    ui.close.addEventListener('click', () => {
      if (!saving) ui.dialog.close();
    });
    ui.dialog.addEventListener('cancel', event => {
      if (saving) event.preventDefault();
    });
    ui.dialog.addEventListener('close', () => {
      loader.abort();
      currentDialog = null;
      ui.host.remove();
      if (img.isConnected) img.focus({ preventScroll: true });
    }, { once: true });
    ui.dialog.showModal();

    if (!document.querySelector('a#cur_user')) {
      finish(t('Sign in to add a Smile'), t('Sign in to LONETI, then select this Smile again.'));
      return;
    }
    try {
      const src = img.currentSrc || img.getAttribute('src');
      if (!src) throw new LocalizedError(t('Missing Smile image'));
      const displayed = new URL(src, document.baseURI);
      if (!['https:', 'http:'].includes(displayed.protocol)) throw new LocalizedError(t('Unsupported image URL'));
      const original = originalFor(displayed);
      ui.canvas.width = ui.canvas.height = editorSize;
      const fullSize = await drawSource(original, ui.canvas, loader.signal);
      loader.signal.throwIfAborted();
      ui.canvas.hidden = false;
      if (!fullSize) {
        finish(t('Original unavailable'), t('The original is needed to check the creator’s sharing preference.'));
        return;
      }
      if (hasNoCopyMark(ui.canvas)) {
        ui.canvas.after(makeProtectionLock());
        finish(t('Copying disabled'), t('The creator marked this Smile to prevent collection.'));
        return;
      }
      imageData = ui.canvas.toDataURL('image/png');
      ui.status.textContent = t('Save a copy to My emotes?');
      ui.add.disabled = false;
    } catch {
      if (!loader.signal.aborted) finish(t('Original unavailable'), t('The original is needed to check the creator’s sharing preference. Select the Smile again to retry.'));
      return;
    }

    ui.add.addEventListener('click', async () => {
      if (saving || ui.add.disabled) return;
      saving = true;
      ui.close.disabled = ui.add.disabled = true;
      ui.status.textContent = t('Adding to My emotes…');
      try {
        const result = await saveToSmileLibrary(imageData);
        if (result.created) {
          finish(t('Added to My emotes'), t('Your Smile is ready to use.'), true);
        } else {
          finish(t('Already added'), t('This Smile is already in {pack}.', { pack: smilePackName(result.entry.id) }), true);
        }
      } catch (error) {
        finish(error instanceof SaveRejected ? t('Unable to save') : t('Save unconfirmed'),
          displayError(error, 'Check My emotes before trying again. The request may have reached LONETI.'), true);
      } finally {
        saving = false;
      }
    });
  }


  async function saveSmileImage(imageData) {
    try {
      const response = await fetch('/settings?save=smile', {
        method: 'POST', credentials: 'same-origin', mode: 'same-origin', redirect: 'error',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
        body: new URLSearchParams({ data_img: imageData }), signal: AbortSignal.timeout(20000),
      });
      if ([401, 403].includes(response.status)) throw new SaveRejected(t('Check that you are signed in and have permission to save Smiles.'));
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (result?.result === true || result?.result === 'true') return;
      if (result?.result === false || result?.result === 'false' || typeof result?.error === 'string') {
        throw new SaveRejected(result.error || t('LONETI declined the save.'));
      }
      throw new Error();
    } catch (error) {
      if (error instanceof SaveRejected) throw error;
      throw new LocalizedError(t('Check My emotes before trying again. The request may have reached LONETI.'));
    }
  }
  function profilePath(root) {
    const link = root.querySelector('a#cur_user[href]');
    return link ? new URL(link.getAttribute('href'), location.origin).pathname.toLowerCase() : '';
  }

  const profile = profilePath(document);
  const storageKey = 'lsc:packs:v1:' + profile;
  const libraryPage = '/settings?act=smiles';
  const digestCache = new Map();

  function readPackState() {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { packs: [], members: {}, pending: {} };
    const state = JSON.parse(raw);
    if (!Array.isArray(state?.packs) || !state.members || typeof state.members !== 'object') {
      throw new LocalizedError(t('The saved pack list could not be read.'));
    }
    state.pending ??= {};
    return state;
  }

  async function changePackState(mutator) {
    await navigator.locks.request(storageKey + ':metadata', () => {
      const state = readPackState();
      mutator(state);
      localStorage.setItem(storageKey, JSON.stringify(state));
    });
    document.dispatchEvent(new Event('lsc-packs-changed'));
  }

  function withLibraryWrite(action) {
    return navigator.locks.request(storageKey + ':upload', { ifAvailable: true }, lock => {
      if (!lock) throw new LocalizedError(t('A library update is already running in another tab. Try again when it finishes.'));
      return action();
    });
  }

  function getLibraryCards(root = document) {
    return Array.from(root.querySelectorAll('#list_smiles .one_smile'))
      .filter(card => !card.hidden && card.style.display !== 'none');
  }

  function libraryEntry(card) {
    const id = card.getAttribute('data-id');
    const src = card.querySelector('img')?.getAttribute('src');
    if (!/^\d+$/.test(id) || !src) return null;
    const url = new URL(src, location.origin);
    if (url.origin !== location.origin) return null;
    return { id, url: originalFor(url).href };
  }

  async function readOwnedCanvas(url, cache) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = editorSize;
    const fullSize = await drawSource(originalFor(new URL(url, location.origin)), canvas, AbortSignal.timeout(15000), cache);
    if (!fullSize) throw new LocalizedError(t('A full-size original is required to check its copy preference.'));
    return canvas;
  }

  async function pixelDigest(pixels) {
    const hash = await crypto.subtle.digest('SHA-256', pixels);
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function canvasIdentity(canvas, includeLegacy = true) {
    const protectedSmile = hasNoCopyMark(canvas);
    const pixels = canvas.getContext('2d').getImageData(0, 0, editorSize, editorSize).data;
    const original = includeLegacy ? pixelDigest(pixels.slice()) : null;
    // Ignore the marker's carrier bits, but keep protected and shareable editions distinct.
    for (let index = 0; index < lespNoCopySignature.length * 8; index += 1) {
      pixels[((editorSize - 1) * editorSize + index) * 4 + 2] &= 254;
    }
    const digest = await pixelDigest(pixels);
    return { digest: digest + (protectedSmile ? ':protected' : ':shareable'), legacy: await original };
  }

  async function canvasDigest(canvas) {
    return (await canvasIdentity(canvas, false)).digest;
  }

  async function ownedDigest(entry) {
    // LONETI gives each new Smile its own image URL. Never cache a failed read.
    if (!digestCache.has(entry.url)) digestCache.set(entry.url, await canvasDigest(await readOwnedCanvas(entry.url)));
    return digestCache.get(entry.url);
  }

  async function preparePackImage(dataUrl) {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = editorSize;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, editorSize, editorSize);
    ctx.drawImage(image, 0, 0);
    return { dataUrl: canvas.toDataURL('image/png'), ...await canvasIdentity(canvas) };
  }

  async function fetchLibrary() {
    const response = await fetch(libraryPage, {
      mode: 'same-origin', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(16000),
    });
    if (!response.ok) throw new LocalizedError(t('Could not read My emotes. Check the connection and try again.'));
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (!profile || profilePath(doc) !== profile || !doc.querySelector('#list_smiles')) {
      throw new LocalizedError(t('The signed-in account changed or the session expired. Reload My emotes.'));
    }
    const byId = new Map();
    for (const card of getLibraryCards(doc)) {
      const entry = libraryEntry(card);
      if (!entry) throw new LocalizedError(t('LONETI returned an unfamiliar Smile card. Reload My emotes.'));
      byId.set(entry.id, { ...entry, card });
    }
    return byId;
  }

  function showNewLibraryCards(snapshot) {
    const list = document.getElementById('list_smiles');
    if (!list) return;
    const known = new Set(getLibraryCards().map(card => card.dataset.id));
    for (const entry of snapshot.values()) {
      if (!known.has(entry.id)) {
        list.querySelector('.no_smiles')?.remove();
        list.append(document.importNode(entry.card, true));
      }
    }
  }

  async function findMatch(entries, digest, mustRuleOutMatch = false) {
    let unreadable = false;
    for (let index = 0; index < entries.length; index += 6) {
      const batch = entries.slice(index, index + 6);
      const results = await Promise.allSettled(batch.map(ownedDigest));
      const match = results.findIndex(result => result.status === 'fulfilled' && result.value === digest);
      if (match >= 0) return batch[match];
      unreadable ||= results.some(result => result.status === 'rejected');
    }
    if (unreadable && mustRuleOutMatch) {
      throw new LocalizedError(t('A Smile in My emotes could not be read to check for duplicates. Try again when its image loads.'));
    }
    return null;
  }

  const maxNamedPackSize = 16;

  function smilePackName(id, state = readPackState()) {
    return state.packs.find(pack => pack.id === state.members[id])?.name || t('Unsorted');
  }

  function packMemberCount(state, packId, snapshot) {
    let count = 0;
    for (const id of snapshot.keys()) {
      if (state.members[id] === packId) count++;
    }
    return count;
  }

  function choosePackRoom(state, base, snapshot) {
    const family = [base, ...state.packs.filter(pack => pack.continuationOf === base.id)];
    const available = family.find(pack => packMemberCount(state, pack.id, snapshot) < maxNamedPackSize);
    if (available) return available.id;
    const names = new Set(state.packs.map(pack => pack.name.toLowerCase()));
    let number = 2;
    let name;
    do {
      const suffix = ' (' + number++ + ')';
      name = base.name.slice(0, lespMaxNameLength - suffix.length).replace(/[\ud800-\udbff]$/, '').trimEnd() + suffix;
    } while (names.has(name.toLowerCase()));
    const continuation = { id: crypto.randomUUID(), name, continuationOf: base.id };
    state.packs.push(continuation);
    return continuation.id;
  }

  function splitOversizedPacks(state, snapshot) {
    for (const pack of [...state.packs]) {
      const ids = [...snapshot.keys()].filter(id => state.members[id] === pack.id).sort(newestSmileFirst);
      const base = state.packs.find(item => item.id === pack.continuationOf) || pack;
      for (const id of ids.slice(maxNamedPackSize)) {
        state.members[id] = choosePackRoom(state, base, snapshot);
      }
    }
  }

  async function migrateOversizedPacks() {
    const state = readPackState();
    const counts = new Map();
    for (const id of Object.values(state.members)) counts.set(id, (counts.get(id) || 0) + 1);
    if (![...counts.values()].some(count => count > maxNamedPackSize)) return;
    await withLibraryWrite(async () => {
      const snapshot = await fetchLibrary();
      await changePackState(state => splitOversizedPacks(state, snapshot));
    });
  }

  async function recordMember(id, packId, identity, snapshot) {
    await changePackState(state => {
      if (packId && !state.members[id] && state.packs.some(pack => pack.id === packId) &&
          packMemberCount(state, packId, snapshot) < maxNamedPackSize) state.members[id] = packId;
      delete state.pending[identity.digest];
      delete state.pending[identity.legacy];
    });
  }

  async function inspectSmileEdition(snapshot, identity) {
    const state = readPackState();
    const { digest, legacy } = identity;
    const pending = state.pending[digest] || state.pending[legacy];
    const entries = [...snapshot.values()].sort((a, b) => Number(Boolean(state.members[b.id])) - Number(Boolean(state.members[a.id])));
    const match = await findMatch(entries, digest, true);
    if (!pending) return match;
    if (match) {
      await recordMember(match.id, pending.before.includes(match.id) ? '' : pending.packId, identity, snapshot);
      return match;
    }
    if (!window.confirm(t('A previous save of this Smile was interrupted. Its new copy could not be verified in My emotes. Send this Smile again?'))) {
      throw new LocalizedError(t('Stopped before retrying the interrupted save.'));
    }
    return null;
  }

  // Native saves return success without a library ID. Match only new IDs by pixels.
  async function uploadEdition(dataUrl, identity) {
    const { digest, legacy } = identity;
    // Refresh after local comparison or a retry prompt, in case another session added artwork.
    const snapshot = await fetchLibrary();
    const earlier = await findMatch([...snapshot.values()], digest, true);
    if (earlier) {
      const existing = await inspectSmileEdition(snapshot, identity);
      return { snapshot, entry: existing || earlier, created: false };
    }
    await changePackState(state => {
      delete state.pending[legacy];
      state.pending[digest] = { before: [...snapshot.keys()], packId: '' };
    });
    try {
      await saveSmileImage(dataUrl);
    } catch (error) {
      if (error instanceof SaveRejected) await changePackState(state => { delete state.pending[digest]; });
      throw error;
    }
    const after = await fetchLibrary();
    showNewLibraryCards(after);
    const match = await findMatch([...after.values()].filter(entry => !snapshot.has(entry.id)), digest);
    if (!match) throw new LocalizedError(t('LONETI accepted the save, but the new image could not be verified. Check My emotes before retrying.'));
    await recordMember(match.id, '', identity, after);
    return { snapshot: after, entry: match, created: true };
  }

  async function saveToSmileLibrary(source) {
    return withLibraryWrite(async () => {
      const prepared = await preparePackImage(source);
      const snapshot = await fetchLibrary();
      const entry = await inspectSmileEdition(snapshot, prepared);
      if (entry) return { snapshot, entry, created: false };
      return uploadEdition(prepared.dataUrl, prepared);
    });
  }

  async function removeReplacedSmile(previous, replacement) {
    const before = await fetchLibrary();
    if (before.get(replacement.id)?.url !== replacement.url || previous.id === replacement.id) {
      throw new LocalizedError(t('The verified replacement is no longer in My emotes. Reload the library.'));
    }
    if (!before.has(previous.id)) return before;
    if (before.get(previous.id).url !== previous.url) throw new LocalizedError(t('The old Smile changed. Reload My emotes.'));

    let reason = '';
    try {
      const response = await fetch('/settings?del=smile', {
        method: 'POST', mode: 'same-origin', credentials: 'same-origin', redirect: 'error',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
        body: new URLSearchParams({ id_smile: previous.id }), signal: AbortSignal.timeout(20000),
      });
      if (response.ok) {
        const result = await response.json();
        if (typeof result?.error === 'string') reason = result.error;
      }
    } catch {
      // A lost response can follow a successful deletion. Read the library before retrying.
    }
    let after;
    try {
      after = await fetchLibrary();
    } catch {
      throw new LocalizedError(t('The new edition was verified. Reload My emotes to check whether LONETI removed the old entry.'));
    }
    if (after.has(previous.id)) {
      throw new LocalizedError((reason ? reason + ' ' : '') + t('The old Smile is still in My emotes. Use its checkbox again to retry removal.'));
    }
    if (after.get(replacement.id)?.url !== replacement.url) throw new LocalizedError(t('The library changed during replacement. Reload My emotes.'));
    return after;
  }

  async function changeOwnedProtection(entry, desired) {
    const prompt = desired
      ? t('Replace this library entry with a protected Smile? The old entry will be removed after the replacement is verified. Earlier posts still reference the old image.')
      : t('Replace this library entry with a shareable Smile? The old entry will be removed after the replacement is verified. Earlier posts still reference the old image.');
    if (!window.confirm(prompt)) return false;
    return withLibraryWrite(async () => {
      const snapshot = await fetchLibrary();
      if (snapshot.get(entry.id)?.url !== entry.url) throw new LocalizedError(t('This Smile changed. Reload My emotes.'));
      const canvas = await readOwnedCanvas(entry.url, 'no-store');
      if (hasNoCopyMark(canvas) === desired) return false;
      setNoCopyMark(canvas, desired);
      const identity = await canvasIdentity(canvas);
      let replacement = await inspectSmileEdition(snapshot, identity);
      if (!replacement) {
        replacement = (await uploadEdition(canvas.toDataURL('image/png'), identity)).entry;
      }
      const verified = await readOwnedCanvas(replacement.url, 'no-store');
      if (hasNoCopyMark(verified) !== desired || await canvasDigest(verified) !== identity.digest) {
        throw new LocalizedError(t('The replacement image failed verification. The old library entry was kept.'));
      }
      const after = await removeReplacedSmile(entry, replacement);
      showNewLibraryCards(after);
      for (const card of getLibraryCards()) {
        if (card.dataset.id === entry.id) card.remove();
      }
      let otherPack;
      await changePackState(state => {
        const group = state.members[entry.id] || '';
        const replacementGroup = state.members[replacement.id];
        delete state.members[entry.id];
        if (replacementGroup && replacementGroup !== group) {
          otherPack = smilePackName(replacement.id, state);
        } else if (group && !replacementGroup && packMemberCount(state, group, after) < maxNamedPackSize) {
          state.members[replacement.id] = group;
        }
      });
      return { otherPack };
    });
  }

  async function installPack(pack, progress) {
    return withLibraryWrite(async () => {
      let snapshot = await fetchLibrary();
      showNewLibraryCards(snapshot);
      await changePackState(state => splitOversizedPacks(state, snapshot));
      const unassigned = isUnsortedPackName(pack.name);
      const retained = new Set();
      let created = 0;
      let reused = 0;
      for (const [index, source] of pack.smiles.entries()) {
        progress(t('Installing Smile {current} of {total}…', { current: index + 1, total: pack.smiles.length }));
        try {
          const prepared = await preparePackImage(source);
          let entry = await inspectSmileEdition(snapshot, prepared);
          if (entry) {
            reused++;
          } else {
            const result = await uploadEdition(prepared.dataUrl, prepared);
            snapshot = result.snapshot;
            entry = result.entry;
            if (result.created) created++;
            else reused++;
          }
          await changePackState(state => {
            let base = state.packs.find(item => item.name.toLowerCase() === pack.name.toLowerCase());
            const assigned = state.packs.find(item => item.id === state.members[entry.id]);
            if (assigned) {
              if (unassigned || !base || (assigned.id !== base.id && assigned.continuationOf !== base.id)) retained.add(assigned.name);
              return;
            }
            if (unassigned) return;
            if (!base) {
              base = { id: crypto.randomUUID(), name: pack.name };
              state.packs.push(base);
            }
            state.members[entry.id] = choosePackRoom(state, base, snapshot);
          });
        } catch (error) {
          throw new LocalizedError(t('{current} of {total} processed. {reason} Reopen this file to resume.', {
            current: index, total: pack.smiles.length, reason: displayError(error, 'Could not process this Smile.'),
          }));
        }
      }
      return { created, reused, retained: [...retained] };
    });
  }
  function transferDialog(title) {
    if (currentDialog) return null;
    const ui = makeDialog();
    currentDialog = ui.dialog;
    ui.title.textContent = title;
    ui.status.textContent = '';
    const fields = document.createElement('div');
    ui.status.before(fields);
    ui.fields = fields;
    const style = document.createElement('style');
    style.textContent = '.fields label { display:grid; gap:4px; margin:10px 0; } .fields input { box-sizing:border-box; width:100%; padding:7px; font:inherit; } .samples { display:flex; flex-wrap:wrap; gap:4px; max-height:22vh; overflow:auto; } .samples img { width:44px; height:44px; object-fit:contain; border:1px solid #ccd9da; }';
    ui.dialog.before(style);
    fields.className = 'fields';
    let busy = false;
    ui.setBusy = value => {
      busy = value;
      ui.close.disabled = value;
      ui.add.disabled = value;
      fields.querySelectorAll('input').forEach(input => { input.disabled = value; });
    };
    ui.input = (labelText, type) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = type;
      label.append(labelText, input);
      fields.append(label);
      return input;
    };
    ui.done = message => {
      fields.replaceChildren();
      ui.add.hidden = true;
      ui.close.textContent = t('Close');
      ui.status.textContent = message;
      ui.close.focus();
    };
    ui.close.addEventListener('click', () => { if (!busy) ui.dialog.close(); });
    ui.dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    ui.dialog.addEventListener('close', () => {
      ui.host.remove();
      currentDialog = null;
    }, { once: true });
    ui.dialog.showModal();
    return ui;
  }

  async function openPackExport(name, entries, packName = name) {
    const ui = transferDialog(t('Download {name}', { name }));
    if (!ui) return;
    ui.add.textContent = t('Download .lesp');
    const password = ui.input(t('Password (optional)'), 'password');
    const repeat = ui.input(t('Confirm password'), 'password');
    password.autocomplete = repeat.autocomplete = 'new-password';
    const images = [];
    let skipped = 0;
    try {
      for (const [index, entry] of entries.entries()) {
        if (!ui.dialog.open) return;
        ui.status.textContent = t('Checking Smile {current} of {total}…', { current: index + 1, total: entries.length });
        const canvas = await readOwnedCanvas(entry.url);
        if (hasNoCopyMark(canvas)) skipped++;
        else images.push(canvas.toDataURL('image/png'));
        if (images.length > lespMaxImages) throw new LocalizedError(t('A file can hold up to {limit} shareable Smiles.', { limit: lespMaxImages }));
      }
      if (!images.length) {
        ui.done(t('This pack has no shareable Smiles.'));
        return;
      }
      ui.add.disabled = false;
      ui.status.textContent = [
        t('Available to share: {count}.', { count: images.length }),
        ...(skipped ? [t('Protected Smiles excluded: {count}.', { count: skipped })] : []),
        t('Leave the password blank for an open pack.'),
      ].join(' ');
    } catch (error) {
      ui.done(t('Could not prepare this pack. {reason}', { reason: displayError(error) }).trim());
      return;
    }
    ui.add.addEventListener('click', async () => {
      if (ui.add.disabled || ui.add.hidden) return;
      if (password.value !== repeat.value) {
        ui.status.textContent = t('The passwords do not match.');
        repeat.focus();
        return;
      }
      ui.setBusy(true);
      try {
        const blob = await writePack(packName, images, password.value);
        const filename = (name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '') || t('Smiles')) + '.lesp';
        if (typeof saveAndroidSmilePack === 'function') {
          await saveAndroidSmilePack(blob, filename);
        } else {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = filename;
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(link.href), 60000);
        }
        ui.setBusy(false);
        ui.done(t(images.length === 1 ? '{count} Smile downloaded.' : '{count} Smiles downloaded.', { count: images.length }));
      } catch (error) {
        ui.setBusy(false);
        if (error?.androidPackExportStatus === 'cancelled') {
          ui.status.textContent = t('Android save cancelled.');
        } else if (error?.androidPackExportStatus === 'busy') {
          ui.status.textContent = t('Android is already saving a pack. Finish or cancel that save first.');
        } else {
          ui.status.textContent = displayError(error, 'Could not download this pack.');
        }
      }
    });
  }

  function openPackInstall() {
    const ui = transferDialog(t('Install Smile pack'));
    if (!ui) return;
    const fileInput = ui.input(t('Choose a .lesp file'), 'file');
    fileInput.accept = '.lesp';
    const password = ui.input(t('Pack password'), 'password');
    password.autocomplete = 'off';
    password.parentElement.hidden = true;
    ui.add.textContent = t('Preview pack');
    let selectedFile;
    let pack;
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      selectedFile = file;
      password.value = '';
      password.parentElement.hidden = true;
      ui.add.disabled = true;
      ui.status.textContent = '';
      if (!file) return;
      try {
        const locked = await isLockedPack(file);
        if (selectedFile !== file) return;
        password.parentElement.hidden = !locked;
        ui.add.disabled = false;
        if (locked) password.focus();
      } catch (error) {
        if (selectedFile === file) ui.status.textContent = displayError(error, 'Could not read this pack.');
      }
    });
    ui.add.addEventListener('click', async () => {
      if (ui.add.disabled || ui.add.hidden) return;
      ui.setBusy(true);
      try {
        if (!pack) {
          const validated = await readPack(selectedFile, password.value);
          password.value = '';
          pack = validated;
          ui.title.textContent = displayPackName(pack.name);
          const samples = document.createElement('div');
          samples.className = 'samples';
          for (const source of pack.smiles) {
            const img = document.createElement('img');
            img.src = source;
            img.alt = '';
            samples.append(img);
          }
          ui.fields.replaceChildren(samples);
          ui.status.textContent = t('Smiles in the file: {count}. Existing Smiles are reused. Named packs hold up to {limit} Smiles each.', {
            count: pack.smiles.length, limit: maxNamedPackSize,
          });
          ui.add.textContent = t('Install pack');
          return;
        }
        const { created, reused, retained } = await installPack(pack, text => { ui.status.textContent = text; });
        ui.setBusy(false);
        const summary = t('Added: {added}. Already in My emotes: {existing}.', { added: created, existing: reused });
        const groups = retained.length ? ' ' + t('Existing Smiles stayed in their packs: {names}.', { names: retained.join(', ') }) : '';
        ui.done(summary + groups);
      } catch (error) {
        if (pack) {
          ui.setBusy(false);
          ui.done(displayError(error, 'Could not update the Smile pack.'));
        } else {
          ui.status.textContent = displayError(error, 'Could not read this pack.');
        }
      } finally {
        ui.setBusy(false);
      }
    });
  }

  const lespSize = 300;
  const lespMaxImages = 100;
  const lespMaxImageBytes = 512 * 1024;
  const lespMaxPackBytes = 16 * 1024 * 1024;
  const lespMaxNameBytes = 320;
  const lespMaxNameLength = 80;
  const lespPngPrefix = 'data:image/png;base64,';
  const lespPngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  const lespNoCopySignature = [0x4c, 0x45, 0x53, 0x50, 0x6e, 0xa7, 0x58, 0x3d];
  const lespHeader = [0x4c, 0x45, 0x53, 0x50, 1];
  const lespLockBytes = 28;
  const lespTagBytes = 16;

  function lespMarkPixels(canvas) {
    if (canvas.width !== lespSize || canvas.height !== lespSize) {
      throw new LocalizedError(t('A Smile must be 300 × 300 pixels.'));
    }
    const context = canvas.getContext('2d');
    if (!context) throw new LocalizedError(t('Could not read the Smile canvas.'));
    const pixels = context.getImageData(0, lespSize - 1, lespNoCopySignature.length * 8, 1);
    return { context, pixels };
  }

  function lespMarkMatches(data) {
    return lespNoCopySignature.every((byte, index) => {
      for (let bit = 0; bit < 8; bit += 1) {
        const blue = (index * 8 + bit) * 4 + 2;
        if (data[blue + 1] !== 255 || (data[blue] & 1) !== ((byte >> (7 - bit)) & 1)) return false;
      }
      return true;
    });
  }

  function hasNoCopyMark(canvas) {
    return lespMarkMatches(lespMarkPixels(canvas).pixels.data);
  }

  function setNoCopyMark(canvas, enabled) {
    const { context, pixels } = lespMarkPixels(canvas);
    if (lespMarkMatches(pixels.data) === enabled) return;
    for (let index = 0; index < lespNoCopySignature.length; index += 1) {
      for (let bit = 0; bit < 8; bit += 1) {
        const blue = (index * 8 + bit) * 4 + 2;
        if (pixels.data[blue + 1] !== 255) throw new LocalizedError(t('Could not mark the Smile output.'));
        const flag = enabled ? ((lespNoCopySignature[index] >> (7 - bit)) & 1) : 0;
        pixels.data[blue] = (pixels.data[blue] & 254) | flag;
      }
    }
    context.putImageData(pixels, 0, lespSize - 1);
  }

  function setupEditorProtection() {
    const save = document.getElementById('btn_save_server');
    const canvas = document.getElementById('canv_save');
    const download = document.getElementById('save_disk');
    const preview = document.querySelector('#img_save img');
    if (!save || !canvas || !download || !preview || document.getElementById('lesp-no-copy')) return;
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.id = 'lesp-no-copy';
    checkbox.type = 'checkbox';
    label.style.display = 'block';
    label.style.margin = '0.5em 0';
    label.append(checkbox, ' ' + t('Prevent copying this Smile'));
    save.before(label);
    save.addEventListener('click', async event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (save.classList.contains('disable_btn')) return;
      save.classList.add('disable_btn');
      checkbox.disabled = true;
      const caption = [...save.childNodes];
      save.textContent = t('Adding to My emotes…');
      try {
        setNoCopyMark(canvas, checkbox.checked);
        const src = canvas.toDataURL('image/png');
        preview.src = src;
        download.setAttribute('href', src);
        const draft = localStorage.getItem('smile');
        const result = await saveToSmileLibrary(src);
        if (!result.created) {
          window.alert(t('This Smile is already in {pack}.', { pack: smilePackName(result.entry.id) }));
          return;
        }
        // The native editor clears its autosaved draft only after a successful save.
        if (localStorage.getItem('smile') === draft) localStorage.removeItem('smile');
        window.onbeforeunload = null;
        location.assign(libraryPage);
      } catch (error) {
        window.alert(displayError(error, 'Could not process this Smile.'));
      } finally {
        save.replaceChildren(...caption);
        save.classList.remove('disable_btn');
        checkbox.disabled = false;
      }
    }, true);
  }

  function lespCheckPng(bytes) {
    if (bytes.length < 45 || bytes.length > lespMaxImageBytes ||
        !lespPngSignature.every((byte, index) => bytes[index] === byte)) {
      throw new LocalizedError(t('The pack contains an invalid PNG.'));
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452 ||
        view.getUint32(16) !== lespSize || view.getUint32(20) !== lespSize) {
      throw new LocalizedError(t('A Smile must be a 300 × 300 PNG.'));
    }
  }

  async function lespCheckSmile(bytes) {
    lespCheckPng(bytes);
    const blob = new Blob([bytes], { type: 'image/png' });
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0);
      if (hasNoCopyMark(canvas)) throw new LocalizedError(t('This pack contains a Smile marked to prevent copying.'));
    } finally {
      bitmap.close();
    }
  }

  function lespDecodeDataUrl(dataUrl) {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith(lespPngPrefix) ||
        dataUrl.length > lespPngPrefix.length + 4 * Math.ceil(lespMaxImageBytes / 3)) {
      throw new LocalizedError(t('The pack contains an invalid or oversized PNG.'));
    }
    return Uint8Array.from(atob(dataUrl.slice(lespPngPrefix.length)), (char) => char.charCodeAt(0));
  }

  function lespEncodeDataUrl(bytes) {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return lespPngPrefix + btoa(binary);
  }

  async function lespKey(password, salt) {
    const encoded = new TextEncoder().encode(password);
    if (!encoded.length || encoded.length > 1024) throw new LocalizedError(t('Enter a password up to 1024 UTF-8 bytes.'));
    const material = await crypto.subtle.importKey('raw', encoded, 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function writePack(name, arrayOfPngDataUrls, passwordString = '') {
    if (typeof name !== 'string' || !name.trim()) throw new LocalizedError(t('Enter a pack name.'));
    const trimmedName = name.trim();
    if (trimmedName.length > lespMaxNameLength) throw new LocalizedError(t('The pack name is too long.'));
    const nameBytes = new TextEncoder().encode(trimmedName);
    if (nameBytes.length > lespMaxNameBytes) throw new LocalizedError(t('The pack name is too long.'));
    if (!Array.isArray(arrayOfPngDataUrls) || !arrayOfPngDataUrls.length ||
        arrayOfPngDataUrls.length > lespMaxImages) {
      throw new LocalizedError(t('A pack must contain between 1 and 100 Smiles.'));
    }

    const locked = passwordString.length > 0;
    const headerLength = lespHeader.length + 1 + (locked ? lespLockBytes : 0);
    const images = [];
    let payloadLength = 4 + nameBytes.length;
    for (const dataUrl of arrayOfPngDataUrls) {
      const image = lespDecodeDataUrl(dataUrl);
      payloadLength += 4 + image.length;
      if (headerLength + payloadLength + (locked ? lespTagBytes : 0) > lespMaxPackBytes) {
        throw new LocalizedError(t('A pack may be at most 16 MiB.'));
      }
      await lespCheckSmile(image);
      images.push(image);
    }

    const payload = new Uint8Array(payloadLength);
    const payloadView = new DataView(payload.buffer);
    payloadView.setUint16(0, nameBytes.length);
    payloadView.setUint16(2, images.length);
    payload.set(nameBytes, 4);
    let offset = 4 + nameBytes.length;
    for (const image of images) {
      payloadView.setUint32(offset, image.length);
      payload.set(image, offset + 4);
      offset += 4 + image.length;
    }

    const header = new Uint8Array(headerLength);
    header.set(lespHeader);
    header[5] = Number(locked);
    if (!locked) return new Blob([header, payload], { type: 'application/octet-stream' });

    crypto.getRandomValues(header.subarray(6));
    const key = await lespKey(passwordString, header.subarray(6, 22));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: header.subarray(22), additionalData: header },
      key,
      payload
    );
    return new Blob([header, ciphertext], { type: 'application/octet-stream' });
  }

  async function lespInspectPack(file) {
    if (file.size < 10 || file.size > lespMaxPackBytes) {
      throw new LocalizedError(t('A pack may be at most 16 MiB and must contain a LESP header.'));
    }
    const prefix = new Uint8Array(await file.slice(0, 6).arrayBuffer());
    if (!lespHeader.every((byte, index) => prefix[index] === byte) || prefix[5] > 1) {
      throw new LocalizedError(t('Unsupported LESP pack format.'));
    }
    const locked = prefix[5] === 1;
    const headerLength = prefix.length + (locked ? lespLockBytes : 0);
    if (file.size < headerLength + 4 + (locked ? lespTagBytes : 0)) {
      throw new LocalizedError(t('The LESP pack is truncated.'));
    }
    return { locked, headerLength };
  }

  async function isLockedPack(file) {
    return (await lespInspectPack(file)).locked;
  }

  async function readPack(file, passwordString = '') {
    const { locked, headerLength } = await lespInspectPack(file);
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    let payload = fileBytes.subarray(headerLength);
    if (locked) {
      const key = await lespKey(passwordString, fileBytes.subarray(6, 22));
      try {
        const plaintext = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: fileBytes.subarray(22, headerLength), additionalData: fileBytes.subarray(0, headerLength) },
          key,
          payload
        );
        payload = new Uint8Array(plaintext);
      } catch {
        throw new LocalizedError(t('The pack password is incorrect or the pack is damaged.'));
      }
    }

    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const nameLength = view.getUint16(0);
    const count = view.getUint16(2);
    if (!nameLength || nameLength > lespMaxNameBytes || 4 + nameLength > payload.length ||
        !count || count > lespMaxImages) throw new LocalizedError(t('The LESP pack metadata is invalid.'));

    const name = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(payload.subarray(4, 4 + nameLength)).trim();
    if (!name || name.length > lespMaxNameLength) throw new LocalizedError(t('The LESP pack name is invalid.'));
    const images = [];
    let offset = 4 + nameLength;
    for (let index = 0; index < count; index += 1) {
      if (offset + 4 > payload.length) throw new LocalizedError(t('The LESP pack is truncated.'));
      const size = view.getUint32(offset);
      offset += 4;
      if (!size || size > lespMaxImageBytes || offset + size > payload.length) {
        throw new LocalizedError(t('The LESP pack contains an invalid PNG length.'));
      }
      images.push(payload.subarray(offset, offset + size));
      offset += size;
    }
    if (offset !== payload.length) throw new LocalizedError(t('The LESP pack contains unexpected trailing data.'));
    for (const image of images) await lespCheckSmile(image);
    return { name, smiles: images.map(lespEncodeDataUrl) };
  }

  const packPickerSelector = '.cont_add_smile .list_smile';
  const smileIdOrder = new Intl.Collator('en', { numeric: true });

  // Both views get their own server list. Put higher numeric Smile IDs first in each.
  function newestSmileFirst(leftId, rightId) {
    return smileIdOrder.compare(rightId, leftId);
  }

  // Keep the original nodes and their handlers. Leave nodes in place on repeat renders.
  function arrangePackChildren(parent, ordered) {
    let next = null;
    for (let i = ordered.length - 1; i >= 0; i--) {
      const node = ordered[i];
      if (node.parentNode !== parent || node.nextElementSibling !== next) parent.insertBefore(node, next);
      next = node;
    }
  }

  // LESP v1 stores the reserved name in English, independent of the UI locale.
  const packUnsortedName = 'Unsorted';

  function isUnsortedPackName(name) {
    return name.toLowerCase() === packUnsortedName.toLowerCase();
  }

  function displayPackName(name) {
    return isUnsortedPackName(name) ? t('Unsorted') : name;
  }
  const packProtectionChecks = new Map();
  let renderPackLibrary = () => {};

  function refreshPackLibrary() {
    renderPackLibrary();
  }

  function makePackElement(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function makePackButton(text, action, className = 'lscp-button') {
    const button = makePackElement('button', className, text);
    button.type = 'button';
    button.addEventListener('click', action);
    return button;
  }

  function installPackStyles() {
    if (document.querySelector('#lscp-pack-styles')) return;
    const style = document.createElement('style');
    style.id = 'lscp-pack-styles';
    style.textContent = `
      .lscp-install { margin-inline-start: 8px; cursor: pointer; }
      .lscp-toolbar, .lscp-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
      .lscp-toolbar { margin: 12px 0; }
      .lscp-button { padding: 4px 10px; border: 1px solid #aaa; border-radius: 5px;
        background: white; color: #222; font: inherit; font-size: 14px; cursor: pointer; }
      .lscp-button:hover:enabled { background: #f0f4ef; border-color: #6a8168; }
      .lscp-button:disabled { opacity: .5; cursor: default; }
      .lscp-pack { margin-block: 6px; border: 1px solid #d2d2d2; border-radius: 4px; text-align: start; }
      .lscp-pack > summary { cursor: pointer; padding: 7px 10px; overflow-wrap: anywhere; font-weight: 600; }
      .lscp-pack > .lscp-actions { padding: 4px 10px; }
      .lscp-library-cards { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px; padding: 8px; }
      .lscp-library-card { display: grid; gap: 6px; width: max-content; max-width: 100%; }
      .lscp-library-card[hidden] { display: none; }
      .lscp-library-card > .one_smile { margin: 0; }
      .lscp-library-card > select { max-width: 166px; }
      .lscp-library-card > label { display: flex; align-items: start; gap: 4px; font-size: 12px; }
      .lscp-library-card > label > input { flex: none; }
      .lscp-library-card > label > span { max-width: 132px; }
      .lscp-picker-pack { margin-inline: 4px; }
      .lscp-picker-cards { display: flow-root; }
      .list_smile .one_smile:has(> .lscp-picker-lock) { position: relative; }
      .lscp-picker-lock { position: absolute; inset-block-start: 1px; inset-inline-end: 1px;
        width: 16px; height: 16px; line-height: 0; pointer-events: none; }
      .lscp-picker-lock svg { width: 100%; height: 100%; }
    `;
    document.head.append(style);
  }

  function makePackGroup(className, open) {
    const details = makePackElement('details', className);
    details.open = open;
    const summary = document.createElement('summary');
    details.append(summary);
    return { details, summary };
  }

  function requestPackName(currentName = '') {
    const name = window.prompt(currentName ? t('Rename Smile pack') : t('Name your Smile pack'), currentName);
    if (name === null) return null;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 80) {
      window.alert(t('Enter a pack name between 1 and 80 characters.'));
      return null;
    }
    return trimmed;
  }

  function checkPackName(state, name, exceptId) {
    const key = name.toLowerCase();
    if (isUnsortedPackName(name) || key === russian['Unsorted'].toLowerCase() || state.packs.some(pack => pack.id !== exceptId && pack.name.toLowerCase() === key)) {
      throw new LocalizedError(t('That pack name is already in use. Choose another name.'));
    }
  }

  function assignSmilePack(smileId, packId) {
    return withLibraryWrite(async () => {
      const snapshot = await fetchLibrary();
      if (!snapshot.has(smileId)) throw new LocalizedError(t('This Smile changed. Reload My emotes.'));
      await changePackState(state => {
        splitOversizedPacks(state, snapshot);
        if (!packId) {
          delete state.members[smileId];
          return;
        }
        if (state.members[smileId] === packId) return;
        if (!state.packs.some(pack => pack.id === packId)) {
          throw new LocalizedError(t('That Smile pack is no longer available.'));
        }
        if (packMemberCount(state, packId, snapshot) >= maxNamedPackSize) {
          throw new LocalizedError(t('This pack already has {limit} Smiles. Move one out or choose another pack.', { limit: maxNamedPackSize }));
        }
        state.members[smileId] = packId;
      });
    });
  }

  function readLibraryProtection(entry) {
    if (!packProtectionChecks.has(entry.url)) {
      packProtectionChecks.set(entry.url, readOwnedCanvas(entry.url).then(
        canvas => hasNoCopyMark(canvas),
        () => null
      ));
    }
    return packProtectionChecks.get(entry.url);
  }

  function setupPackLibrary() {
    const list = document.querySelector('#list_smiles');
    if (!list) return;

    installPackStyles();
    const toolbar = makePackElement('div', 'lscp-toolbar');
    const status = makePackElement('span', 'lscp-pack-status');
    status.setAttribute('role', 'status');
    const showError = error => {
      status.textContent = displayError(error, 'Could not update the Smile pack.');
    };
    toolbar.append(makePackButton(t('New pack'), () => {
      const name = requestPackName();
      if (name === null) return;
      status.textContent = '';
      changePackState(state => {
        checkPackName(state, name);
        state.packs.push({ id: crypto.randomUUID(), name });
      }).catch(showError);
    }), status);
    list.before(toolbar);

    const drawLink = Array.from(list.parentElement.querySelectorAll('a[href]')).find(link => {
      const url = new URL(link.href, location.href);
      return url.origin === location.origin && url.pathname === '/settings' &&
        url.searchParams.get('new') === 'smile';
    });
    const install = makePackButton(t('Install pack'), openPackInstall, 'btn btn_green lscp-install');
    if (drawLink) drawLink.after(install);
    else toolbar.prepend(install);

    const groups = new Map();
    const tileByCard = new Map();
    const pendingProtection = new Set();
    const tileByWrapper = new WeakMap();
    const protectionObserver = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          protectionObserver.unobserve(entry.target);
          checkProtection(tileByWrapper.get(entry.target));
        }
      }, { rootMargin: '100px' })
      : null;

    function queueProtection(tile) {
      if (tile.checked) return;
      if (protectionObserver) protectionObserver.observe(tile.wrapper);
      else checkProtection(tile);
    }

    function buildTile(card, entry) {
      const wrapper = makePackElement('div', 'lscp-library-card');
      const move = document.createElement('select');
      move.setAttribute('aria-label', t('Move Smile to pack'));
      move.title = t('Move Smile to pack');
      move.addEventListener('change', async () => {
        move.disabled = true;
        status.textContent = '';
        try {
          const destination = move.value;
          await assignSmilePack(entry.id, destination);
          const group = groups.get(destination);
          if (group) group.details.open = true;
        } catch (error) {
          showError(error);
          refreshPackLibrary();
        } finally {
          move.disabled = false;
        }
      });

      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.disabled = true;
      checkbox.setAttribute('aria-label', t('Copy protection'));
      const caption = makePackElement('span', '', t('Checking copy protection…'));
      label.append(checkbox, caption);

      const tile = { wrapper, move, checkbox, caption, entry, protected: null, checked: false };
      checkbox.addEventListener('change', async () => {
        const desired = checkbox.checked;
        checkbox.checked = tile.protected;
        if (pendingProtection.has(entry.id)) return;
        pendingProtection.add(entry.id);
        checkbox.disabled = true;
        move.disabled = true;
        status.textContent = '';
        try {
          const result = await changeOwnedProtection(entry, desired);
          if (result) {
            const message = desired
              ? t('The old library entry was replaced with the protected edition.')
              : t('The old library entry was replaced with the shareable edition.');
            status.textContent = result.otherPack
              ? message + ' ' + t('The matching edition remains in {pack}.', { pack: result.otherPack })
              : message;
          }
        } catch (error) {
          showError(error);
        } finally {
          pendingProtection.delete(entry.id);
          checkbox.disabled = false;
          move.disabled = false;
        }
      });

      wrapper.append(card, move, label);
      tileByWrapper.set(wrapper, tile);
      return tile;
    }

    function checkProtection(tile) {
      if (tile.checked) return;
      tile.checked = true;
      readLibraryProtection(tile.entry).then(protectedSmile => {
        tile.protected = protectedSmile;
        tile.checkbox.checked = protectedSmile === true;
        tile.checkbox.disabled = protectedSmile === null || pendingProtection.has(tile.entry.id);
        tile.caption.textContent = protectedSmile === null ? t('Copy protection unavailable') : t('Copy protection');
        tile.checkbox.title = protectedSmile === null ? '' : t('Replace this library entry with the new sharing preference');
      });
    }

    function buildGroup(id) {
      const group = makePackGroup('lscp-pack', !id);
      const actions = makePackElement('div', 'lscp-actions');
      group.cards = makePackElement('div', 'lscp-library-cards');
      if (id) {
        actions.append(makePackButton(t('Rename'), () => {
          const name = requestPackName(group.name);
          if (name === null || name === group.name) return;
          status.textContent = '';
          changePackState(state => {
            const pack = state.packs.find(pack => pack.id === id);
            if (!pack) throw new LocalizedError(t('That Smile pack is no longer available.'));
            checkPackName(state, name, id);
            pack.name = name;
          }).catch(showError);
        }));
      }
      group.download = makePackButton(t('Download pack'), () => openPackExport(group.name, group.entries, id ? group.name : packUnsortedName));
      actions.append(group.download);
      group.details.append(actions, group.cards);
      group.details.addEventListener('toggle', () => {
        if (!group.details.open) return;
        for (const tile of group.tiles) queueProtection(tile);
      });
      return group;
    }

    const observer = new MutationObserver(() => renderPackLibrary());
    function observeLibrary() {
      observer.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'src', 'data-id', 'hidden'] });
    }

    renderPackLibrary = () => {
      observer.disconnect();
      try {
        const state = readPackState();
        const namedPacks = new Map(state.packs.map(pack => [pack.id, pack.name]));
        const groupedTiles = new Map(['', ...namedPacks.keys()].map(id => [id, []]));
        const cards = getLibraryCards(list);
        for (const emptyMessage of list.querySelectorAll('.no_smiles')) {
          emptyMessage.hidden = cards.length > 0;
        }
        const currentCards = new Set(cards);
        for (const [card, tile] of tileByCard) {
          if (currentCards.has(card)) continue;
          protectionObserver?.unobserve(tile.wrapper);
          if (list.contains(card)) {
            tile.wrapper.hidden = true;
          } else {
            tile.wrapper.remove();
            tileByCard.delete(card);
          }
        }
        const options = [{ id: '', name: t('Unsorted') }, ...state.packs];
        const optionsKey = JSON.stringify(options);
        for (const card of cards) {
          const entry = libraryEntry(card);
          if (!entry) continue;
          let tile = tileByCard.get(card);
          if (tile && (tile.entry.id !== entry.id || tile.entry.url !== entry.url)) {
            const previous = tile;
            tile = buildTile(card, entry);
            protectionObserver?.unobserve(previous.wrapper);
            previous.wrapper.remove();
            tileByCard.set(card, tile);
          }
          if (!tile) {
            tile = buildTile(card, entry);
            tileByCard.set(card, tile);
          }
          tile.wrapper.hidden = false;
          if (tile.optionsKey !== optionsKey) {
            tile.move.replaceChildren(...options.map(({ id, name }) => new Option(name, id)));
            tile.optionsKey = optionsKey;
          }
          const savedId = state.members[entry.id];
          const groupId = namedPacks.has(savedId) ? savedId : '';
          tile.move.value = groupId;
          groupedTiles.get(groupId).push(tile);
        }
        for (const [id, tiles] of groupedTiles) {
          tiles.sort((a, b) => newestSmileFirst(a.entry.id, b.entry.id));
          if (!groups.has(id)) groups.set(id, buildGroup(id));
          const group = groups.get(id);
          group.name = namedPacks.get(id) ?? t('Unsorted');
          group.tiles = tiles;
          group.entries = tiles.map(tile => tile.entry);
          group.summary.textContent = `${group.name} (${tiles.length})`;
          group.download.disabled = !tiles.length;
          group.cards.hidden = !tiles.length;
          if (group.details.parentElement !== list) list.append(group.details);
          arrangePackChildren(group.cards, tiles.map(tile => tile.wrapper));
          if (group.details.open) tiles.forEach(queueProtection);
        }
        for (const [id, group] of groups) {
          if (groupedTiles.has(id)) continue;
          group.details.remove();
          groups.delete(id);
        }
      } catch (error) {
        showError(error);
      } finally {
        observeLibrary();
      }
    };

    document.addEventListener('lsc-packs-changed', refreshPackLibrary);
    refreshPackLibrary();
  }

  function makeProtectionLock() {
    const badge = makePackElement('span', 'lscp-picker-lock');
    badge.title = t('This Smile is protected from collection');
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', badge.title);
    badge.innerHTML = `<svg viewBox="0 0 20 20" width="100%" height="100%" aria-hidden="true" focusable="false">
      <path d="M6 9V6a4 4 0 0 1 8 0v3" fill="none" stroke="#fff" stroke-width="3.7"/>
      <path d="M6 9V6a4 4 0 0 1 8 0v3" fill="none" stroke="#111" stroke-width="1.6"/>
      <rect x="3.4" y="8" width="13.2" height="10" rx="2" fill="#111" stroke="#fff" stroke-width="1.1"/>
      <path d="M10 12v2" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>
    </svg>`;
    return badge;
  }

  function setupPackPickers() {
    const pickerGroups = new WeakMap();
    const pickerEntries = '.one_smile[data-id]';
    const checkedUrls = new WeakMap();
    let scheduled = false;

    async function labelPickerSmile(card) {
      const entry = libraryEntry(card);
      if (!entry || checkedUrls.get(card) === entry.url) return;
      checkedUrls.set(card, entry.url);
      card.querySelector(':scope > .lscp-picker-lock')?.remove();
      const protectedSmile = await readLibraryProtection(entry);
      if (!protectedSmile || !card.isConnected || libraryEntry(card)?.url !== entry.url) return;
      card.append(makeProtectionLock());
    }

    const badgeObserver = new IntersectionObserver(entries => {
      for (const { target, isIntersecting } of entries) {
        if (isIntersecting) {
          badgeObserver.unobserve(target);
          labelPickerSmile(target);
        }
      }
    });

    function renderPicker(list, state) {
      const entries = Array.from(list.querySelectorAll(pickerEntries));
      entries.sort((a, b) => newestSmileFirst(a.dataset.id, b.dataset.id));
      for (const card of entries) {
        if (checkedUrls.get(card) !== libraryEntry(card)?.url) badgeObserver.observe(card);
      }
      const groups = pickerGroups.get(list) ?? new Map();
      pickerGroups.set(list, groups);
      for (const group of groups.values()) {
        if (group.details.parentElement !== list) group.cards.replaceChildren();
      }
      const byId = new Map(state.packs.map(pack => [pack.id, []]));
      byId.set('', []);
      for (const entry of entries) {
        const packId = state.members[entry.getAttribute('data-id')];
        (byId.get(packId) ?? byId.get('')).push(entry);
      }

      const scrollTop = list.scrollTop;
      const available = [{ id: '', name: t('Unsorted') }, ...state.packs];
      const showGroups = state.packs.length > 0;
      const visibleGroups = new Set();
      for (const { id, name } of available) {
        const cards = byId.get(id);
        if (!cards.length) continue;
        if (!showGroups) {
          arrangePackChildren(list, cards);
          continue;
        }
        visibleGroups.add(id);
        if (!groups.has(id)) {
          const group = makePackGroup('lscp-pack lscp-picker-pack', !id);
          group.cards = makePackElement('div', 'lscp-picker-cards');
          const actions = makePackElement('div', 'lscp-actions');
          actions.append(makePackButton(t('Download pack'), () => openPackExport(group.name, group.entries, id ? group.name : packUnsortedName)));
          group.details.append(actions, group.cards);
          groups.set(id, group);
        }
        const group = groups.get(id);
        group.name = name;
        group.entries = cards.map(libraryEntry).filter(Boolean);
        const title = `${name} (${cards.length})`;
        if (group.summary.textContent !== title) group.summary.textContent = title;
        arrangePackChildren(group.cards, cards);
      }
      for (const [id, group] of groups) {
        if (!visibleGroups.has(id)) group.details.remove();
        if (!byId.has(id)) groups.delete(id);
      }
      arrangePackChildren(list, Array.from(visibleGroups, id => groups.get(id).details));
      list.scrollTop = scrollTop;
    }

    function renderPickers() {
      scheduled = false;
      const lists = document.querySelectorAll(packPickerSelector);
      if (!lists.length) return;
      let state;
      try {
        state = readPackState();
      } catch {
        return;
      }
      installPackStyles();
      for (const list of lists) renderPicker(list, state);
    }

    function schedulePickers() {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(renderPickers);
    }

    function containsPicker(node) {
      return node instanceof Element && (node.matches(packPickerSelector) || node.querySelector(packPickerSelector));
    }

    new MutationObserver(records => {
      if (records.some(({ target, addedNodes }) => {
        if (target instanceof Element && target.matches(packPickerSelector)) return true;
        return Array.from(addedNodes).some(containsPicker);
      })) schedulePickers();
    }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('lsc-packs-changed', schedulePickers);
    schedulePickers();
  }


  if (!onSettings) setupCollector();
  if (profile) {
    window.addEventListener('storage', event => {
      if (event.key === storageKey || event.key === null) document.dispatchEvent(new Event('lsc-packs-changed'));
    });
    migrateOversizedPacks().catch(() => {});
    if (onSettings) {
      if (query.get('new') === 'smile') setupEditorProtection();
      if (query.get('act') === 'smiles') setupPackLibrary();
    } else {
      setupPackPickers();
    }
  }
})();
