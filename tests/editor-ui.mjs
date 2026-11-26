import assert from 'node:assert/strict';
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
].find(file => file && existsSync(file));

const editors = new Map([
  ['smile', ['Draw a new smiley', 'draw_smile']],
  ['avatar', ['Draw a new avatar', 'draw_avatar']],
  ['drawing', ['Loneti - online drawing board', 'draw']],
  ['room', ['Guest', 'chat']],
]);
function bundleFile(folder, prefix) {
  if (!existsSync(folder)) return;
  const name = readdirSync(folder).find(file => file === prefix + '.js' || file.startsWith(prefix + '.js.'));
  return name && join(folder, name);
}
const paths = [...editors].map(([mode, [name, bundle]]) => {
  const folder = join(dump, name + '_files');
  return [mode, {
    html: join(dump, name + '.html'),
    main: bundleFile(folder, 'mainer'),
    editor: bundleFile(folder, bundle),
  }];
});
const fixtures = new Map(paths.filter(([mode, files]) => {
  const available = Object.values(files).every(file => file && existsSync(file));
  if (!available) console.log('SKIP native ' + mode + ' editor fixture unavailable');
  return available;
}));
if (!browser || !globalThis.WebSocket || !fixtures.size) {
  console.log('SKIP editor integration (requires Node 22+, local Chromium, and saved editor fixtures)');
  process.exit(0);
}

const script = readFileSync(join(repo, 'loneti-smile-collector.user.js'), 'utf8');
const boundary = /\}\)\(\);\r?\n\/\/ END bundled drawing tools/;
assert.match(script, boundary, 'drawing-tools bundle boundary');
const instrumented = script.replace(boundary,
  'window.fixtureEditor = getNativeEditor; window.fixtureEngine = () => nativeEditorEngine;\n})();\n// END bundled drawing tools');
const localGlobals = 'Object.assign(window, {id_user: 0, info_user: null, is_privilege: false, scriptError: error => { throw error; }, t: key => String(key)});';
const csp = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'";

function fixtureHtml(path, mode) {
  // Use the saved structure only. Discard text, scripts, embedded media and URL/identity attributes.
  const structure = readFileSync(path, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(?:meta|link|base|embed)\b[^>]*>/gi, '')
    .replace(/>([^<>]+)</g, '><')
    .replace(/<([\w-]+)\b([^>]*)>/g, (_, tag, attributes) => {
      const kept = attributes.match(/\s(?:class|id|type|data-tool|data-action|data-type-model|lang)=(?:"[^"]*"|'[^']*')/gi);
      return '<' + tag + (kept?.join('') || '') + '>';
    });
  const includes = module => '<script src="/' + module + '?fixture=' + mode + '"></script>';
  return structure.replace(/<head>/i, '<head><style>' +
    '.js--main-drawing-area{position:relative;width:600px;height:550px}' +
    '.js--work-canvas{display:block;width:600px;height:550px}' +
    '#tools{display:flex;flex-wrap:wrap;gap:4px}#tools>.one_tool{width:34px;height:34px}' +
    '</style>' + ['userscript.js', 'mainer.js', 'globals.js', 'editor.js'].map(includes).join(''));
}

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const mode = url.searchParams.get('fixture') || url.searchParams.get('new');
  const files = fixtures.get(mode);
  if (request.method !== 'GET' || !files) return response.writeHead(404).end();
  const route = {smile: '/settings', avatar: '/settings', drawing: '/draw', room: '/chat'}[mode];
  const entries = {
    [route]: () => fixtureHtml(files.html, mode),
    '/userscript.js': () => instrumented,
    '/mainer.js': () => readFileSync(files.main),
    '/globals.js': () => localGlobals +
      'document.documentElement.lang = ' + JSON.stringify(mode === 'avatar' ? 'ru' : 'en') + ';' +
      (mode === 'room' ? "Object.assign(window, {id_user: 123, id_room: 1, auth_hash: 'fixture', is_sweaper: false});" : ''),
    '/editor.js': () => readFileSync(files.editor),
  };
  if (!Object.hasOwn(entries, url.pathname)) return response.writeHead(404).end();
  response.setHeader('Content-Security-Policy', csp);
  response.setHeader('Content-Type', url.pathname === route ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8');
  response.end(entries[url.pathname]());
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

const profile = mkdtempSync(join(tmpdir(), 'loneti-editor-fixture-'));
const chromium = spawn(browser, [
  '--headless', '--disable-background-networking', '--disable-component-update',
  '--disable-sync', '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
], { stdio: 'ignore', windowsHide: true });

async function browserPort() {
  const path = join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const port = readFileSync(path, 'utf8').split(/\r?\n/)[0];
      if (port) return port;
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'EBUSY') throw error;
    }
    await delay(50);
  }
  throw Error('Chromium did not start');
}

