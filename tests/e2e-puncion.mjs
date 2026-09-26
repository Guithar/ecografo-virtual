// Punción completa manejando la interfaz como un usuario (clics y teclado), con capturas.
//   node tests/e2e-puncion.mjs <url> [carpeta_capturas] [corto|largo]
//   corto: eje corto con la tecla N desde el modo Exploración (avance sin seguir la punta).
//   largo: eje largo con buena técnica: compresor (K), vista longitudinal (2), «Colocar en plano»,
//          avance con ↑ hasta la luz y hasta dejar la punta centrada; confirmación con Intro.
// Solo se lee el estado de la aplicación (window.app) para saber cuándo parar; las acciones son
// clics y teclas reales. El bucle de render se pausa durante cada captura (SwiftShader es lento).
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
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

await page.goto(url);
await page.waitForFunction(() => window.app && window.app.frameCount > 2, null, { timeout: 180000 });
// 1. cerrar la bienvenida con su botón
if (await page.isVisible('#modalClose')) await page.click('#modalClose');
await log('1. bienvenida cerrada');
let s;
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
  await page.waitForFunction(() => window.app.flush && window.app.time - window.app.flush.t0 > 1.0, null, { timeout: 240000 });
  await log('7. J (lavado con suero)');
  await shot('05-lavado-suero');
}
// confirmar con Intro
await page.keyboard.press('Enter');
await page.waitForTimeout(2000);
const result = await page.evaluate(() => ({
  puntuacion: window.app.metrics.score(),
  lavados: window.app.metrics.flushes,
  infiltraciones: window.app.metrics.infiltrations,
  criterios: window.app.metrics.checks.map((c) => `${c.ok === null ? '·' : c.ok ? '✓' : '✗'} ${c.label}: ${c.detail}`),
}));
await log('Intro (evaluación)');
await shot(eje === 'corto' ? '04-evaluacion' : '06-evaluacion');
console.log(JSON.stringify(result, null, 1));
console.log('errores de la página:', errors.length ? errors : 'ninguno');
await browser.close();
const ok = s.estado === 'luz' && !errors.length && (eje !== 'largo' || (result.lavados === 1 && result.infiltraciones === 0));
process.exit(ok ? 0 : 1);
