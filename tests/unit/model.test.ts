import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { ArmShape } from '../../src/anatomy/armShape';
import { caseById, CASES } from '../../src/anatomy/cases';
import { waveFactor, waveStats } from '../../src/anatomy/hemo';
import { AnatomyModel } from '../../src/anatomy/model';
import { Needle } from '../../src/interaction/needle';
import { Metrics } from '../../src/training/metrics';
import { FLUSH_INJECT_S, flushParams, innerDiameter, jetVelocity } from '../../src/sim/flush';

function build(id: string) {
  const cd = caseById(id);
  const arm = new ArmShape(undefined, cd.armOpts);
  const model = new AnatomyModel(arm, cd.build(arm));
  model.hr = cd.hr;
  model.updateDynamics(0.3);
  return { cd, arm, model };
}

describe('hemodinámica', () => {
  it('las formas de onda tienen media 1 a lo largo del ciclo', () => {
    for (const k of ['feed', 'avf', 'artery', 'mixed', 'graft'] as const) {
      let s = 0;
      const N = 2000;
      for (let i = 0; i < N; i++) s += waveFactor(k, (i / N) * (60 / 72), 72);
      expect(s / N).toBeCloseTo(1, 2);
    }
  });

  it('índices de resistencia coherentes con la literatura', () => {
    expect(waveStats('feed').ri).toBeGreaterThan(0.4); // arteria nutricia de FAV ≈ 0.47 ± 0.07
    expect(waveStats('feed').ri).toBeLessThan(0.58);
    expect(waveStats('artery').ri).toBeGreaterThan(0.9); // arteria periférica en reposo ≈ 1
    expect(waveStats('avf').ri).toBeLessThan(0.5);
  });
});

describe('forma del brazo', () => {
  it('surfacePoint y skinDepth son coherentes', () => {
    const arm = new ArmShape();
    for (const [x, th, d] of [
      [50, 40, 3],
      [120, -60, 6],
      [300, 80, 5],
      [150, 0, 10],
    ]) {
      const p = arm.surfacePoint(x, th, 'skin', d);
      expect(arm.skinDepth(p)).toBeCloseTo(d, 0);
    }
  });
});

describe('modelo anatómico', () => {
  it('todos los casos se construyen sin errores', () => {
    for (const c of CASES) {
      const arm = new ArmShape(undefined, c.armOpts);
      const m = new AnatomyModel(arm, c.build(arm));
      expect(m.structures.length).toBeGreaterThan(10);
      if (c.access) expect(m.byId(c.access.veinId)).toBeDefined();
    }
  });

  it('el centro de la FAV está en la luz y la sangre fluye hacia proximal', () => {
    const { model } = build('rc_madura');
    const fav = model.byId('fav')!;
    const smp = fav.samples[Math.floor(fav.samples.length * 0.25)];
    const q = model.query(smp.p);
    expect(q.inLumen).toBe(true);
    expect(q.struct?.def.id).toBe('fav');
    expect(q.vel.dot(smp.t)).toBeGreaterThan(20); // cm/s
    expect(q.vel.length()).toBeLessThan(200);
  });

  it('la integral del perfil de velocidad reproduce el caudal (continuidad)', () => {
    const { model } = build('rc_madura');
    const fav = model.byId('fav')!;
    const smp = fav.samples[80];
    const t = smp.t;
    const n1 = new Vector3(0, 1, 0).addScaledVector(t, -t.y).normalize();
    const n2 = new Vector3().crossVectors(t, n1);
    const R = smp.r * fav.dyn.radiusScale;
    let flow = 0; // cm³/s
    const N = 60;
    const dA = ((2 * R) / N) ** 2 / 100; // cm²
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const a = -R + ((i + 0.5) * 2 * R) / N;
        const b = -R + ((j + 0.5) * 2 * R) / N;
        if (a * a + b * b > R * R * 0.995) continue;
        const p = smp.p.clone().addScaledVector(n1, a).addScaledVector(n2, b);
        const q = model.query(p);
        if (q.inLumen && q.struct === fav) flow += q.vel.dot(t) * dA;
      }
    expect(flow / fav.dyn.qNow).toBeGreaterThan(0.85);
    expect(flow / fav.dyn.qNow).toBeLessThan(1.15);
  });

  it('la estenosis acelera el flujo (VPS > 3× la vena de salida)', () => {
    const { model } = build('rc_estenosis');
    const fav = model.byId('fav')!;
    let minR = Infinity;
    let iMin = 0;
    fav.samples.forEach((s, i) => {
      if (s.s > 8 && s.s < 40 && s.r < minR) {
        minR = s.r;
        iMin = i;
      }
    });
    const vSten = model.query(fav.samples[iMin].p).vel.length();
    const vDown = model.query(fav.samples[iMin + 60].p).vel.length();
    expect(minR * 2).toBeLessThan(2.2); // luz residual < 2 mm aprox.
    expect(vSten / vDown).toBeGreaterThan(3);
  });
});

