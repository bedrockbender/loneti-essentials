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
    if (!this.user_context.checkMyUser()) return drawLines.call(this, points);
    // Native lasso activation sizes this overlay. The wand and polygon can
    // reach it directly, even if the room was hidden when the lasso was built.
    const overlay = this.getCanvas();
    const viewport = this.canva.work_canvas.getSizeCanvas();
    // LONETI also composites this canvas during a resize. drawImage needs
    // a nonempty source even when its destination is temporarily hidden.
    const width = Math.max(1, viewport.width), height = Math.max(1, viewport.height);
    if (overlay.width !== width) overlay.width = width;
    if (overlay.height !== height) overlay.height = height;
    const contours = nativeEditorContours.get(points);
    if (!contours) return drawLines.call(this, points);
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
    historyKey: () => history.getCurrentState(),
    curveRevision(versions) {
      for (let i = history.current_index; i >= 0; i--) {
        const revision = versions.get(history.states[i]);
        if (revision?.layer === canvas && revision.base.width === width && revision.base.height === height) return revision;
      }
      return null;
    },
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
      return history.getCurrentState();
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
