/**
 * Monitor del ecógrafo: imagen, escala de profundidad, marcador de orientación, caja de color,
 * volumen de muestra Doppler, calibradores, etiquetas anatómicas y espectrograma.
 */
import type { WebGLRenderer } from 'three';
import type { AnatomyModel } from '../anatomy/model';
import { tissueName } from '../anatomy/tissues';
import type { UltrasoundSim } from '../sim/UltrasoundSim';
import { SPEC_BINS, SPEC_COLS, SpectralDoppler } from '../sim/spectral';
import { elementRect, ImageView, Rect } from './imageView';

export type MonitorTool = 'none' | 'caliper' | 'gate' | 'box';

export interface Caliper {
  a: { u: number; w: number };
  b: { u: number; w: number } | null;
  label: string;
}

export interface MonitorFlags {
  labels: boolean;
  aids: boolean;
  /** trayectoria prevista de la aguja en coordenadas de imagen (u, w, e) */
  guide: { u: number; w: number; e: number }[] | null;
  tipMarker: { u: number; w: number; visible: boolean; inPlane: boolean } | null;
  caseName: string;
  hint: string;
}

const svgNS = 'http://www.w3.org/2000/svg';

export class Monitor {
  readonly view: HTMLElement;
  readonly svg: SVGSVGElement;
  readonly params: HTMLElement;
  readonly specCanvas: HTMLCanvasElement;
  readonly specWrap: HTMLElement;
  readonly specMeas: HTMLElement;
  readonly readout: HTMLElement;
  private iv = new ImageView();
  img: Rect = { x: 0, y: 0, w: 1, h: 1 };
  pxPerMm = 1;
  tool: MonitorTool = 'none';
  calipers: Caliper[] = [];
  private drag: { kind: 'box' | 'gate' | 'caliper'; du: number; dw: number } | null = null;
  hover: { u: number; w: number } | null = null;
  onChange: (() => void) | null = null;
  onMeasure: ((c: Caliper) => void) | null = null;
  flags: MonitorFlags = { labels: false, aids: false, guide: null, tipMarker: null, caseName: '', hint: '' };
  private specImg: ImageData | null = null;
  private lastSvg = 0;

  constructor(
    root: HTMLElement,
    private sim: UltrasoundSim,
    private getModel: () => AnatomyModel,
    private spectral: SpectralDoppler,
  ) {
    this.view = root.querySelector('#usView') as HTMLElement;
    this.svg = root.querySelector('#usSvg') as SVGSVGElement;
    this.params = root.querySelector('#usParams') as HTMLElement;
    this.specCanvas = root.querySelector('#specCanvas') as HTMLCanvasElement;
    this.specWrap = root.querySelector('#specView') as HTMLElement;
    this.specMeas = root.querySelector('#specMeas') as HTMLElement;
    this.readout = root.querySelector('#usReadout') as HTMLElement;
    this.bindPointer();
  }

  /** Calcula el rectángulo de la imagen dentro de la vista respetando la proporción física. */
  layout() {
    const vw = this.view.clientWidth;
    const vh = this.view.clientHeight;
    const W = this.sim.pose.width;
    const D = this.sim.settings.depth;
    const ml = 62;
    const mr = 150;
    const mt = 12;
    const mb = 10;
    const s = Math.max(0.5, Math.min((vw - ml - mr) / W, (vh - mt - mb) / D));
    this.pxPerMm = s;
    const w = W * s;
    const h = D * s;
    const x = ml + Math.max(0, (vw - ml - mr - w) / 2);
    this.img = { x, y: mt, w, h };
  }

  /** mm de imagen → px de la vista */
  toPx(u: number, w: number): [number, number] {
    const W = this.sim.pose.width;
    let fx = (u + W / 2) / W;
    if (this.sim.settings.flipLR) fx = 1 - fx;
    return [this.img.x + fx * this.img.w, this.img.y + (w / this.sim.settings.depth) * this.img.h];
  }

  toMm(px: number, py: number): { u: number; w: number } {
    const W = this.sim.pose.width;
    let fx = (px - this.img.x) / this.img.w;
    if (this.sim.settings.flipLR) fx = 1 - fx;
    return { u: fx * W - W / 2, w: ((py - this.img.y) / this.img.h) * this.sim.settings.depth };
  }

  render(r: WebGLRenderer, canvas: HTMLCanvasElement) {
    const rect = elementRect(this.view, canvas);
    if (!rect) return;
    this.layout();
    this.iv.render(r, rect, this.img, this.sim.displayTexture, this.sim.settings.flipLR);
  }

