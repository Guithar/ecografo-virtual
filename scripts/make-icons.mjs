// Genera los iconos PNG de la aplicación instalable (public/icons) sin dependencias:
// rasteriza las formas del favicon con supermuestreo y codifica el PNG con zlib.
//   node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [16, 24, 32];
// diseño en una cuadrícula de 64 × 64: haz ecográfico, vaso en corte y cabezal de la sonda
const shapes = [
  { kind: 'poly', pts: [[14, 20], [50, 20], [44, 52], [20, 52]], color: [63, 193, 201], alpha: 0.38 },
  { kind: 'ring', cx: 32, cy: 35, r: 8, w: 3.2, color: [159, 231, 255], alpha: 1 },
  { kind: 'rect', x: 19, y: 9, w: 26, h: 9, r: 2.5, color: [233, 237, 241], alpha: 1 },
];

function insideRoundRect(x, y, rx, ry, w, h, r) {
  const cx = Math.max(rx + r, Math.min(rx + w - r, x));
  const cy = Math.max(ry + r, Math.min(ry + h - r, y));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= rx && x <= rx + w && y >= ry && y <= ry + h;
}

function insidePoly(x, y, pts) {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (c !== 0) {
      if (sign === 0) sign = Math.sign(c);
      else if (Math.sign(c) !== sign) return false;
    }
  }
  return true;
}

function inside(s, x, y) {
  if (s.kind === 'poly') return insidePoly(x, y, s.pts);
  if (s.kind === 'ring') return Math.abs(Math.hypot(x - s.cx, y - s.cy) - s.r) <= s.w / 2;
  return insideRoundRect(x, y, s.x, s.y, s.w, s.h, s.r);
}

/** @param full fondo a sangre (maskable / Apple) en lugar de cuadrado redondeado con esquinas transparentes */
function render(size, { full = false, scale = 1 } = {}) {
  const px = new Uint8Array(size * size * 4);
  const SS = 4;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sj = 0; sj < SS; sj++) {
        for (let si = 0; si < SS; si++) {
          // coordenadas en la cuadrícula de 64, con el contenido escalado alrededor del centro
          const u = ((i + (si + 0.5) / SS) / size) * 64;
          const v = ((j + (sj + 0.5) / SS) / size) * 64;
          let col = [0, 0, 0];
          let al = 0;
          if (full || insideRoundRect(u, v, 0, 0, 64, 64, 14)) {
            col = [...BG];
            al = 1;
          }
          const x = 32 + (u - 32) / scale;
          const y = 32 + (v - 32) / scale;
          for (const s of shapes) {
            if (!al || !inside(s, x, y)) continue;
            col = col.map((c, k) => c * (1 - s.alpha) + s.color[k] * s.alpha);
          }
          r += col[0] * al;
          g += col[1] * al;
          b += col[2] * al;
          a += al;
        }
      }
      const o = (j * size + i) * 4;
      const n = SS * SS;
      px[o] = a ? Math.round(r / a) : 0;
      px[o + 1] = a ? Math.round(g / a) : 0;
      px[o + 2] = a ? Math.round(b / a) : 0;
      px[o + 3] = Math.round((a / n) * 255);
    }
  }
  return png(size, size, px);
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // sin filtro
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
const files = {
  'icon-192.png': render(192),
  'icon-512.png': render(512),
  // zona segura de los iconos adaptables: el 80 % central
  'icon-maskable-512.png': render(512, { full: true, scale: 0.78 }),
  'apple-touch-icon.png': render(180, { full: true, scale: 0.9 }),
};
for (const [name, data] of Object.entries(files)) {
  writeFileSync(new URL(name, out), data);
  console.log(name, data.length, 'bytes');
}
