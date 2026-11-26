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
