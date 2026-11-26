import { readFile, writeFile } from 'node:fs/promises';

// Keep the install URL self-contained. Only replace the generated drawing-tools region.
const dest = new URL('../loneti-smile-collector.user.js', import.meta.url);
const modules = ['png.js', 'native.js', 'pixels.js', 'template.js', 'toolbar.js', 'gradients.js', 'curves.js', 'curve-layer.js', 'curve-tools.js', 'tools.js', 'mount.js'];
const files = await Promise.all(modules.map(name => readFile(new URL(name,import.meta.url), 'utf8')));
const begin = '// BEGIN bundled drawing tools', end = '// END bundled drawing tools';
const current = await readFile(dest, 'utf8');
if (current.split(begin).length !== 2 || current.split(end).length !== 2) throw Error('Missing or duplicated bundle markers');
const generated = begin+"\n(() => {\n'use strict';\n" + files.map(s => s.trim().replace(/\r\n/g,'\n')).join('\n\n') + '\n})();\n'+end;
let output = current.slice(0,current.indexOf(begin)) + generated + current.slice(current.indexOf(end)+end.length);
if (process.argv.includes('--check')) {
  if (output.replace(/\r\n/g,'\n') !== current.replace(/\r\n/g,'\n')) throw Error('Run node editor/bundle.mjs to update the userscript');
} else await writeFile(dest, output);
