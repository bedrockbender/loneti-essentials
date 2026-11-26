// Lossless fallback for native room snapshots too large for Engine.IO.
const roomPngCrcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});

function roomPngChunk(type, payload) {
  const result = new Uint8Array(payload.length + 12);
  const view = new DataView(result.buffer);
  view.setUint32(0, payload.length);
  result.set(new TextEncoder().encode(type), 4);
  result.set(payload, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < result.length - 4; i++) crc = (crc >>> 8) ^ roomPngCrcTable[(crc ^ result[i]) & 255];
  view.setUint32(result.length - 4, crc ^ 0xffffffff);
  return result;
}

function roomPngDataUrl(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return 'data:image/png;base64,' + btoa(binary);
}

function roomPngScanlines(pixels) {
  const { data, width, height } = pixels;
  let channels = 3;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) { channels = 4; break; }
  }
  const stride = width * channels;
  const scanlines = new Uint8Array(height * (stride + 1));
  const sub = new Uint8Array(stride);
  const up = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    let subScore = 0;
    let upScore = 0;
    for (let x = 0; x < width; x++) {
      const source = (y * width + x) * 4;
      for (let channel = 0; channel < channels; channel++) {
        const i = x * channels + channel;
        const pixel = source + channel;
        const horizontal = data[pixel] - (x ? data[pixel - 4] : 0);
        const vertical = data[pixel] - (y ? data[pixel - width * 4] : 0);
        sub[i] = horizontal;
        up[i] = vertical;
        subScore += Math.abs(horizontal);
        upScore += Math.abs(vertical);
      }
    }
    const offset = y * (stride + 1);
    scanlines[offset] = subScore <= upScore ? 1 : 2;
    scanlines.set(subScore <= upScore ? sub : up, offset + 1);
  }
  return { scanlines, channels };
}

async function compactRoomPng(pixels) {
  if (typeof CompressionStream !== 'function') return null;
  const { scanlines, channels } = roomPngScanlines(pixels);
  const compressed = new Blob([scanlines]).stream().pipeThrough(new CompressionStream('deflate'));
  const imageBytes = new Uint8Array(await new Response(compressed).arrayBuffer());
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, pixels.width);
  view.setUint32(4, pixels.height);
  header[8] = 8;
  header[9] = channels === 3 ? 2 : 6;
  const blob = new Blob([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    roomPngChunk('IHDR', header),
    roomPngChunk('IDAT', imageBytes),
    roomPngChunk('IEND', new Uint8Array()),
  ], { type: 'image/png' });
  return { blob, dataUrl: roomPngDataUrl(new Uint8Array(await blob.arrayBuffer())) };
}
