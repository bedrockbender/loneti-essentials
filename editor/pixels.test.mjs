import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const algorithms = vm.createContext({});
vm.runInContext(await readFile(new URL('./pixels.js',import.meta.url),'utf8'), algorithms);
const {polygonMask, wandMask, combineMasks} = algorithms;
const polygon = (...pairs) => polygonMask(4, 4, pairs.map(([x,y]) => ({x,y})));
const bits = mask => Array.from(mask).join('');

test('outside vertices can enclose the whole canvas or miss it completely', () => {
  assert.equal(bits(polygon([-10,-4], [12,-3], [9,11], [-8,13])), '1111111111111111');
  assert.equal(bits(polygon([-3,-3], [-1,10], [-2,6])), '0000000000000000');
});

test('intersect edges with the canvas instead of clamping their vertices', () => {
  // The diagonal goes through (0,-2) and (-2,0), clear of all sixteen pixels.
  assert.equal(bits(polygon([-6,4], [4,-6], [4,4])), '1111111111111111');
  assert.equal(bits(polygon([-5,1], [6,1], [6,3], [-5,3])), '0000111111110000');
});

test('wand tolerance and connectivity preserve holes and disconnected islands', () => {
  const colors = [10,10,200,12, 10,200,200,10, 10,11,200,10];
  const data = Uint8ClampedArray.from(colors.flatMap(c => [c,0,0,255]));
  const sample = (t,c) => bits(wandMask({width:4,height:3,data},{x:.2,y:.1},t,c));
  assert.equal(sample(0,true), '110010001000');
  assert.equal(sample(2,true), '110010001100');
  assert.equal(sample(2,false),'110110011101');
});

test('transparent pixels compare by visible color and alpha', () => {
  const image = {width:3,height:1,data:new Uint8ClampedArray([255,0,0,0, 0,255,0,0, 255,0,0,255])};
  assert.equal(bits(wandMask(image,{x:0,y:0},0,true)), '110');
});

test('combine operations work on a bounded raster mask', () => {
  for (const [mode, expected] of [['add','1110'],['subtract','1000'],['intersect','0100']]) {
    assert.equal(bits(combineMasks(Uint8Array.of(1,1,0,0), Uint8Array.of(0,1,1,0), mode)), expected);
  }
});
