// Vertex coordinates belong to the drawing, including points outside its bounds.
// Intersect scanlines through pixel centres with every edge before clipping spans.
function polygonMask(width, height, vertices) {
  const mask = new Uint8Array(width * height);
  if (vertices.length < 3) return mask;
  const edges = [];
  for (let i = 0; i < vertices.length; i++) {
    let a = vertices[i], b = vertices[(i + 1) % vertices.length];
    if (a.y === b.y) continue;
    if (a.y > b.y) [a, b] = [b, a];
    edges.push({ x: a.x, y: a.y, end: b.y, slope: (b.x - a.x) / (b.y - a.y) });
  }
  for (let y = 0; y < height; y++) {
    const sampleY = y + 0.5;
    const crossings = [];
    for (const edge of edges) {
      if (sampleY >= edge.y && sampleY < edge.end) crossings.push(edge.x + (sampleY - edge.y) * edge.slope);
    }
    crossings.sort((a, b) => a - b);
    for (let i = 1; i < crossings.length; i += 2) {
      const left = Math.max(0, Math.ceil(crossings[i - 1] - 0.5));
      const right = Math.min(width, Math.ceil(crossings[i] - 0.5));
      if (right > left) mask.fill(1, y * width + left, y * width + right);
    }
  }
  return mask;
}

function wandMask(image, point, tolerance, contiguous) {
  const { width, height, data } = image;
  const x = Math.floor(point.x), y = Math.floor(point.y);
  const mask = new Uint8Array(width * height);
  if (x < 0 || y < 0 || x >= width || y >= height) return mask;
  const seed = y * width + x;
  const alpha = data[seed * 4 + 3];
  const reference = [0, 1, 2].map(k => data[seed * 4 + k] * alpha);
  function matches(i) {
    const offset = i * 4, a = data[offset + 3];
    if (Math.abs(a - alpha) > tolerance) return false;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(data[offset + k] * a - reference[k]) > 255 * tolerance) return false;
    }
    return true;
  }
  if (!contiguous) {
    for (let i = 0; i < mask.length; i++) if (matches(i)) mask[i] = 1;
    return mask;
  }
  const queue = new Int32Array(mask.length);
  let count = 1;
  queue[0] = seed;
  mask[seed] = 1;
  function visit(i) {
    if (!mask[i] && matches(i)) {
      mask[i] = 1;
      queue[count++] = i;
    }
  }
  for (let head = 0; head < count; head++) {
    const i = queue[head], column = i % width;
    if (column > 0) visit(i - 1);
    if (column + 1 < width) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i + width < mask.length) visit(i + width);
  }
  return mask;
}

function combineMasks(previous, next, operation) {
  if (!previous || operation === 'replace') return next;
  for (let i = 0; i < next.length; i++) {
    if (operation === 'add') next[i] |= previous[i];
    else if (operation === 'subtract') next[i] = previous[i] & (1 - next[i]);
    else next[i] &= previous[i];
  }
  return next;
}

function drawingCanvas(width, height) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

function maskTexture(mask, width, height, outline) {
  const canvas = drawingCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  const rgba = image.data;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = i % width, y = Math.floor(i / width);
    if (outline && x && x + 1 < width && y && y + 1 < height &&
        mask[i-1] && mask[i+1] && mask[i-width] && mask[i+width]) continue;
    const light = ((x + y) & 4) !== 0;
    rgba[i*4] = light ? 255 : 15;
    rgba[i*4+1] = light ? 255 : 78;
    rgba[i*4+2] = light ? 255 : 73;
    rgba[i*4+3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function gradientPaint(ctx, type, a, b, stops) {
  const gradient = type === 'radial'
    ? ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, Math.max(0.001, Math.hypot(b.x-a.x, b.y-a.y)))
    : ctx.createLinearGradient(a.x, a.y, b.x, b.y);
  for (const stop of stops) gradient.addColorStop(stop.at / 100, stop.color);
  return gradient;
}

function maskedPaint(source, mask, paint, erase) {
  const canvas = drawingCanvas(source.width, source.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!erase) {
    ctx.fillStyle = paint(ctx);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // Retain every unselected byte, including hidden colour in transparent pixels.
  const original = new Uint32Array(source.data.buffer, source.data.byteOffset, source.data.length / 4);
  const result = new Uint32Array(pixels.data.buffer);
  if (mask) for (let i = 0; i < mask.length; i++) if (!mask[i]) result[i] = original[i];
  return pixels;
}
