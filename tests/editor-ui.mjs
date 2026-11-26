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
]);
function bundleFile(folder, prefix) {
  if (!existsSync(folder)) return;
  const name = readdirSync(folder).find(file => file === prefix + '.js' || file.startsWith(prefix + '.js.'));
  return name && join(folder, name);
}
const fixtures = new Map([...editors].map(([mode, [name, bundle]]) => {
  const folder = join(dump, name + '_files');
  return [mode, {
    html: join(dump, name + '.html'),
    main: bundleFile(folder, 'mainer'),
    editor: bundleFile(folder, bundle),
  }];
}));
if (!browser || !globalThis.WebSocket || [...fixtures.values()].some(files =>
  Object.values(files).some(file => !file || !existsSync(file)))) {
  console.log('SKIP editor integration (requires Node 22+, local Chromium, and the saved Smile and avatar editor fixtures)');
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
  const includes = module => '<script src="/' + module + '?new=' + mode + '"></script>';
  return structure.replace(/<head>/i, '<head><style>' +
    '.js--main-drawing-area{position:relative;width:600px;height:550px}' +
    '.js--work-canvas{display:block;width:600px;height:550px}' +
    '</style>' + ['userscript.js', 'mainer.js', 'globals.js', 'editor.js'].map(includes).join(''));
}

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const mode = url.searchParams.get('new');
  const files = fixtures.get(mode);
  if (request.method !== 'GET' || !files) return response.writeHead(404).end();
  const entries = {
    '/settings': () => fixtureHtml(files.html, mode),
    '/userscript.js': () => instrumented,
    '/mainer.js': () => readFileSync(files.main),
    '/globals.js': () => localGlobals,
    '/editor.js': () => readFileSync(files.editor),
  };
  if (!Object.hasOwn(entries, url.pathname)) return response.writeHead(404).end();
  response.setHeader('Content-Security-Policy', csp);
  response.setHeader('Content-Type', url.pathname === '/settings' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8');
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
  for (const mode of editors.keys()) await testEditor(mode);
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
  const url = 'http://127.0.0.1:' + server.address().port + '/settings?new=' + mode;
  await call('Page.navigate', {url});
  const ready = 'location.href === ' + JSON.stringify(url) +
    ' && Boolean(window.fixtureEditor?.() && document.querySelector("[data-loneti-essentials=tools]"))';
  for (let attempt = 0; attempt < 100 && !(await evaluate(ready)); attempt++) await delay(50);
  assert.equal(await evaluate(ready), true, mode + ' editor ready');
  assert.equal(await evaluate(`(() => {
    const editor=fixtureEditor();
    editor.surface.scrollIntoView({block:'center'});
    const tools=editor.surface.querySelector(':scope > [data-loneti-essentials="tools"]').shadowRoot;
    window.control=selector=>tools.querySelector(selector);
    window.pixel=(x,y)=>Array.from(editor.readLayer().data.slice(4*(y*editor.width+x),4*(y*editor.width+x)+4));
    window.mask=(x,y)=>editor.readSelection()?.[y*editor.width+x];
    window.count=()=>editor.readSelection()?.reduce((sum,bit)=>sum+bit,0)||0;
    window.historyState=fixtureEngine().users_canvas.getMyUser().states_history;
    return editor.mode;
  })()`), mode);
  const el = selector => 'control(' + JSON.stringify(selector) + ')';
  const click = selector => evaluate(el(selector) + '.click()');
  async function menu() {
    if (await evaluate('control(".panel").hidden')) await click('[data-menu]');
  }
  async function choose(name) {
    await menu();
    await click('[data-tool="' + name + '"]');
  }
  async function pointer(x, y, endX = x, endY = y) {
    const point = (x, y) => evaluate('fixtureEditor().canvasToClient(' + x + ',' + y + ')');
    const start = await point(x, y);
    const end = await point(endX, endY);
    await call('Input.dispatchMouseEvent', {type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...start});
    await call('Input.dispatchMouseEvent', {type: 'mouseMoved', buttons: 1, ...end});
    await call('Input.dispatchMouseEvent', {type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, ...end});
  }
  async function polygon(vertices) {
    await choose('polygon');
    for (const [x, y] of vertices) await pointer(x, y);
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
    await evaluate(`(() => {
      const context=fixtureEditor().canvas.getContext('2d');
      context.fillStyle='#101010'; context.fillRect(0,0,300,300);
      context.fillStyle='#969696'; context.fillRect(60,100,60,60); context.fillRect(155,100,25,25);
      context.fillStyle='#101010'; context.fillRect(70,110,40,40);
      context.fillStyle='#a6a6a6'; context.fillRect(60,160,25,25);
      fixtureEngine().users_canvas.getMyUser().events_draw.setDraw();
    })()`);
    await choose('wand');
    await set('[data-tolerance]', 0, 'change');
    await click('[data-menu]');
    await pointer(64,103);
    const samples = '[mask(64,103),mask(85,125),mask(160,108),mask(63,163)]';
    assert.deepEqual(await evaluate(samples), [1,0,0,0], 'contiguous selection with a hole');
    await menu();
    await click('[data-contiguous]');
    assert.deepEqual(await evaluate(samples), [1,0,1,0], 'disconnected island found');
    await set('[data-tolerance]', 16, 'change');
    assert.deepEqual(await evaluate(samples), [1,0,1,1], 'tolerance recomputes existing selection');
  }

  await polygon([[15,50],[150,50],[150,125],[15,125]]);
  const pixelSamples = '[pixel(18,85),pixel(85,85),pixel(148,85),pixel(188,85)]';
  const before = await evaluate(pixelSamples);
  const historyIndex = await evaluate('historyState.current_index');
  await choose('gradient');
  await set('[data-stop-color]', '#ff0000');
  await evaluate(el('[data-rail]') + '.lastElementChild.click()');
  await set('[data-stop-color]', '#0000ff');
  await click('[data-add-stop]');
  await set('[data-stop-color]', '#00ff00');
  await click('[data-menu]');
  await pointer(18,85,148,85);
  const [red, green, blue, outside] = await evaluate(pixelSamples);
  assert.ok(red[0] > 240 && green[1] > 230 && blue[2] > 240, 'three gradient stops are visible');
  assert.deepEqual(outside, before[3], 'gradient clips to selection');
  assert.equal(await evaluate('historyState.current_index'), historyIndex + 1, 'one native history edit');
  assert.equal(await evaluate('Boolean(historyState.abort(historyState.getStateAbort()))'), true);
  assert.deepEqual(await evaluate(pixelSamples), before, 'native undo restores pixels');
  console.log('PASS native ' + mode + ' editor' + (mode === 'smile' ? ' polygon, wand,' : '') + ' masked gradient and undo');
}
