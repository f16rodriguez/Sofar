// The app icon, drawn rather than dropped in (SPEC §6 palette).
//
// The mark is the wordmark's bookmark ribbon on the cream ground: oxblood is
// reserved for the ribbon, the chapter numeral and the answer button, and a
// home screen icon is the ribbon's job. No text — at 48 points a word is
// mud, and the ribbon is the thing people will recognise.
//
// Written by hand because the alternative is a rasteriser dependency for six
// flat shapes. Deterministic: same bytes every run.
//
//   npm run make-icons

import { deflateSync } from "node:zlib";
import fs from "node:fs";
import path from "node:path";

const CREAM: RGB = [0xf4, 0xee, 0xe2];
const OXBLOOD: RGB = [0x7a, 0x2e, 0x2a];

type RGB = [number, number, number];

/** CRC-32, as PNG defines it. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size: number, pixels: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  // Each scanline is prefixed with its filter type; 0 is "none".
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 3;
      const dst = row + 1 + x * 3;
      raw[dst] = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * The ribbon: a band hanging from the top edge, notched into a V at the
 * bottom the way a bookmark is cut. `inset` leaves the safe margin a
 * maskable icon needs, since Android crops to whatever shape it likes.
 */
function draw(size: number, inset: number): Uint8Array {
  const px = new Uint8Array(size * size * 3);
  const set = (x: number, y: number, [r, g, b]: RGB) => {
    const i = (y * size + x) * 3;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) set(x, y, CREAM);

  const safe = size * inset;
  const inner = size - safe * 2;
  const width = Math.round(inner * 0.34);
  const left = Math.round(safe + (inner - width) / 2);
  const top = Math.round(safe);
  const bottom = Math.round(safe + inner * 0.78);
  const notch = Math.round(width * 0.42);

  for (let y = top; y < bottom; y++) {
    for (let x = left; x < left + width; x++) {
      // The V is cut upward from the bottom edge, deepest in the middle.
      const fromBottom = bottom - y;
      const fromCentre = Math.abs(x - (left + width / 2));
      const cut = notch * (1 - (fromCentre / (width / 2)));
      if (fromBottom < cut) continue;
      set(x, y, OXBLOOD);
    }
  }
  return px;
}

const OUT = path.join(process.cwd(), "public", "icons");
fs.mkdirSync(OUT, { recursive: true });

// inset 0 for the plain icons; a maskable icon keeps its mark inside the
// middle 80% so a circular crop does not behead it.
const ICONS: [string, number, number][] = [
  ["icon-192.png", 192, 0.16],
  ["icon-512.png", 512, 0.16],
  ["icon-maskable-512.png", 512, 0.26],
  ["apple-touch-icon.png", 180, 0.16],
];

for (const [name, size, inset] of ICONS) {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, png(size, draw(size, inset)));
  console.log(`${name} — ${size}×${size}, ${fs.statSync(file).size} bytes`);
}