  /** Actualiza la superposición SVG y los textos (limitado a ~25 Hz). */
  updateOverlay(now: number, force = false) {
    if (!force && now - this.lastSvg < 0.04) return;
    this.lastSvg = now;
    const s = this.sim.settings;
    const D = s.depth;
    const W = this.sim.pose.width;
    const vw = this.view.clientWidth;
    const vh = this.view.clientHeight;
    this.svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    const parts: string[] = [];
    const { x, y, w, h } = this.img;
    // escala de profundidad
    const sx = x + w + 10;
    parts.push(`<line x1="${sx}" y1="${y}" x2="${sx}" y2="${y + h}" class="scale"/>`);
    for (let mm = 0; mm <= D + 0.01; mm += 1) {
      const py = y + (mm / D) * h;
      const major = mm % 10 === 0;
      const mid = mm % 5 === 0;
      if (!mid && D > 40) continue;
      parts.push(`<line x1="${sx}" y1="${py}" x2="${sx + (major ? 9 : mid ? 6 : 3)}" y2="${py}" class="scale"/>`);
      if (major) parts.push(`<text x="${sx + 12}" y="${py + 4}" class="scaletxt">${mm / 10}</text>`);
    }
    // foco(s)
    const foci = [s.focus];
    if (s.focusZones === 2) foci.push(Math.min(D - 2, s.focus + 10));
    for (const f of foci) {
      const py = y + (f / D) * h;
      parts.push(`<path d="M${sx - 2} ${py} l-7 -5 l0 10 z" class="focus"/>`);
    }
    // marcador de orientación de la pantalla
    const mx = s.flipLR ? x + w - 6 : x + 6;
    parts.push(`<g class="marker" transform="translate(${mx},${y - 2})"><circle r="5.5"/><text y="-9" text-anchor="middle">${s.flipLR ? '' : ''}</text></g>`);
    // caja de color
    if (s.mode !== 'B') {
      const b = s.colorBox;
      const tn = Math.tan((s.steer * Math.PI) / 180);
      const p1 = this.toPx(b.u0, b.w0);
      const p2 = this.toPx(b.u1, b.w0);
      const p3 = this.toPx(b.u1 + (b.w1 - b.w0) * tn, b.w1);
      const p4 = this.toPx(b.u0 + (b.w1 - b.w0) * tn, b.w1);
      parts.push(`<path d="M${p1[0]} ${p1[1]} L${p2[0]} ${p2[1]} L${p3[0]} ${p3[1]} L${p4[0]} ${p4[1]} Z" class="cbox"/>`);
      // barra de color
      const bx = x - 52;
      const by = y + 22;
      parts.push(`<defs><linearGradient id="cbar" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${s.invert ? '#66ffff' : '#fff266'}"/><stop offset="0.25" stop-color="${s.invert ? '#1a5aff' : '#ff1a0d'}"/>
        <stop offset="0.49" stop-color="${s.invert ? '#00084a' : '#4a0000'}"/><stop offset="0.51" stop-color="${s.invert ? '#4a0000' : '#00084a'}"/>
        <stop offset="0.75" stop-color="${s.invert ? '#ff1a0d' : '#1a5aff'}"/><stop offset="1" stop-color="${s.invert ? '#fff266' : '#66ffff'}"/></linearGradient></defs>`);
      if (s.mode === 'color') {
        parts.push(`<rect x="${bx}" y="${by}" width="10" height="90" fill="url(#cbar)" stroke="#555"/>`);
        parts.push(`<text x="${bx + 14}" y="${by + 9}" class="small">+${s.scale.toFixed(0)}</text><text x="${bx + 14}" y="${by + 94}" class="small">−${s.scale.toFixed(0)}</text><text x="${bx - 2}" y="${by + 108}" class="small">cm/s</text>`);
      } else {
        parts.push(`<rect x="${bx}" y="${by}" width="10" height="90" fill="url(#pbar)" stroke="#555"/><defs><linearGradient id="pbar" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#3a0400"/><stop offset="1" stop-color="#ffd95a"/></linearGradient></defs>`);
      }
    }
    // volumen de muestra PW
    if (s.pw) {
      const g = s.pwGate;
      const sa = (s.steer * Math.PI) / 180;
      const du = Math.sin(sa);
      const dw = Math.cos(sa);
      const top = this.toPx(g.u - g.w * du / Math.max(dw, 0.2) * 0, 0);
      const a0 = this.toPx(g.u - (g.w / dw) * du * 1, 0);
      void top;
      const c = this.toPx(g.u, g.w);
      parts.push(`<line x1="${a0[0]}" y1="${a0[1]}" x2="${c[0]}" y2="${c[1]}" class="pwline"/>`);
      const half = g.size / 2;
      const g1 = this.toPx(g.u - half * du, g.w - half * dw);
      const g2 = this.toPx(g.u + half * du, g.w + half * dw);
      const nx = 6 * (s.flipLR ? -1 : 1);
      const perp = (p: [number, number]) => `M${p[0] - nx * dw} ${p[1] + 6 * du} L${p[0] + nx * dw} ${p[1] - 6 * du}`;
      parts.push(`<path d="${perp(g1)} ${perp(g2)}" class="gate"/>`);
      // cursor de corrección de ángulo (ángulo entre haz y flujo)
      const ac = (this.spectral.angleCorr * Math.PI) / 180;
      const beamAng = Math.atan2(du, dw);
      const fa = beamAng + ac;
      const L = 7;
      const e1 = this.toPx(g.u - Math.sin(fa) * L, g.w - Math.cos(fa) * L);
      const e2 = this.toPx(g.u + Math.sin(fa) * L, g.w + Math.cos(fa) * L);
      parts.push(`<line x1="${e1[0]}" y1="${e1[1]}" x2="${e2[0]}" y2="${e2[1]}" class="angle"/>`);
    }
    // etiquetas anatómicas
    if (this.flags.labels) {
      const pose = this.sim.pose;
      const cross = this.getModel().planeCrossings(pose.F, pose.L, pose.B, pose.E, W, D);
      const used: [number, number][] = [];
      for (const c of cross) {
        const name = c.st.def.short ?? c.st.def.name;
        if (!name) continue;
        const im = this.sim.tissueToImage(this.sim.imageToTissue(c.u, c.w), undefined);
        let [px, py] = this.toPx(c.u, Math.max(0.5, Math.min(D - 0.5, im.w)));
        // evitar solapes
        for (const [ux, uy] of used) if (Math.abs(ux - px) < 60 && Math.abs(uy - py) < 12) py += 13;
        used.push([px, py]);
        const cls = c.st.def.kind;
        parts.push(`<g class="lbl ${cls}"><circle cx="${px}" cy="${py}" r="2.2"/><text x="${px + 6}" y="${py - 5}">${esc(name)}</text></g>`);
        px += 0;
      }
    }
    // ayuda: trayectoria prevista de la aguja (segmentos en el grosor de corte) y cruce con el plano
    const gd = this.flags.guide;
    if (this.flags.aids && gd && gd.length > 1) {
      let path = '';
      let pen = false;
      for (let i = 0; i < gd.length; i++) {
        const g = gd[i];
        const inPlane = Math.abs(g.e) < 1.2 && g.w > 0 && g.w < D && Math.abs(g.u) < W / 2;
        if (inPlane) {
          const [px, py] = this.toPx(g.u, g.w);
          path += `${pen ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)} `;
          pen = true;
        } else pen = false;
        if (i > 0) {
          const a = gd[i - 1];
          if ((a.e < 0) !== (g.e < 0)) {
            const f = a.e / (a.e - g.e);
            const cu = a.u + (g.u - a.u) * f;
            const cw = a.w + (g.w - a.w) * f;
            if (cw > 0 && cw < D && Math.abs(cu) < W / 2) {
              const [px, py] = this.toPx(cu, cw);
              parts.push(`<g><circle cx="${px}" cy="${py}" r="6" class="guidept"/><path d="M${px - 10} ${py} h6 M${px + 4} ${py} h6 M${px} ${py - 10} v6 M${px} ${py + 4} v6" class="guidept"/><text x="${px + 12}" y="${py - 8}" class="guidetxt">cruce de la aguja con el plano</text></g>`);
            }
          }
        }
      }
      if (path) parts.push(`<path d="${path}" class="guide"/>`);
    }
    // ayuda: posición real de la punta
    const tm = this.flags.tipMarker;
    if (this.flags.aids && tm) {
      const [px, py] = this.toPx(tm.u, tm.w);
      if (px > x - 20 && px < x + w + 20 && py > y - 20 && py < y + h + 20) {
        parts.push(`<g class="tipaid ${tm.visible ? 'vis' : 'hid'}"><circle cx="${px}" cy="${py}" r="7"/><text x="${px + 10}" y="${py + 14}">${tm.visible ? 'punta' : tm.inPlane ? 'punta fuera del haz' : 'punta (fuera del corte)'}</text></g>`);
      }
    }
    // calibradores
    let ci = 0;
    for (const c of this.calipers) {
      ci++;
      const a = this.toPx(c.a.u, c.a.w);
      parts.push(`<g class="cal"><path d="M${a[0] - 5} ${a[1]} h10 M${a[0]} ${a[1] - 5} v10"/>`);
      if (c.b) {
        const b = this.toPx(c.b.u, c.b.w);
        parts.push(`<path d="M${b[0] - 5} ${b[1]} h10 M${b[0]} ${b[1] - 5} v10"/><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="dash"/>`);
        parts.push(`<text x="${(a[0] + b[0]) / 2 + 8}" y="${(a[1] + b[1]) / 2}">${ci}</text>`);
      }
      parts.push('</g>');
    }
    if (this.hover && this.tool === 'caliper' && this.calipers.length && !this.calipers[this.calipers.length - 1].b) {
      const c = this.calipers[this.calipers.length - 1];
      const a = this.toPx(c.a.u, c.a.w);
      const b = this.toPx(this.hover.u, this.hover.w);
      const d = Math.hypot(this.hover.u - c.a.u, this.hover.w - c.a.w);
      parts.push(`<g class="cal"><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="dash"/><text x="${b[0] + 8}" y="${b[1] - 6}">${d.toFixed(1)} mm</text></g>`);
    }
    if (s.frozen) parts.push(`<text x="${x + w / 2}" y="${y + 18}" class="frozen" text-anchor="middle">❄ CONGELADO</text>`);
    this.svg.innerHTML = parts.join('');
    // resultados de calibradores en la esquina
    this.updateParams();
    this.updateReadout();
  }