let socket;
let call;
const guard = setTimeout(() => {
  console.error('Editor integration timed out');
  process.exitCode = 1;
  socket?.close();
  chromium.kill();
  server.close();
}, 45_000);

try {
  const port = await browserPort();
  const tabs = await fetch('http://127.0.0.1:' + port + '/json/list').then(response => response.json());
  socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, {once: true});
    socket.addEventListener('error', reject, {once: true});
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Page.javascriptDialogOpening') {
      void call('Page.handleJavaScriptDialog', {accept: true});
    }
    const command = pending.get(message.id);
    if (!command) return;
    pending.delete(message.id);
    if (message.error) command.reject(Error(message.error.message));
    else command.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const command of pending.values()) command.reject(Error('Chromium disconnected'));
  });
  call = (method, params = {}) => new Promise((resolve, reject) => {
    const current = ++id;
    pending.set(current, {resolve, reject});
    socket.send(JSON.stringify({id: current, method, params}));
  });
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', {width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false});
  for (const mode of fixtures.keys()) await testEditor(mode);
} finally {
  clearTimeout(guard);
  socket?.close();
  const stopped = new Promise(resolve => {
    if (chromium.exitCode !== null) resolve();
    else chromium.once('close', resolve);
  });
  chromium.kill();
  server.close();
  await stopped;
  try { rmSync(profile, {recursive: true, force: true, maxRetries: 3}); } catch { /* Chromium helpers may still be exiting. */ }
}

