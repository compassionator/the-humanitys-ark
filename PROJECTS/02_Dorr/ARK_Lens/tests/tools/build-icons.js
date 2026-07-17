const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..", "..");
const iconDirectory = path.join(root, "icons");
const sizes = [16, 32, 48, 128];
const colors = {
  inactive: [71, 84, 103],
  active: [21, 128, 61]
};

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return output;
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let current = 0, previous = points.length - 1; current < points.length; previous = current++) {
    const [currentX, currentY] = points[current];
    const [previousX, previousY] = points[previous];
    const crosses = (currentY > y) !== (previousY > y) &&
      x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

function insideRoundedSquare(x, y) {
  const minimum = 4;
  const maximum = 124;
  const radius = 23;
  if (x < minimum || x > maximum || y < minimum || y > maximum) return false;
  const nearestX = Math.max(minimum + radius, Math.min(x, maximum - radius));
  const nearestY = Math.max(minimum + radius, Math.min(y, maximum - radius));
  const deltaX = x - nearestX;
  const deltaY = y - nearestY;
  return deltaX * deltaX + deltaY * deltaY <= radius * radius;
}

function insideLetterA(x, y) {
  const leftLeg = [[25, 104], [52, 24], [67, 24], [43, 104]];
  const rightLeg = [[61, 24], [76, 24], [103, 104], [84, 104]];
  const crossbar = [[42, 68], [85, 68], [91, 83], [37, 83]];
  return pointInPolygon(x, y, leftLeg) ||
    pointInPolygon(x, y, rightLeg) ||
    pointInPolygon(x, y, crossbar);
}

function renderPixels(size, backgroundColor) {
  const supersampling = 4;
  const sampleCount = supersampling * supersampling;
  const pixels = Buffer.alloc(size * size * 4);

  for (let pixelY = 0; pixelY < size; pixelY += 1) {
    for (let pixelX = 0; pixelX < size; pixelX += 1) {
      let covered = 0;
      let red = 0;
      let green = 0;
      let blue = 0;

      for (let sampleY = 0; sampleY < supersampling; sampleY += 1) {
        for (let sampleX = 0; sampleX < supersampling; sampleX += 1) {
          const x = ((pixelX + (sampleX + 0.5) / supersampling) / size) * 128;
          const y = ((pixelY + (sampleY + 0.5) / supersampling) / size) * 128;
          if (!insideRoundedSquare(x, y)) continue;

          const color = insideLetterA(x, y) ? [255, 255, 255] : backgroundColor;
          covered += 1;
          red += color[0];
          green += color[1];
          blue += color[2];
        }
      }

      const offset = (pixelY * size + pixelX) * 4;
      if (covered > 0) {
        pixels[offset] = Math.round(red / covered);
        pixels[offset + 1] = Math.round(green / covered);
        pixels[offset + 2] = Math.round(blue / covered);
        pixels[offset + 3] = Math.round((covered / sampleCount) * 255);
      }
    }
  }

  return pixels;
}

function encodePng(size, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const scanlines = Buffer.alloc(size * (1 + size * 4));
  for (let row = 0; row < size; row += 1) {
    const targetOffset = row * (1 + size * 4);
    scanlines[targetOffset] = 0;
    pixels.copy(scanlines, targetOffset + 1, row * size * 4, (row + 1) * size * 4);
  }

  return Buffer.concat([
    signature,
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

fs.mkdirSync(iconDirectory, { recursive: true });
Object.entries(colors).forEach(([state, color]) => {
  sizes.forEach((size) => {
    const suffix = state === "active" ? "-active" : "";
    const filename = `ark-lens${suffix}-${size}.png`;
    const pixels = renderPixels(size, color);
    fs.writeFileSync(path.join(iconDirectory, filename), encodePng(size, pixels));
  });
});

console.log("Built inactive gray and active green ARK Lens icons");