  private updateParams() {
    const s = this.sim.settings;
    const fr = Math.round(Math.min(60, 1540000 / (2 * s.depth * 256) / (s.focusZones === 2 ? 2 : 1) / (s.mode === 'B' ? 1 : 3.2)));
    const mi = (0.62 + 0.25 * (s.focusZones - 1)) * Math.sqrt(12 / s.freq) * 1.1;
    const rows: string[] = [];
    rows.push(`<div class="pgrp"><b>${s.preset}</b></div>`);
    rows.push(`<div>MI ${mi.toFixed(1)}</div><div>TIS 0.${s.mode === 'B' ? 1 : 3}</div>`);
    rows.push(`<div class="sep"></div><div class="pt">2D</div>`);
    rows.push(`<div>Frec ${s.freq.toFixed(0)} MHz</div><div>Gan ${(55 + s.gain).toFixed(0)}</div><div>RD ${s.dr}</div><div>Prof ${(s.depth / 10).toFixed(1)} cm</div><div>FR ${fr} Hz</div>`);
    if (s.persistence > 0) rows.push(`<div>Pers ${Math.round(s.persistence * 10)}</div>`);
    if (s.mode !== 'B') {
      const prf = (4 * s.dopplerFreq * 1e6 * (s.scale / 100)) / 1540 / 1000;
      rows.push(`<div class="sep"></div><div class="pt">${s.mode === 'color' ? 'Color' : 'Power'}</div>`);
      rows.push(`<div>Frec ${s.dopplerFreq.toFixed(1)} MHz</div><div>PRF ${prf.toFixed(1)} kHz</div><div>FP ${s.wallFilter} cm/s</div><div>Gan ${Math.round(s.colorGain * 100)}</div><div>Áng ${s.steer > 0 ? '+' : ''}${s.steer}°</div>`);
    }
    if (s.pw) {
      rows.push(`<div class="sep"></div><div class="pt">PW</div><div>VM ${s.pwGate.size.toFixed(1)} mm</div><div>Corr ${this.spectral.angleCorr.toFixed(0)}°</div><div>Prof ${(s.pwGate.w / 10).toFixed(1)} cm</div>`);
    }
    const res: string[] = [];
    this.calipers.forEach((c, i) => {
      if (c.b) res.push(`<div>${i + 1}  ${c.label}</div>`);
    });
    if (res.length) rows.push(`<div class="sep"></div><div class="pt">Medidas</div>${res.join('')}`);
    this.params.innerHTML = rows.join('');
  }

