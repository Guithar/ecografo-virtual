/** Componentes de interfaz reutilizables: mandos giratorios, deslizadores, botones y grupos. */

export type Getter<T> = () => T;
export type Setter<T> = (v: T) => void;

export interface Bound {
  el: HTMLElement;
  update(): void;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  if (html) e.innerHTML = html;
  return e;
}

export function group(title: string, extra = ''): { root: HTMLElement; body: HTMLElement } {
  const root = el('div', { class: 'cgroup' });
  const h = el('h5', {}, `<span>${title}</span>${extra}`);
  root.appendChild(h);
  const body = el('div', { class: 'crow' });
  root.appendChild(body);
  return { root, body };
}

/** Mando giratorio: arrastre vertical, rueda o doble clic para restablecer. */
export function knob(label: string, get: Getter<number>, set: Setter<number>, o: { min: number; max: number; step: number; fmt?: (v: number) => string; def?: number; title?: string }): Bound {
  const root = el('div', { class: 'knob', title: o.title ?? label });
  root.innerHTML = `<svg viewBox="0 0 44 44">
    <circle cx="22" cy="22" r="19" fill="#0d151c" stroke="#2c3b48" stroke-width="2"/>
    <path class="arc" fill="none" stroke="#3fc1c9" stroke-width="3" stroke-linecap="round"/>
    <circle cx="22" cy="22" r="13" fill="url(#kg)" stroke="#34495a"/>
    <line class="ind" x1="22" y1="22" x2="22" y2="11" stroke="#e8f6ff" stroke-width="2.4" stroke-linecap="round"/>
    <defs><radialGradient id="kg" cx="0.35" cy="0.3"><stop offset="0" stop-color="#4a5a68"/><stop offset="1" stop-color="#1b242d"/></radialGradient></defs>
  </svg><div class="kv"></div><div class="kl">${label}</div>`;
  const arc = root.querySelector('.arc') as SVGPathElement;
  const ind = root.querySelector('.ind') as SVGLineElement;
  const kv = root.querySelector('.kv') as HTMLElement;
  const A0 = -135;
  const A1 = 135;
  const update = () => {
    const v = get();
    const f = (v - o.min) / (o.max - o.min);
    const a = A0 + f * (A1 - A0);
    ind.setAttribute('transform', `rotate(${a} 22 22)`);
    const r = 19;
    const p = (ang: number) => {
      const rad = ((ang - 90) * Math.PI) / 180;
      return `${22 + r * Math.cos(rad)} ${22 + r * Math.sin(rad)}`;
    };
    arc.setAttribute('d', `M ${p(A0)} A ${r} ${r} 0 ${a - A0 > 180 ? 1 : 0} 1 ${p(a)}`);
    kv.textContent = o.fmt ? o.fmt(v) : String(v);
  };
  const setV = (v: number) => {
    const q = Math.round(v / o.step) * o.step;
    set(Math.max(o.min, Math.min(o.max, +q.toFixed(4))));
    update();
  };
  let drag: { y: number; v: number } | null = null;
  root.addEventListener('pointerdown', (e) => {
    drag = { y: e.clientY, v: get() };
    root.setPointerCapture(e.pointerId);
  });
  root.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dv = ((drag.y - e.clientY) / 120) * (o.max - o.min);
    setV(drag.v + dv);
  });
  root.addEventListener('pointerup', () => (drag = null));
  root.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      setV(get() + (e.deltaY < 0 ? o.step : -o.step));
    },
    { passive: false },
  );
  root.addEventListener('dblclick', () => {
    if (o.def !== undefined) setV(o.def);
  });
  update();
  return { el: root, update };
}

export function button(label: string, onClick: () => void, o: { title?: string; cls?: string; active?: Getter<boolean> } = {}): Bound {
  const b = el('button', { title: o.title ?? '' }, label);
  if (o.cls) b.classList.add(...o.cls.split(' '));
  b.addEventListener('click', (e) => {
    onClick();
    upd();
    // devolver el foco al documento para que los atajos (espacio, flechas) no reactiven el botón
    if ((e as PointerEvent).pointerType) b.blur();
  });
  const upd = () => {
    if (o.active) b.classList.toggle('on', o.active());
  };
  upd();
  return { el: b, update: upd };
}

export function vslider(label: string, get: Getter<number>, set: Setter<number>, o: { min: number; max: number; step: number; title?: string }): Bound {
  const root = el('div', { class: 'vslider', title: o.title ?? label });
  const inp = el('input', { type: 'range', min: String(o.min), max: String(o.max), step: String(o.step) }) as HTMLInputElement;
  root.appendChild(inp);
  root.appendChild(el('span', {}, label));
  inp.addEventListener('input', () => set(parseFloat(inp.value)));
  const update = () => {
    if (document.activeElement !== inp) inp.value = String(get());
  };
  update();
  return { el: root, update };
}

export function field(label: string, get: Getter<number>, set: Setter<number>, o: { min: number; max: number; step: number; fmt?: (v: number) => string; title?: string }): Bound {
  const root = el('label', { class: 'field', title: o.title ?? label });
  root.appendChild(el('span', {}, label));
  const inp = el('input', { type: 'range', min: String(o.min), max: String(o.max), step: String(o.step) }) as HTMLInputElement;
  root.appendChild(inp);
  const val = el('span', { class: 'val' });
  root.appendChild(val);
  inp.addEventListener('input', () => {
    set(parseFloat(inp.value));
    val.textContent = o.fmt ? o.fmt(get()) : String(get());
  });
  const update = () => {
    if (document.activeElement !== inp) inp.value = String(get());
    val.textContent = o.fmt ? o.fmt(get()) : String(get());
  };
  update();
  return { el: root, update };
}

export function selectBox<T extends string>(opts: [T, string][], get: Getter<T>, set: Setter<T>, title = ''): Bound {
  const s = el('select', { title }) as HTMLSelectElement;
  for (const [v, l] of opts) s.appendChild(el('option', { value: v }, l));
  s.addEventListener('change', () => {
    set(s.value as T);
    // liberar el foco para que los atajos de teclado vuelvan a funcionar
    s.blur();
  });
  const update = () => {
    if (document.activeElement !== s) s.value = get();
  };
  update();
  return { el: s, update };
}

export function col(...items: (Bound | HTMLElement)[]): HTMLElement {
  const d = el('div', { class: 'ccol' });
  d.style.display = 'flex';
  d.style.flexDirection = 'column';
  d.style.gap = '4px';
  for (const i of items) d.appendChild('el' in i ? i.el : i);
  return d;
}

export function row(...items: (Bound | HTMLElement)[]): HTMLElement {
  const d = el('div', { class: 'crow wrap' });
  for (const i of items) d.appendChild('el' in i ? i.el : i);
  return d;
}