async function evaluate(expression) {
  const result = await call('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

async function testEditor(mode) {
  const route = {smile: '/settings?new=smile', avatar: '/settings?new=avatar', drawing: '/draw?fixture=drawing', room: '/chat?fixture=room'}[mode];
  const url = 'http://127.0.0.1:' + server.address().port + route;
  await call('Page.navigate', {url});
  const engineReady = 'location.href === ' + JSON.stringify(url) + ' && Boolean(window.fixtureEngine?.())';
  for (let attempt = 0; attempt < 100 && !(await evaluate(engineReady)); attempt++) await delay(50);
  assert.equal(await evaluate(engineReady), true, mode + ' native engine ready');
  if (mode === 'room') {
    await evaluate(`(() => {
      const engine=fixtureEngine();
      // The room uses a synthetic local layer. CSP prohibits an actual connection.
      const room=engine.parent_context;
      room.connectError=()=>{};
      room.disconnectSocket=()=>{};
      room.socket={connected:true,emit(){}};
      room.is_connect_draw=true;
      if (!engine.users_canvas.getMyUser().user_layers.getActiveLayer()) {
        engine.addNewUser({id:123,vis_name:'Fixture'});
        engine.users_canvas.getMyUser().events_draw.setDraw();
      }
    })()`);
  }
  const ready = 'Boolean(window.fixtureEditor?.() && document.querySelector("#tools button[data-le-tool=gradient]"))';
  for (let attempt = 0; attempt < 100 && !(await evaluate(ready)); attempt++) await delay(50);
  assert.equal(await evaluate(ready), true, mode + ' editor ready');
  assert.equal(await evaluate(`(() => {
    const editor=fixtureEditor();
    editor.surface.scrollIntoView({block:'center'});
    const overlay=editor.surface.querySelector(':scope > [data-loneti-essentials="tools"]').shadowRoot;
    const options=document.querySelector('#cont_config > [data-loneti-essentials="options"]').shadowRoot;
    if (!overlay.querySelector('canvas') || overlay.querySelector('button')) throw Error('Tool controls cover the canvas');
    window.fixtureCanvas=overlay.querySelector('canvas');
    window.control=selector=>options.querySelector(selector);
    window.pixel=(x,y)=>Array.from(editor.readLayer().data.slice(4*(y*editor.width+x),4*(y*editor.width+x)+4));
    window.mask=(x,y)=>editor.readSelection()?.[y*editor.width+x];
    window.count=()=>editor.readSelection()?.reduce((sum,bit)=>sum+bit,0)||0;
    window.historyState=fixtureEngine().users_canvas.getMyUser().states_history;
    return editor.mode;
  })()`), mode);
  const el = selector => 'control(' + JSON.stringify(selector) + ')';
  const click = selector => evaluate(el(selector) + '.click()');
  const tools = '#tools > button[data-le-tool]';
  const cards = await evaluate(`[...document.querySelectorAll('${tools}')].map(button=>({
    tool:button.dataset.leTool,title:button.title,label:button.getAttribute('aria-label'),
    pressed:button.getAttribute('aria-pressed'), icon:!!button.querySelector('svg[aria-hidden="true"]'),
  }))`);
  assert.deepEqual(cards.map(card => card.tool).sort(), ['gradient', 'polygon', 'wand']);
  const localized = mode === 'avatar'
    ? {polygon: /многоугольник/i, wand: /палочка/i, gradient: /градиент/i}
    : {polygon: /polygon/i, wand: /magic wand/i, gradient: /gradient/i};
  for (const card of cards) {
    assert.match(card.title, localized[card.tool], 'localized hover hint');
    assert.match(card.label, localized[card.tool], 'localized accessible name');
    assert.equal(card.pressed, 'false');
    assert.equal(card.icon, true, card.tool + ' has an SVG icon');
  }

  async function toolbarClick(selector) {
    const node = 'document.querySelector(' + JSON.stringify(selector) + ')';
    const point = await evaluate(`(() => {
      const button=${node};
      button.scrollIntoView({block:'center'});
      const box=button.getBoundingClientRect();
      return {x:box.left+box.width/2,y:box.top+box.height/2};
    })()`);
    await call('Input.dispatchMouseEvent', {type:'mouseMoved', ...point});
    assert.equal(await evaluate(node + '.matches(":hover")'), true, 'hover reaches ' + selector);
    await call('Input.dispatchMouseEvent', {type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});
    await call('Input.dispatchMouseEvent', {type:'mouseReleased',button:'left',buttons:0,clickCount:1,...point});
  }
  const pressed = () => evaluate(`Array.from(document.querySelectorAll('${tools}[aria-pressed=true]'), button=>button.dataset.leTool)`);
  const options = '#cont_config > [data-loneti-essentials="options"]';
  async function choose(name) {
    await toolbarClick('#tools > button[data-le-tool="' + name + '"]');
    assert.deepEqual(await pressed(), [name]);
    assert.equal(await evaluate('document.querySelector(' + JSON.stringify(options) + ').hidden'), false);
    assert.match(await evaluate('control("[data-active]").textContent.trim()'), localized[name]);
    assert.equal(await evaluate('control("[data-end]") === null'), true, 'no separate Exit tool control');
    if (name !== 'polygon') {
      assert.equal(await evaluate(el('[data-' + name + '-options]') + '.hidden'), false);
    }
  }
  await choose('wand');
  const eraser = '#tools .one_tool[data-tool="eraser"]';
  await toolbarClick(eraser);
  assert.equal(await evaluate('document.querySelector(' + JSON.stringify(eraser) + ').classList.contains("active_tool")'), true);
  assert.deepEqual(await pressed(), [], 'native tool clears custom active state');
  assert.equal(await evaluate('getComputedStyle(fixtureCanvas).pointerEvents'), 'none', 'native tool gets the canvas back');
  assert.equal(await evaluate('document.querySelector(' + JSON.stringify(options) + ').hidden'), true, 'native options are restored');

  async function pointer(x, y, endX = x, endY = y) {
    await evaluate('fixtureEditor().surface.scrollIntoView({block:"center"})');
    const point = (x, y) => evaluate('fixtureEditor().canvasToClient(' + x + ',' + y + ')');
    const start = await point(x, y);
    const end = await point(endX, endY);
    assert.equal(await evaluate('fixtureCanvas.getRootNode().elementFromPoint(' + start.x + ',' + start.y + ') === fixtureCanvas'),
      true, mode + ' pointer reaches the tool canvas');
    await call('Input.dispatchMouseEvent', {type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...start});
    await call('Input.dispatchMouseEvent', {type: 'mouseMoved', buttons: 1, ...end});
    await call('Input.dispatchMouseEvent', {type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, ...end});
  }
  async function polygon(vertices) {
    await choose('polygon');
    for (const [x, y] of vertices) await pointer(x, y);
    assert.equal(await evaluate(el('[data-back]') + '.disabled'), false, 'polygon offers step back');
    assert.equal(await evaluate(el('[data-finish]') + '.disabled'), false);
    await click('[data-finish]');
  }
  function set(selector, value, event = 'input') {
    return evaluate(`(() => { const input=${el(selector)};
      input.value=${JSON.stringify(value)};
      input.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));
    })()`);
  }

  if (mode === 'smile') {
    await polygon([[-50,-15],[330,-15],[330,330],[-50,330]]);
    assert.equal(await evaluate('count()'), 90_000, 'all-outside polygon covers the canvas');
    await polygon([[-100,-50],[-30,-50],[-30,350],[-100,350]]);
    assert.equal(await evaluate('count()'), 0, 'fully off-canvas polygon is empty');
  }
  await evaluate(`(() => {
      const context=fixtureEditor().canvas.getContext('2d');
      context.fillStyle='#101010'; context.fillRect(0,0,220,200);
      context.fillStyle='#969696'; context.fillRect(60,100,60,60); context.fillRect(155,100,25,25);
      context.fillStyle='#101010'; context.fillRect(70,110,40,40);
      context.fillStyle='#a6a6a6'; context.fillRect(60,160,25,25);
      fixtureEngine().users_canvas.getMyUser().events_draw.setDraw();
  })()`);
  await toolbarClick('#tools .one_tool[data-tool="lasso"]');
  await choose('wand');
  await set('[data-tolerance]', 0, 'change');
  await pointer(64,103);
  const samples = '[mask(64,103),mask(85,125),mask(160,108),mask(63,163)]';
  const toolStatus = () => evaluate('fixtureCanvas.getRootNode().querySelector("[role=status]").textContent');
  assert.deepEqual(await evaluate(samples), [1,0,0,0], 'contiguous selection with a hole: ' + await toolStatus());
  await click('[data-contiguous]');
  assert.deepEqual(await evaluate(samples), [1,0,1,0], 'disconnected island found');
  await choose('wand');
  await set('[data-tolerance]', 16, 'change');
  assert.deepEqual(await evaluate(samples), [1,0,1,1], 'reselecting the wand retains the sample for tolerance adjustment');
  await evaluate('fixtureCanvas.focus({preventScroll:true})');
  assert.equal(await evaluate('fixtureCanvas.getRootNode().activeElement === fixtureCanvas'), true);
  const shortcut = {key:'e',code:'KeyE',windowsVirtualKeyCode:69,nativeVirtualKeyCode:69};
  await call('Input.dispatchKeyEvent', {type:'keyDown',text:'e',...shortcut});
  await call('Input.dispatchKeyEvent', {type:'keyUp',...shortcut});
  assert.equal(await evaluate('document.querySelector(' + JSON.stringify(eraser) + ').classList.contains("active_tool")'), true,
    'native Eraser shortcut works with the overlay canvas focused');
  assert.deepEqual(await pressed(), [], 'native shortcut clears custom active state');
  assert.equal(await evaluate('getComputedStyle(fixtureCanvas).pointerEvents'), 'none', 'native shortcut releases the canvas');

  await polygon([[-15,50],[150,50],[150,125],[-15,125]]);
  assert.equal(await evaluate('count()'), 150 * 75, 'polygon clips the portion outside the canvas');
  const greenX = mode === 'smile' ? 57 : 85;
  const pixelSamples = '[pixel(18,85),pixel(' + greenX + ',85),pixel(148,85),pixel(188,85)]';
  const before = await evaluate(pixelSamples);
  const historyIndex = await evaluate('historyState.current_index');
  await choose('gradient');
  await set('[data-stop-color]', '#ff0000');
  await evaluate(el('[data-rail]') + '.lastElementChild.click()');
  await set('[data-stop-color]', '#0000ff');
  await click('[data-add-stop]');
  await set('[data-stop-color]', '#00ff00');
  if (mode === 'smile') {
    const marker = '[data-rail] > button[aria-pressed="true"]';
    const slider = el('[data-position]');
    await evaluate(el('[data-rail]') + '.style.maxWidth="250px"');
    function position() {
      return evaluate('Number(' + slider + '.value)');
    }
    async function grip() {
      return evaluate(`(() => {
        const marker=${el(marker)};
        marker.scrollIntoView({block:'center'});
        const box=marker.getBoundingClientRect();
        const rail=marker.parentElement.getBoundingClientRect();
        const offset=Math.min(7,box.width/2-1);
        const x=box.left+box.width/2+offset, y=box.top+box.height/2;
        const target=marker.getRootNode().elementFromPoint(x,y);
        if (target!==marker) throw Error('Gradient grip intercepted by '+target?.localName+' at '+x+','+y);
        return {x,y,width:rail.width,left:rail.left,right:rail.right,top:rail.top};
      })()`);
    }
    function stopState() {
      return evaluate(`(() => {
        const active=${el(marker)}, rail=${el('[data-rail]')};
        return {same:active===window.testGreenStop,count:rail.querySelectorAll(':scope > button').length,
          position:Number(${slider}.value),markerPosition:parseFloat(active.style.left),color:${el('[data-stop-color]')}.value};
      })()`);
    }
    async function checkStop(target, why) {
      const view = await stopState();
      assert.ok(Math.abs(view.position - target) <= 1, why + ': position ' + view.position);
      assert.equal(view.markerPosition, view.position, why + ': marker and Position slider agree');
      assert.equal(view.color, '#00ff00', why + ': green stop moved');
      assert.equal(view.same, true, why + ': marker remains mounted');
      assert.equal(view.count, 3, why + ': no duplicate stop');
    }
    await evaluate('window.testGreenStop=' + el(marker));
    const start = await grip();
    assert.equal(await position(), 50);
    const mouse = (type, x, buttons, y = start.y) => call('Input.dispatchMouseEvent', {
      type,x,y,buttons,...(type === 'mouseMoved' ? {} : {button:'left',clickCount:1}),
    });
    await mouse('mouseMoved', start.x, 0);
    await mouse('mousePressed', start.x, 1);
    await mouse('mouseMoved', start.left + 2, 1);
    assert.equal(await position(), 0, 'off-center drag past the first stop clamps to 0%');
    await mouse('mouseMoved', start.right + 32, 1);
    assert.equal(await position(), 100, 'held drag outside the rail clamps to 100%');
    const mouseTarget = start.x + start.width * .20;
    // Reenter over unoccupied rail space. Releasing there must not add a stop.
    await mouse('mouseMoved', mouseTarget, 1, start.top + 3);
    await mouse('mouseReleased', mouseTarget, 0, start.top + 3);
    await checkStop(70, 'mouse drag');

    await call('Emulation.setTouchEmulationEnabled', {enabled:true,maxTouchPoints:1});
    const touch = await grip();
    const target = touch.x + touch.width * (.30 - (await position()) / 100);
    await call('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:touch.x,y:touch.y}]});
    await call('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:target,y:touch.y}]});
    await call('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
    await call('Emulation.setTouchEmulationEnabled', {enabled:false});
    await checkStop(30, 'touch drag');

    const touched = await position();
    const keypresses = [[el(marker),'ArrowRight',39,touched + 1],[slider,'ArrowLeft',37,touched]];
    for (const [control, key, code, value] of keypresses) {
      await evaluate(control + '.focus()');
      const arrow = {key,code:key,windowsVirtualKeyCode:code};
      await call('Input.dispatchKeyEvent', {type:'keyDown',...arrow});
      await call('Input.dispatchKeyEvent', {type:'keyUp',...arrow});
      assert.equal(await position(), value, 'Stop position responds to ' + key);
      await checkStop(value, 'keyboard adjustment');
    }
  }
  await pointer(18,85,148,85);
  const [red, green, blue, outside] = await evaluate(pixelSamples);
  assert.ok(red[0] > 240 && green[1] > 230 && blue[2] > 240, 'three gradient stops are visible');
  if (mode === 'smile') assert.ok((await evaluate('pixel(85,85)'))[1] < 215, 'green peak moved from its original midpoint');
  assert.deepEqual(outside, before[3], 'gradient clips to selection');
  assert.equal(await evaluate('historyState.current_index'), historyIndex + 1, 'one native history edit');
  assert.equal(await evaluate('Boolean(historyState.abort(historyState.getStateAbort()))'), true);
  assert.deepEqual(await evaluate(pixelSamples), before, 'native undo restores pixels');
  console.log('PASS native ' + mode + ' editor toolbar, hints, native handoff, polygon, wand, masked gradient and undo');
  if (mode === 'smile') console.log('PASS gradient stop mouse, touch and keyboard movement, clamping and paint');
}
