import { describe, expect, it } from 'vitest';
import { defaultFocusPrefs, loadFocusPrefs } from '../../src/ui/focus';
import { Box, fitImage, FLOAT_GAP, floatRect, nearestCorner } from '../../src/ui/layoutMath';

const zone: Box = { x: 100, y: 50, w: 1000, h: 600 };
const inside = (r: Box, z: Box) => r.x >= z.x && r.y >= z.y && r.x + r.w <= z.x + z.w && r.y + r.h <= z.y + z.h;
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe('ventana flotante', () => {
  it('se coloca en cada esquina, dentro de la zona y separada del borde', () => {
    const br = floatRect(zone, 'br', { w: 0.32, aspect: 0.62 });
    expect(br.x + br.w).toBeCloseTo(zone.x + zone.w - FLOAT_GAP);
    expect(br.y + br.h).toBeCloseTo(zone.y + zone.h - FLOAT_GAP);
    const tl = floatRect(zone, 'tl', { w: 0.32, aspect: 0.62 });
    expect(tl.x).toBe(zone.x + FLOAT_GAP);
    expect(tl.y).toBe(zone.y + FLOAT_GAP);
    for (const c of ['tl', 'tr', 'bl', 'br'] as const) expect(inside(floatRect(zone, c, { w: 0.42, aspect: 0.62 }), zone)).toBe(true);
  });

  it('no supera el 62 % del alto aunque la proporción lo pida', () => {
    const r = floatRect({ x: 0, y: 0, w: 1000, h: 300 }, 'br', { w: 0.42, aspect: 0.85 });
    expect(r.h).toBeLessThanOrEqual(300 * 0.62 + 1e-9);
    expect(r.w / r.h).toBeCloseTo(1 / 0.85);
  });

  it('al arrastrarla no sale de la zona y encaja en la esquina más cercana', () => {
    const r = floatRect(zone, 'br', { w: 0.3, aspect: 0.62 }, { x: -500, y: 2000 });
    expect(inside(r, zone)).toBe(true);
    expect(nearestCorner(zone, r)).toBe('bl');
    expect(nearestCorner(zone, floatRect(zone, 'tr', { w: 0.3, aspect: 0.62 }))).toBe('tr');
  });
});

describe('encaje de la imagen', () => {
  const m = { l: 62, r: 150, t: 12, b: 10 };
  const W = 38;
  const D = 25;
  const footprint = (f: { s: number; x: number; y: number }) => ({ x: f.x - 56, y: f.y, w: W * f.s + 56 + 34, h: D * f.s });

  it('sin ventana flotante queda centrada', () => {
    const f = fitImage(1400, 760, W, D, m, null, 56, 34);
    expect(f.y).toBe(m.t);
    expect(f.s).toBeCloseTo((760 - m.t - m.b) / D);
    expect(f.x - m.l).toBeCloseTo(1400 - m.r - (f.x + W * f.s), 6);
  });

  it('se aparta hacia el lado libre de la ventana sin perder tamaño si sobra anchura', () => {
    const base = fitImage(1400, 760, W, D, m, null, 56, 34);
    const avoid = { x: 960, y: 420, w: 440, h: 340 };
    const f = fitImage(1400, 760, W, D, m, avoid, 56, 34);
    expect(overlap(footprint(f), avoid)).toBe(false);
    expect(f.s).toBeGreaterThanOrEqual(0.75 * base.s);
  });

  it('si apartarla la encoge demasiado, se queda en su sitio', () => {
    const base = fitImage(400, 500, W, D, { l: 30, r: 30, t: 24, b: 6 }, null, 22, 34);
    const avoid = { x: 10, y: 10, w: 380, h: 480 };
    const f = fitImage(400, 500, W, D, { l: 30, r: 30, t: 24, b: 6 }, avoid, 22, 34);
    expect(f).toEqual(base);
  });
});

describe('preferencias del modo enfoque', () => {
  it('por defecto: enfoque en punción y la sala con el 3D en grande', () => {
    const p = defaultFocusPrefs();
    expect(p.byMode.cannulate).toBe(true);
    expect(p.byMode.explore).toBe(false);
    expect(p.mainByMode.room).toBe('3d');
    expect(loadFocusPrefs(null)).toEqual(p);
  });

  it('recupera lo guardado y descarta valores corruptos', () => {
    const p = loadFocusPrefs(JSON.stringify({ byMode: { explore: true, room: 'x' }, mainByMode: { explore: '3d', learn: 'nada' }, corner: 'tl', size: 'xl', hidden: true }));
    expect(p.byMode.explore).toBe(true);
    expect(p.byMode.room).toBe(false);
    expect(p.mainByMode.explore).toBe('3d');
    expect(p.mainByMode.learn).toBe('us');
    expect(p.corner).toBe('tl');
    expect(p.size).toBe('m');
    expect(p.hidden).toBe(true);
    expect(loadFocusPrefs('{roto')).toEqual(defaultFocusPrefs());
  });
});
