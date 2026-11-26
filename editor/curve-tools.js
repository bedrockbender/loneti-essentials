function createCurveTools(q, tr, notify, redraw) {
  const layers = curveLayers();
  let revision, historyKey, draft = [], gesture, join, preview, selection, previewCanvas;
  const selected = new Set();
  const action = () => q('[data-curve-action]').value;
  function selectionControls() {
    q('[data-raise]').disabled = q('[data-lower]').disabled = !selected.size;
    q('[data-selected-count]').textContent = tr('Selected','Выбрано')+' · '+selected.size;
  }
  function reset() {
    draft = []; gesture = join = preview = revision = null;
    selected.clear(); selectionControls();
    q('[data-pressure-value]').textContent = '';
  }
  function sync(edit, mask) {
    const next = layers.read(edit);
    if (revision !== next) {
      join = gesture = preview = null;
      for (const item of selected) if (!next.entries.includes(item)) selected.delete(item);
      selectionControls();
    }
    revision = next;
    historyKey = edit.historyKey();
    selection = mask;
  }
  function eligible(stroke) {
    return !selection || stroke.mask === selection || (stroke.mask &&
      selection.length === stroke.mask.length && selection.every((v,i) => v === stroke.mask[i]));
  }
  function stroke(points, clip = null) {
    return {points, clip, mask:selection, color:q('[data-ink-color]').value,
      width:curveClamp(Number(q('[data-ink-width]').value) || 1,1,2000), preset:q('[data-ink]').value};
  }
  function add(p) {
    if (!draft.length || curveDistance(draft[draft.length-1],p) > .01) draft.push({...p,pressure:1});
  }
  function down(tool, p, edit, shiftKey) {
    if (tool === 'curve') return;
    const mode = tool === 'pressure' ? 'pressure' : action();
    const a = edit.canvasToClient(0,0), b = edit.canvasToClient(1,0), zoom = Math.max(.01,curveDistance(a,b));
    const hit = segments => curveHit(revision.entries,p,(segments ? 20 : 12)/zoom,segments,eligible);
    const byPoint = ['pressure','move','deform','deletePoint','split','join'].includes(mode);
    let target = hit(!byPoint), insert = false;
    if (mode === 'select') {
      const additive = shiftKey || q('[data-multi]').checked;
      if (!additive) selected.clear();
      if (target) {
        const item = revision.entries[target.i];
        if (additive && selected.has(item)) selected.delete(item); else selected.add(item);
      }
      selectionControls(); redraw(); return;
    }
    if (!target && mode === 'move') { target = hit(true); insert = !!target; }
    if (!target) { notify(tr('Choose a Curve stroke on this layer. Clear the selection to edit across it.',
      'Выберите кривую на этом слое. Снимите выделение, чтобы редактировать кривые за его пределами.')); return; }
    const original = revision.entries[target.i];
    const points = [...original.points];
    let j = target.j;
    if (insert || mode === 'add') points.splice(++j,0,target.point);
    gesture = {mode, i:target.i, j, start:p, original, points, insert};
    update(p);
  }
  function update(p) {
    if (!gesture) return;
    const {mode, original, points, start, j} = gesture;
    const dx = p.x-start.x, dy = p.y-start.y;
    let changed = points;
    if (mode === 'pressure') {
      const pressure = curveClamp(points[j].pressure+(dx-dy)*.01,0,4);
      changed = points.map((v,i) => i===j ? {...v,pressure} : v);
      q('[data-pressure-value]').textContent = Math.round(pressure*100)+'%';
    } else if (['move','moveStroke','duplicate','deform'].includes(mode)) {
      const distance = points.map(() => 0);
      if (mode === 'deform') {
        for (let i=j-1;i>=0;i--) distance[i]=distance[i+1]+curveDistance(points[i+1],points[i]);
        for (let i=j+1;i<points.length;i++) distance[i]=distance[i-1]+curveDistance(points[i-1],points[i]);
      }
      const radius = Math.max(1, Number(q('[data-deform-radius]').value));
      changed = points.map((v,i) => {
        const t = Math.max(0,1-distance[i]/radius);
        const weight = mode === 'move' ? Number(i===j) : t*t*(3-2*t);
        return {...v,x:v.x+dx*weight,y:v.y+dy*weight};
      });
    }
    preview = {...original,points:changed};
  }
  function editResult(p) {
    if (!gesture) return;
    update(p);
    const {i,j,mode,original,points,start,insert} = gesture, changed = preview;
    gesture = preview = null;
    const entries = [...revision.entries];
    const replace = (...strokes) => entries.splice(i,1,...strokes);
    if (mode === 'join') {
      if (j !== 0 && j !== points.length-1) {
        notify(tr('Tap an endpoint to join curves.', 'Для соединения нажмите на конец кривой.')); return;
      }
      if (!join) { join = {i,j}; redraw(); notify(tr('Choose the other endpoint.', 'Выберите второй конец.')); return; }
      const first = entries[join.i], firstIndex = join.i, firstPoint = join.j;
      join = null;
      if (first === original || first.color !== original.color || first.width !== original.width ||
          first.preset !== original.preset || first.mask !== original.mask) {
        notify(tr('Choose two curves with the same ink, color, width and selection.',
          'Выберите две кривые с одинаковыми тушью, цветом, шириной и выделением.')); return;
      }
      const joined = [...(firstPoint===0 ? [...first.points].reverse() : first.points),
        ...(j===0 ? points : [...points].reverse())];
      entries.splice(Math.max(firstIndex,i),1);
      entries.splice(Math.min(firstIndex,i),1,{...first,points:joined});
    } else if (mode === 'deleteStroke') replace();
    else if (mode === 'deletePoint') {
      const rest = points.filter((_,n) => n!==j);
      replace(...(rest.length ? [{...original,points:rest}] : []));
    } else if (mode === 'split') {
      if (j===0 || j===points.length-1) return;
      replace({...original,points:points.slice(0,j+1)}, {...original,points:points.slice(j)});
    } else if (mode === 'reverse') replace({...original,points:points.reverse()});
    else if (mode === 'smooth') {
      if (points.length<3) return;
      replace({...original,points:points.map((v,n) => n && n < points.length-1 ?
        {...v,x:(points[n-1].x+2*v.x+points[n+1].x)/4,y:(points[n-1].y+2*v.y+points[n+1].y)/4} : v)});
    } else if (mode === 'reduce') {
      const kept = [points[0]];
      for (let n=1;n<points.length-1;n++) {
        const a=kept[kept.length-1], b=points[n+1], v=points[n];
        const span=curveDistance(a,b), t=span ? curveClamp(((v.x-a.x)*(b.x-a.x)+(v.y-a.y)*(b.y-a.y))/(span*span),0,1) : 0;
        if (Math.hypot(v.x-a.x-t*(b.x-a.x),v.y-a.y-t*(b.y-a.y))>.65 ||
            Math.abs(v.pressure-a.pressure-t*(b.pressure-a.pressure))>.02) kept.push(v);
      }
      if (points.length<=2 || kept.length+1===points.length) return;
      replace({...original,points:[...kept,points[points.length-1]]});
    } else if (mode === 'duplicate') entries.splice(i+1,0,changed);
    else {
      if (!insert && mode!=='add' && curveDistance(start,p)<.001) return;
      replace(changed);
    }
    return entries;
  }
  function reorder(direction) {
    if (!selected.size) return;
    const entries = [...revision.entries];
    let moved = false;
    for (let n=0; n<entries.length-1; n++) {
      const i = direction>0 ? entries.length-2-n : 1+n, other = i+direction;
      if (selected.has(entries[i]) && eligible(entries[i]) && entries[other].points &&
          eligible(entries[other]) && !selected.has(entries[other])) {
        [entries[i],entries[other]] = [entries[other],entries[i]];
        moved = true;
      }
    }
    if (moved) return entries;
  }
  function draw(ctx, tool, hover, screen, clip) {
    if (!revision) return;
    const shown = tool==='curve' ? draft : null;
    const moving = shown?.length ? stroke(hover && curveDistance(shown[shown.length-1],hover)>.01 ?
      [...shown,{...hover,pressure:1}] : shown,clip) : preview;
    if (moving) {
      ctx.save();
      if (moving.clip) {
        if (!previewCanvas || previewCanvas.width!==moving.clip.width || previewCanvas.height!==moving.clip.height) {
          previewCanvas = drawingCanvas(moving.clip.width,moving.clip.height);
        }
        const ink = previewCanvas.getContext('2d');
        ink.globalCompositeOperation='source-over'; ink.clearRect(0,0,previewCanvas.width,previewCanvas.height);
        ink.fillStyle=moving.color; ink.fill(inkGeometry(moving).path);
        ink.globalCompositeOperation='destination-in'; ink.drawImage(moving.clip,0,0);
        ctx.drawImage(previewCanvas,0,0);
      } else { ctx.fillStyle=moving.color; ctx.fill(inkGeometry(moving).path); }
      ctx.restore();
    }
    ctx.save(); ctx.resetTransform();
    const handles = (points,active) => points.forEach((p,j) => {
      const {x,y}=screen(p);
      const highlighted = active===j || active==='all';
      ctx.beginPath(); ctx.arc(x,y,highlighted ? 5 : 3.5,0,Math.PI*2);
      ctx.fillStyle=highlighted ? '#ffbe54' : 'white'; ctx.fill();
      ctx.lineWidth=1.5; ctx.strokeStyle='#205854'; ctx.stroke();
    });
    if (shown) handles(shown,-1);
    else revision.entries.forEach((s,i) => {
      if (s.points && eligible(s)) handles(gesture?.i===i ? preview.points : s.points,
        gesture?.i===i ? gesture.j : join?.i===i ? join.j : selected.has(s) ? 'all' : -1);
    });
    ctx.restore();
  }
  q('[data-curve-action]').onchange = () => {
    gesture = preview = join = null;
    selected.clear(); selectionControls();
    q('[data-curve-order]').hidden = action() !== 'select';
    q('[data-deform]').hidden = action() !== 'deform'; redraw();
  };
  for (const name of ['ink','ink-width','ink-color']) q('[data-'+name+']').oninput = redraw;
  return {reset, sync, down, update, add, editResult, draw, reorder,
    needsSync: edit => edit.historyKey() !== historyKey || edit.layerKey !== revision?.layer,
    count: () => draft.length, back: () => draft.pop(),
    cancelDrag() { gesture = preview = null; },
    finish: clip => draft.length && [...revision.entries,stroke(draft,clip)],
    async commit(edit, entries, finished) {
      const next = await layers.write(edit,revision,entries);
      revision = next; historyKey = edit.historyKey();
      if (finished) draft = [];
    }};
}