describe('aguja', () => {
  it('atraviesa piel y pared, entra en la luz y produce reflujo', () => {
    const { arm, model } = build('rc_madura');
    const fav = model.byId('fav')!;
    const target = fav.samples[70].p;
    const th = (Math.atan2(target.z, target.y) * 180) / Math.PI;
    const n = new Needle('venosa');
    const events: string[] = [];
    n.onEvent = (e) => events.push(e.type);
    // entrar 10 mm distal al objetivo con 35°, en dirección proximal
    n.place(arm, target.x - 9, th, 0, 35);
    const ids = new Set(['fav']);
    for (let i = 0; i < 120 && n.state !== 'luz'; i++) {
      n.depth += 0.2;
      n.update(model, i * 0.05, ids);
    }
    expect(events).toContain('skin');
    expect(events).toContain('tent');
    expect(events).toContain('pop');
    expect(events).toContain('flash');
    expect(n.state).toBe('luz');
    // seguir avanzando con 35° acaba contactando con la pared posterior
    for (let i = 0; i < 80; i++) {
      n.depth += 0.2;
      n.update(model, 10 + i * 0.05, ids);
    }
    expect(events).toContain('backwall');
  });

  it('cruzar el rumbo ±180° gira por el camino corto (sin barrido de 360°)', () => {
    const { arm, model } = build('rc_madura');
    const n = new Needle('venosa');
    n.place(arm, 120, 40, 179, 30);
    const ids = new Set(['fav']);
    n.depth = 4;
    n.update(model, 0, ids);
    const tip0 = n.tip.clone();
    n.heading = -179; // 2° de giro real
    n.update(model, 0.1, ids);
    expect(n.tip.distanceTo(tip0)).toBeLessThan(0.3);
    expect(n.redirections).toBe(0);
    expect(n.heading).toBeCloseTo(-179, 5);
  });

  it('el nervio cubital no atraviesa el epicóndilo en ningún caso', () => {
    for (const c of CASES) {
      const arm = new ArmShape(undefined, c.armOpts);
      const m = new AnatomyModel(arm, c.build(arm));
      const nerve = m.byId('n_cubital');
      const epi = m.byId('humero_epi');
      if (!nerve || !epi) continue;
      for (const s of nerve.samples) {
        const q = m.query(s.p);
        expect(q.struct?.def.kind).not.toBe('bone');
      }
    }
  });
});

describe('lavado con suero', () => {
  it('chorro de alta velocidad a la salida de una aguja 15G (≈ 2 m/s)', () => {
    const v = jetVelocity(innerDiameter(1.829));
    expect(v).toBeGreaterThan(150);
    expect(v).toBeLessThan(300);
  });

  it('en una FAV de alto flujo el penacho sale del campo en cuanto termina la inyección', () => {
    const fav = { t0: 10, sidx: 3, vmean: 500, qVessel: 15, jetVel: 200 };
    const during = flushParams(fav, 11);
    expect(during.active).toBe(true);
    expect(during.jet).toBeCloseTo(1, 5);
    expect(during.tail).toBe(0);
    expect(during.intensity).toBeGreaterThan(0.5);
    expect(flushParams(fav, 10 + FLUSH_INJECT_S + 1).active).toBe(false);
  });

  it('en una vena de flujo lento el penacho se ve más tiempo y está menos diluido', () => {
    const vein = { t0: 0, sidx: 1, vmean: 40, qVessel: 0.5, jetVel: 200 };
    const p = flushParams(vein, FLUSH_INJECT_S + 1);
    expect(p.active).toBe(true);
    expect(p.tail).toBeGreaterThan(0);
    expect(p.front).toBeGreaterThan(p.tail);
    expect(p.jet).toBeLessThan(0.01);
    const fav = flushParams({ ...vein, vmean: 500, qVessel: 15 }, 1);
    expect(flushParams(vein, 1).intensity).toBeGreaterThan(fav.intensity);
  });
});

describe('métricas', () => {
  it('penaliza la infiltración de suero y cuenta los lavados', () => {
    const m = new Metrics();
    m.onEvent({ t: 1, type: 'flush', msg: '', severity: 'ok' });
    expect(m.score()).toBe(100);
    m.onEvent({ t: 2, type: 'infiltration', msg: '', severity: 'error' });
    expect(m.score()).toBe(88);
    expect(m.snapshot().flushes).toBe(1);
    expect(m.snapshot().infiltrations).toBe(1);
  });

  it('penaliza transfixión y punción arterial', () => {
    const m = new Metrics();
    expect(m.score()).toBe(100);
    m.onEvent({ t: 1, type: 'skin', msg: '', severity: 'info' });
    m.onEvent({ t: 2, type: 'transfix', msg: '', severity: 'error' });
    const s1 = m.score();
    expect(s1).toBeLessThan(90);
    m.onEvent({ t: 3, type: 'artery', msg: '', severity: 'error' });
    expect(m.score()).toBeLessThan(s1 - 20);
  });
});
