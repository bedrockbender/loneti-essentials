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
  const finishBtn = q('[data-finish]'), undoPt = q('[data-back]');
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
  const lifecycle = new AbortController();
  const gradient = gradientEditor(q('[data-gradient-options]'), tr, notify, lifecycle.signal);
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
  q('[data-tolerance]').oninput = () => { q('[data-tolerance-value]').textContent = q('[data-tolerance]').value; };
  q('[data-tolerance]').onchange = q('[data-contiguous]').onchange = q('[data-combine]').onchange = adjustWand;
  q('[data-erase]').onclick = () => void paint('erase');
  q('[data-fill]').onclick = () => void paint('fill');
  q('[data-clear]').onclick = () => {
    try { requireEditor(); selectMask(null); wandBase = null; controls(); notify(''); } catch(e) { failure(e); }
  };
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
