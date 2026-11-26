function startDrawingTools() {
  if (!nativeEditorRoute || !document.body) return;
  const active = new Map();
  function reconcile() {
    for (const [surface, dispose] of active) {
      if (!surface.isConnected || !surface.querySelector('[data-loneti-essentials="tools"]')) {
        dispose();
        active.delete(surface);
      }
    }
    for (const surface of document.querySelectorAll('.js--container-work-canvas')) {
      if (!active.has(surface)) active.set(surface, installDrawingTools(surface));
    }
  }
  reconcile();
  const observer = new MutationObserver(changes => {
    for (const change of changes) {
      for (const node of [...change.addedNodes, ...change.removedNodes]) {
        if (node.nodeType === 1 && (node.matches('.js--container-work-canvas,[data-loneti-essentials="tools"]') ||
            node.querySelector('.js--container-work-canvas,[data-loneti-essentials="tools"]'))) {
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
