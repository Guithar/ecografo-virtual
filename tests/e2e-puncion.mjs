// Punción completa manejando la interfaz como un usuario (clics y teclado), con capturas.
//   node tests/e2e-puncion.mjs <url> [carpeta_capturas] [corto|largo|corto-dntp]
//   corto: eje corto con la tecla N desde el modo Exploración (avance sin seguir la punta).
//   largo: eje largo con buena técnica: compresor (K), vista longitudinal (2), «Colocar en plano»,
//          avance con ↑ hasta la luz y hasta dejar la punta centrada, lavado con suero (J), Intro.
//   corto-dntp: eje corto con buena técnica: compresor, N, posicionamiento dinámico de la punta
//          (↑ hasta ver la punta, Mayús+W hasta perderla, y repetir), aplanar (AvPág) y avanzar,
//          lavado con suero (J) sobre la punta, aguas abajo y con Doppler color (C), Intro.
// Solo se lee el estado de la aplicación (window.app) para saber cuándo parar; las acciones son
// clics y teclas reales. El bucle de render se pausa durante cada captura (SwiftShader es lento).
// Cada captura guarda la pantalla completa y la imagen ecográfica nativa (<nombre>-eco.png).
import { createRequire } from 'module';
import { mkdirSync, writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }

const [url, out = 'tests/screens/e2e', eje = 'corto'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const state = () => page.evaluate(() => {
  const a = window.app;
  const n = a.needle;
  const inLumen = n.state === 'luz';
  const cen = inLumen ? n.centering(a.model) : null;
  return {
    modo: a.mode,
    colocada: n.placed,
    estado: n.state,
    insertada: +n.depth.toFixed(1),
    vaso: n.inVessel?.def.id ?? null,
    luz_mm: inLumen ? +n.intraluminalLength(a.model).toFixed(1) : 0,
    centrado: cen === null ? null : +cen.toFixed(2),
  };
});
const log = async (paso) => console.log(paso.padEnd(34), JSON.stringify(await state()));
const shot = async (name) => {
  // dejar correr unos fotogramas (paneles al día) y pausar el render para capturar
  await page.evaluate(() => { window.app.maxFrames = window.app.frameCount + 3; });
  await page.waitForFunction(() => window.app.frameCount >= window.app.maxFrames, null, { timeout: 120000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 });
  // imagen ecográfica nativa, con la proporción física (ancho × profundidad) y la orientación de pantalla
  const eco = await page.evaluate(() => {
    const sim = window.app.sim;
    const nl = sim.nl, na = sim.na;
    const c = document.createElement('canvas');
    c.width = nl; c.height = na;
    const g = c.getContext('2d');
    const id = g.createImageData(nl, na);
    id.data.set(sim.readDisplay());
    g.putImageData(id, 0, 0);
    const k = 22; // px por mm
    const z = document.createElement('canvas');
    z.width = Math.round(sim.pose.width * k);
    z.height = Math.round(sim.settings.depth * k);
    const gz = z.getContext('2d');
    if (sim.settings.flipLR) { gz.translate(z.width, 0); gz.scale(-1, 1); }
    gz.drawImage(c, 0, 0, z.width, z.height);
    return z.toDataURL('image/png');
  });
  writeFileSync(`${out}/${name}-eco.png`, Buffer.from(eco.split(',')[1], 'base64'));
  // reanudar sólo si el bucle llegó a detenerse (evita dos bucles de render a la vez)
  await page.evaluate(() => {
    const a = window.app;
    const stopped = a.frameCount >= a.maxFrames;
    a.maxFrames = Infinity;
    if (stopped) requestAnimationFrame(() => a.frame());
  });
};
/** Mantiene pulsada una tecla hasta que se cumple la condición sobre el estado. */
const holdUntil = async (key, done, maxMs = 240000) => {
  await page.keyboard.down(key);
  const t0 = Date.now();
  let s = await state();
  while (!done(s) && Date.now() - t0 < maxMs) {
    await page.waitForTimeout(150);
    s = await state();
  }
  await page.keyboard.up(key);
  return s;
};
const WALL = ['tienda', 'luz', 'pared-post', 'transfixión', 'hueso'];
const PAST = ['luz', 'pared-post', 'transfixión', 'hueso'];
const BAD = ['pared-post', 'transfixión', 'hueso'];

/**
 * Posición de la punta respecto al plano de imagen (eje corto). eDir > 0: la punta ha pasado el
 * plano en el sentido de avance de la aguja; |eDir| < half: la punta está dentro del grosor de corte.
 */
const tipInfo = () => page.evaluate(() => {
  const a = window.app, n = a.needle, sim = a.sim;
  const dirE = Math.sign(n.dir.dot(sim.pose.E)) || 1;
  const im = sim.tissueToImage(n.tip);
  const inLumen = n.state === 'luz';
  return {
    eDir: im.e * dirE,
    eEntry: sim.tissueToImage(n.entry).e * dirE,
    half: sim.sliceThickness(Math.max(0, im.w)) / 2,
    w: im.w,
    estado: n.state,
    depth: n.depth,
    angle: n.angle,
    av: inLumen ? n.angleToVessel(a.model) : null,
    luz: inLumen ? n.intraluminalLength(a.model) : 0,
    cen: inLumen ? n.centering(a.model) : null,
    frame: a.frameCount,
  };
});
/** Mantiene pulsadas unas teclas fotograma a fotograma hasta que se cumple la condición. */
const holdFrames = async (keys, done, maxFrames = 200) => {
  for (const k of keys) await page.keyboard.down(k);
  let t = await tipInfo();
  for (let n = 0; n < maxFrames && !done(t); n++) {
    const f = t.frame;
    await page.waitForFunction((f) => window.app.frameCount > f, f, { timeout: 120000, polling: 40 });
    t = await tipInfo();
  }
  for (const k of [...keys].reverse()) await page.keyboard.up(k);
  return t;
};
/** Desliza la sonda (Mayús+W / Mayús+S, pasos finos) hasta dejar la punta dentro del corte. */
const centerOnTip = async () => {
  let t = await tipInfo();
  if (t.eDir > 0.4 * t.half) t = await holdFrames(['Shift', 'w'], (x) => x.eDir <= 0.2 * x.half, 60);
  else if (t.eDir < -0.4 * t.half) t = await holdFrames(['Shift', 's'], (x) => x.eDir >= -0.2 * x.half, 60);
  return t;
};
const waitFlush = (tau) => page.waitForFunction((tau) => { const a = window.app; return (a.flush && a.time - a.flush.t0 >= tau) || a.metrics.infiltrations > 0; }, tau, { timeout: 240000, polling: 50 });

await page.goto(url);
await page.waitForFunction(() => window.app && window.app.frameCount > 2, null, { timeout: 180000 });
// 1. cerrar la bienvenida con su botón
if (await page.isVisible('#modalClose')) await page.click('#modalClose');
await log('1. bienvenida cerrada');
let s;
if (eje === 'corto-dntp') {
  // 2. modo Punción (pestaña), sonda centrada (◎), compresor (K) y vista transversal (1)
  await page.click('#modeTabs button[data-mode="cannulate"]');
  await page.click('button[title^="Centrar sobre el vaso"]');
  await page.keyboard.press('k');
  await page.keyboard.press('1');
  await page.waitForTimeout(1500);
  await log('2. Punción, compresor, eje corto');
  // 3. aguja fuera de plano (N): en la línea media de la sonda, apuntando al vaso
  await page.keyboard.press('n');
  await page.waitForFunction(() => window.app.needle.placed, null, { timeout: 60000 });
  await log('3. tecla N (fuera de plano)');
  // 4. posicionamiento dinámico de la punta: plano junto a la entrada (Mayús+S) y después, en ciclos,
  //    ↑ hasta ver la punta (punto brillante) y Mayús+W hasta perderla
  let t = await holdFrames(['Shift', 's'], (x) => x.eEntry > -2.5, 120);
  await shot('01-sonda-junto-a-la-entrada');
  let shotTissue = false;
  let shotTent = false;
  for (let cycle = 0; cycle < 60 && t.estado !== 'luz'; cycle++) {
    t = await holdFrames(['ArrowUp'], (x) => x.eDir >= -0.35 * x.half || x.estado === 'luz' || BAD.includes(x.estado), 80);
    if (BAD.includes(t.estado)) throw new Error(`Complicación durante el DNTP: ${t.estado}`);
    if (!shotTissue && t.estado === 'tejido' && t.depth > 2.5) {
      await shot('02-punta-en-el-tejido');
      shotTissue = true;
    }
    if (!shotTent && t.estado === 'tienda') {
      t = await centerOnTip();
      await shot('03-signo-tienda');
      shotTent = true;
    }
    if (t.estado === 'luz') break;
    t = await holdFrames(['Shift', 'w'], (x) => x.eDir < -1.1 * x.half, 60);
  }
  if (t.estado !== 'luz') throw new Error(`No se llegó a la luz con DNTP (estado ${t.estado})`);
  t = await centerOnTip();
  await page.waitForTimeout(2500); // reflujo en la cámara de la aguja
  await log('4. DNTP hasta la luz');
  await shot('04-punta-en-la-luz');
  // 5. aplanar (AvPág) y avanzar a la vez dentro de la luz, siguiendo la punta con la sonda, hasta
  //    alinear la aguja con el eje del vaso (criterio final ≤ 25°; aquí con margen)
  const AV = 22;
  const goal = (x) => (x.av ?? 90) <= AV && x.luz >= 6 && (x.cen ?? 1) < 0.6;
  for (let i = 0; i < 40 && t.estado === 'luz' && !goal(t); i++) {
    if (Math.abs(t.eDir) > 0.6 * t.half) {
      t = await centerOnTip();
      continue;
    }
    const flatten = (t.av ?? 0) > AV && t.luz >= 2.5;
    const keys = flatten ? ['PageDown', 'ArrowUp'] : ['ArrowUp'];
    t = await holdFrames(keys, (x) => x.estado !== 'luz' || Math.abs(x.eDir) > 0.6 * x.half || goal(x) || (flatten && (x.av ?? 0) <= AV), 12);
  }
  if (t.estado !== 'luz') throw new Error(`La punta salió de la luz al aplanar (estado ${t.estado})`);
  t = await centerOnTip();
  await log('5. aplanar y avanzar');
  await shot('05-punta-centrada');
  // 6. lavado con suero sobre la punta (J): microburbujas y chorro en la luz
  await page.keyboard.press('j');
  await waitFlush(0.8);
  if (await page.evaluate(() => window.app.metrics.infiltrations > 0)) throw new Error('El lavado produjo una infiltración: la punta no estaba en la luz');
  await log('6. J: suero sobre la punta');
  await shot('06-suero-en-la-punta');
  // 7. deslizar la sonda ~6 mm aguas abajo durante el lavado: la luz se llena de microburbujas
  t = await holdFrames(['w'], (x) => x.eDir < -6, 12);
  await waitFlush(1.8);
  await log('7. suero aguas abajo');
  await shot('07-suero-aguas-abajo');
  // volver sobre la punta cuando termine el lavado
  await page.waitForFunction(() => !window.app.flush, null, { timeout: 240000, polling: 100 });
  t = await holdFrames(['s'], (x) => x.eDir > -1.2, 12);
  t = await centerOnTip();
  // 8. segundo lavado con Doppler color (C): chorro con aliasing junto a la punta
  await page.keyboard.press('c');
  await page.keyboard.press('j');
  await waitFlush(0.7);
  await log('8. J con Doppler color');
  await shot('08-suero-doppler-color');
  await page.waitForFunction(() => !window.app.flush, null, { timeout: 240000, polling: 100 });
  await page.keyboard.press('c');
  s = await state();
} else {
  if (eje === 'corto') {
    // 2. centrar la sonda sobre el vaso (botón ◎) y vista transversal (tecla 1)
    await page.click('button[title^="Centrar sobre el vaso"]');
    await page.keyboard.press('1');
    await page.waitForTimeout(1500);
    await log('2. sonda centrada, eje corto');
    // 3. N desde el modo Exploración: debe pasar a Punción y colocar la aguja
    await page.keyboard.press('n');
    await page.waitForFunction(() => window.app.needle.placed, null, { timeout: 60000 });
    await log('3. tecla N');
    await shot('01-aguja-colocada');
    // 4. avanzar con ↑ hasta la pared y la luz
    s = await holdUntil('ArrowUp', (x) => WALL.includes(x.estado));
    await log('4. ↑ hasta la pared');
    if (s.estado === 'tienda') {
      await shot('02-signo-tienda');
      s = await holdUntil('ArrowUp', (x) => PAST.includes(x.estado));
    }
  } else {
    // 2. modo Punción (pestaña), sonda centrada (◎), compresor (K) y vista longitudinal (2)
    await page.click('#modeTabs button[data-mode="cannulate"]');
    await page.click('button[title^="Centrar sobre el vaso"]');
    await page.keyboard.press('k');
    await page.keyboard.press('2');
    await page.waitForTimeout(1500);
    await log('2. Punción, compresor, eje largo');
    // 3. aguja en plano con el botón de la consola
    await page.getByRole('button', { name: 'Colocar en plano' }).click();
    await page.waitForFunction(() => window.app.needle.placed, null, { timeout: 60000 });
    await log('3. «Colocar en plano»');
    await shot('01-aguja-en-plano');
    // 4. avanzar con ↑ hasta la pared (signo de la tienda, visible en el plano)
    s = await holdUntil('ArrowUp', (x) => WALL.includes(x.estado));
    await log('4. ↑ hasta la pared');
    if (!WALL.includes(s.estado)) throw new Error(`La aguja no llegó al vaso a tiempo (estado ${s.estado}, ${s.insertada} mm): ¿render demasiado lento? Prueba con ?calidad=baja`);
    if (s.estado === 'tienda') {
      await shot('02-signo-tienda');
      s = await holdUntil('ArrowUp', (x) => PAST.includes(x.estado));
    }
    await log('5. ↑ hasta la luz (reflujo)');
    await page.waitForTimeout(3000);
    await shot('03-reflujo');
    // 6. seguir avanzando dentro de la luz hasta ≥ 6 mm de recorrido con la punta centrada
    if (s.estado === 'luz') {
      s = await holdUntil('ArrowUp', (x) => x.estado !== 'luz' || (x.luz_mm >= 6 && x.centrado !== null && x.centrado < 0.5), 120000);
    }
  }
  await page.waitForTimeout(3000); // dejar que aparezca el reflujo en la cámara de la aguja
  await log(eje === 'corto' ? '5. ↑ hasta la luz' : '6. punta centrada en la luz');
  await shot(eje === 'corto' ? '03-reflujo' : '04-punta-centrada');
  if (eje === 'largo') {
    // 7. comprobar la posición con un lavado de suero (tecla J): microburbujas arrastradas por el flujo
    await page.keyboard.press('j');
    await page.waitForFunction(() => (window.app.flush && window.app.time - window.app.flush.t0 > 1.0) || window.app.metrics.infiltrations > 0, null, { timeout: 240000 });
    if (await page.evaluate(() => window.app.metrics.infiltrations > 0)) throw new Error('El lavado produjo una infiltración: la punta no estaba en la luz');
    await log('7. J (lavado con suero)');
    await shot('05-lavado-suero');
  }
}
// confirmar con Intro
await page.keyboard.press('Enter');
await page.waitForTimeout(2000);
const result = await page.evaluate(() => ({
  puntuacion: window.app.metrics.score(),
  redirecciones: window.app.metrics.redirections,
  lavados: window.app.metrics.flushes,
  infiltraciones: window.app.metrics.infiltrations,
  criterios: window.app.metrics.checks.map((c) => `${c.ok === null ? '·' : c.ok ? '✓' : '✗'} ${c.label}: ${c.detail}`),
}));
await log('Intro (evaluación)');
await shot({ corto: '04-evaluacion', largo: '06-evaluacion', 'corto-dntp': '09-evaluacion' }[eje] ?? 'evaluacion');
const vis = await page.evaluate(() => window.app.metrics.snapshot().tipVisiblePct);
console.log(JSON.stringify({ ...result, punta_visible_pct: Math.round(vis) }, null, 1));
console.log('errores de la página:', errors.length ? errors : 'ninguno');
await browser.close();
const flushOk = eje === 'largo' ? result.lavados === 1 : eje === 'corto-dntp' ? result.lavados === 2 : true;
// ninguna ruta cambia la trayectoria en el tejido: aplanar dentro de la luz no es una redirección
const ok = s.estado === 'luz' && !errors.length && flushOk && result.infiltraciones === 0 && result.redirecciones === 0;
process.exit(ok ? 0 : 1);
