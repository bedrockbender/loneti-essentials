// Keep control points with their native history revisions for the lifetime of this editor.
// The site saves regular pixels. Intervening raster marks replay in their original paint order.
function curveLayers() {
  const layers = new WeakMap();
  let cachedRevision, cachedPixels;
  const words = image => new Uint32Array(image.data.buffer, image.data.byteOffset, image.data.length/4);
  function rasterChanges(old, current) {
    const a = words(old), b = words(current), runs = [];
    for (let i=0; i<b.length;) {
      if (a[i] === b[i]) { i++; continue; }
      const start = i++;
      while (i<b.length && a[i] !== b[i]) i++;
      runs.push({start, values:b.slice(start,i)});
    }
    return runs;
  }
  function flatten(revision) {
    if (revision === cachedRevision) return cachedPixels;
    const {base,entries} = revision;
    const canvas = drawingCanvas(base.width,base.height);
    const ctx = canvas.getContext('2d',{willReadFrequently:true});
    ctx.putImageData(base,0,0);
    let clipCanvas;
    for (const entry of entries) {
      if (entry.runs) {
        const raster = ctx.getImageData(0,0,base.width,base.height), pixels = words(raster);
        for (const run of entry.runs) pixels.set(run.values,run.start);
        ctx.putImageData(raster,0,0);
      } else if (entry.clip) {
        clipCanvas ||= drawingCanvas(base.width,base.height);
        const ink = clipCanvas.getContext('2d');
        ink.clearRect(0,0,base.width,base.height);
        ink.fillStyle = entry.color;
        ink.fill(inkGeometry(entry).path);
        ink.globalCompositeOperation = 'destination-in';
        ink.drawImage(entry.clip,0,0);
        ink.globalCompositeOperation = 'source-over';
        ctx.drawImage(clipCanvas,0,0);
      } else {
        ctx.fillStyle = entry.color;
        ctx.fill(inkGeometry(entry).path);
      }
    }
    cachedRevision = revision;
    cachedPixels = ctx.getImageData(0,0,base.width,base.height);
    return cachedPixels;
  }
  function read(edit) {
    const current = edit.readLayer(), key = edit.historyKey();
    if (!layers.has(edit.layerKey)) layers.set(edit.layerKey,{versions:new WeakMap()});
    const layer = layers.get(edit.layerKey);
    let revision = edit.curveRevision(layer.versions) || (!key && layer.initial);
    if (revision && (revision.base.width !== edit.width || revision.base.height !== edit.height)) revision = null;
    if (!revision) revision = {layer:edit.layerKey,base:current,entries:[]};
    else {
      const runs = rasterChanges(flatten(revision), current);
      if (runs.length) revision = {...revision, entries:[...revision.entries,{runs}]};
    }
    if (key) layer.versions.set(key,revision); else layer.initial = revision;
    cachedRevision = revision;
    cachedPixels = current;
    return revision;
  }
  async function write(edit, previous, entries) {
    // A lock, Undo, layer switch or another stroke can occur during a drag.
    if (read(edit) !== previous) throw editorFailure('layerChanged');
    const next = {...previous,entries};
    const key = await edit.commitLayer(flatten(next));
    layers.get(edit.layerKey).versions.set(key,next);
    return next;
  }
  return {read,write};
}
