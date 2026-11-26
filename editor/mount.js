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