  private updateReadout() {
    const hv = this.hover;
    if (!hv || hv.u < -this.sim.pose.width / 2 || hv.u > this.sim.pose.width / 2 || hv.w < 0 || hv.w > this.sim.settings.depth) {
      this.readout.textContent = this.flags.hint;
      return;
    }
    let txt = `Profundidad ${hv.w.toFixed(1)} mm · lateral ${hv.u.toFixed(1)} mm`;
    if (this.flags.aids) {
      const p = this.sim.imageToTissue(hv.u, hv.w);
      const q = this.getModel().query(p);
      const name = q.struct ? (q.inLumen ? `luz de ${q.struct.def.name}` : q.inWall ? `pared de ${q.struct.def.name}` : q.inThrombus ? `trombo en ${q.struct.def.name}` : q.struct.def.name) : tissueName(layerTissue(q.layer));
      txt += ` · ${name}`;
      this.sim.highlight = q.struct ? q.struct.index : -1;
    } else this.sim.highlight = -1;
    this.readout.textContent = txt;
  }

  /** Dibuja el espectrograma PW en su lienzo 2D. */
  drawSpectral() {
    const sp = this.spectral;
    const cv = this.specCanvas;
    const wrap = this.specWrap;
    if (!this.sim.settings.pw) {
      wrap.classList.add('hidden');
      return;
    }
    wrap.classList.remove('hidden');
    const cw = Math.max(50, wrap.clientWidth);
    const ch = Math.max(40, wrap.clientHeight);
    if (cv.width !== cw || cv.height !== ch) {
      cv.width = cw;
      cv.height = ch;
      this.specImg = null;
    }
    const g = cv.getContext('2d')!;
    const ml = 8;
    const mr = 58;
    const gw = cw - ml - mr;
    const gh = ch - 8;
    if (!this.specImg || this.specImg.width !== SPEC_COLS) this.specImg = g.createImageData(SPEC_COLS, SPEC_BINS);
    const im = this.specImg.data;
    const cur = sp.col % SPEC_COLS;
    for (let c = 0; c < SPEC_COLS; c++) {
      // barrido tipo "borrado": columna actual con hueco
      const gap = (c - cur + SPEC_COLS) % SPEC_COLS;
      for (let b = 0; b < SPEC_BINS; b++) {
        let v = sp.data[c * SPEC_BINS + b];
        if (gap < 6) v = 0;
        const row = sp.invert ? b : SPEC_BINS - 1 - b;
        const o = (row * SPEC_COLS + c) * 4;
        const vv = Math.round(Math.pow(v, 0.9) * 255);
        im[o] = vv;
        im[o + 1] = vv;
        im[o + 2] = Math.min(255, vv + 6);
        im[o + 3] = 255;
      }
    }
    g.fillStyle = '#000';
    g.fillRect(0, 0, cw, ch);
    const tmp = getTmpCanvas(SPEC_COLS, SPEC_BINS);
    tmp.getContext('2d')!.putImageData(this.specImg, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(tmp, ml, 4, gw, gh);
    // línea base y escala
    const [lo, hi] = sp.vRange();
    const yOf = (v: number) => {
      let f = (v - lo) / (hi - lo);
      if (sp.invert) f = 1 - f;
      return 4 + gh * (1 - f);
    };
    g.strokeStyle = '#6b8faa';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(ml, yOf(0));
    g.lineTo(ml + gw, yOf(0));
    g.stroke();
    g.fillStyle = '#9fc3dc';
    g.font = '11px system-ui, sans-serif';
    const step = niceStep((hi - lo) / 5);
    for (let v = Math.ceil(lo / step) * step; v <= hi - step * 0.3; v += step) {
      const yy = yOf(v);
      g.fillRect(ml + gw, yy, 5, 1);
      g.fillText(`${v.toFixed(0)}`, ml + gw + 8, yy + 4);
    }
    g.fillText('cm/s', ml + gw + 8, ch - 2);
    // envolvente (traza automática)
    if (sp.col > 4) {
      g.strokeStyle = 'rgba(80, 220, 255, 0.85)';
      g.beginPath();
      let started = false;
      for (let c = 0; c < SPEC_COLS; c++) {
        const gap = (c - cur + SPEC_COLS) % SPEC_COLS;
        if (gap < 8) {
          started = false;
          continue;
        }
        const px = ml + (c / SPEC_COLS) * gw;
        const py = yOf(sp.envelope[c]);
        if (!started) {
          g.moveTo(px, py);
          started = true;
        } else g.lineTo(px, py);
      }
      g.stroke();
    }
  }

  private bindPointer() {
    const el = this.view;
    const pos = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return this.toMm(ev.clientX - r.left, ev.clientY - r.top);
    };
    el.addEventListener('pointermove', (ev) => {
      const p = pos(ev);
      this.hover = p;
      const s = this.sim.settings;
      if (this.drag?.kind === 'box') {
        const b = s.colorBox;
        const wu = b.u1 - b.u0;
        const ww = b.w1 - b.w0;
        const W = this.sim.pose.width;
        b.u0 = clamp(p.u - this.drag.du, -W / 2, W / 2 - wu);
        b.u1 = b.u0 + wu;
        b.w0 = clamp(p.w - this.drag.dw, 0.5, s.depth - ww);
        b.w1 = b.w0 + ww;
        this.onChange?.();
      } else if (this.drag?.kind === 'gate') {
        s.pwGate.u = clamp(p.u, -this.sim.pose.width / 2, this.sim.pose.width / 2);
        s.pwGate.w = clamp(p.w, 1, s.depth - 1);
        this.onChange?.();
      }
    });
    el.addEventListener('pointerleave', () => {
      this.hover = null;
      this.sim.highlight = -1;
    });
    el.addEventListener('pointerdown', (ev) => {
      const p = pos(ev);
      const s = this.sim.settings;
      el.setPointerCapture(ev.pointerId);
      if (this.tool === 'caliper') {
        const last = this.calipers[this.calipers.length - 1];
        if (last && !last.b) {
          last.b = { u: p.u, w: p.w };
          const d = Math.hypot(last.b.u - last.a.u, last.b.w - last.a.w);
          last.label = `${d.toFixed(1)} mm`;
          this.onMeasure?.(last);
        } else {
          if (this.calipers.length >= 6) this.calipers.shift();
          this.calipers.push({ a: { u: p.u, w: p.w }, b: null, label: '' });
        }
        this.onChange?.();
        return;
      }
      if (s.pw && (this.tool === 'gate' || ev.shiftKey || this.tool === 'none')) {
        const g = s.pwGate;
        if (Math.hypot(p.u - g.u, p.w - g.w) < 4 || this.tool === 'gate') {
          this.drag = { kind: 'gate', du: 0, dw: 0 };
          s.pwGate.u = p.u;
          s.pwGate.w = p.w;
          this.onChange?.();
          return;
        }
      }
      if (s.mode !== 'B') {
        const b = s.colorBox;
        const tn = Math.tan((s.steer * Math.PI) / 180);
        const us = p.u - (p.w - b.w0) * tn;
        if (us >= b.u0 && us <= b.u1 && p.w >= b.w0 && p.w <= b.w1) {
          this.drag = { kind: 'box', du: p.u - b.u0, dw: p.w - b.w0 };
          return;
        }
      }
    });
    el.addEventListener('pointerup', (ev) => {
      this.drag = null;
      el.releasePointerCapture(ev.pointerId);
    });
    el.addEventListener('wheel', (ev) => {
      // rueda sobre la imagen: tamaño de caja de color / volumen de muestra
      const s = this.sim.settings;
      if (s.pw && ev.shiftKey) {
        s.pwGate.size = clamp(s.pwGate.size + (ev.deltaY < 0 ? 0.5 : -0.5), 0.5, 12);
        ev.preventDefault();
        this.onChange?.();
      } else if (s.mode !== 'B' && ev.altKey) {
        const b = s.colorBox;
        const k = ev.deltaY < 0 ? 1.08 : 0.93;
        const cu = (b.u0 + b.u1) / 2;
        const hw = ((b.u1 - b.u0) / 2) * k;
        b.u0 = cu - hw;
        b.u1 = cu + hw;
        b.w1 = b.w0 + (b.w1 - b.w0) * k;
        ev.preventDefault();
        this.onChange?.();
      }
    }, { passive: false });
  }

  clearCalipers() {
    this.calipers = [];
  }

  /** Texto de medidas Doppler bajo el espectro. */
  setSpecMeasures(html: string) {
    this.specMeas.innerHTML = html;
  }
}

function layerTissue(l: string): number {
  return l === 'outside' ? 0 : l === 'skin' ? 2 : l === 'fat' ? 3 : l === 'fascia' ? 4 : 5;
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function niceStep(x: number) {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

let tmpCanvas: HTMLCanvasElement | null = null;
function getTmpCanvas(w: number, h: number) {
  if (!tmpCanvas) tmpCanvas = document.createElement('canvas');
  if (tmpCanvas.width !== w || tmpCanvas.height !== h) {
    tmpCanvas.width = w;
    tmpCanvas.height = h;
  }
  return tmpCanvas;
}

export { svgNS };
