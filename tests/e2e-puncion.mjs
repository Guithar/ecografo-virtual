// Punción completa manejando la interfaz como un usuario (clics y teclado), con capturas.
//   node tests/e2e-puncion.mjs <url> [carpeta_capturas]
// Solo se lee el estado de la aplicación (window.app) para saber cuándo parar; las acciones son
// clics y teclas reales. El bucle de render se pausa durante cada captura (SwiftShader es lento).
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }

const [url, out = 'tests/screens/e2e'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const state = () => page.evaluate(() => {
  const n = window.app.needle;
  return { modo: window.app.mode, colocada: n.placed, estado: n.state, insertada: +n.depth.toFixed(1), vaso: n.inVessel?.def.id ?? null };
});
const log = async (paso) => console.log(paso.padEnd(34), JSON.stringify(await state()));
const shot = async (name) => {
  await page.evaluate(() => { window.app.maxFrames = window.app.frameCount + 1; });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 });
  // reanudar sólo si el bucle llegó a detenerse (evita dos bucles de render a la vez)
  await page.evaluate(() => {
    const a = window.app;
    const stopped = a.frameCount >= a.maxFrames;
    a.maxFrames = Infinity;
    if (stopped) requestAnimationFrame(() => a.frame());
  });
};
/** Mantiene pulsada una tecla hasta que la aguja llega a alguno de los estados indicados. */
const holdUntil = async (key, states, maxMs = 240000) => {
  await page.keyboard.down(key);
  const t0 = Date.now();
  let s = await state();
  while (!states.includes(s.estado) && Date.now() - t0 < maxMs) {
    await page.waitForTimeout(200);
    s = await state();
  }
  await page.keyboard.up(key);
  return s;
};

await page.goto(url);
await page.waitForFunction(() => window.app && window.app.frameCount > 2, null, { timeout: 180000 });
// 1. cerrar la bienvenida con su botón
if (await page.isVisible('#modalClose')) await page.click('#modalClose');
await log('1. bienvenida cerrada');
// 2. centrar la sonda sobre el vaso (botón ◎) y vista transversal (tecla 1)
await page.click('button[title^="Centrar sobre el vaso"]');
await page.keyboard.press('1');
await page.waitForTimeout(1500);
await log('2. sonda centrada, eje corto');
// 3. N desde el modo Exploración: debe pasar a Punción y colocar la aguja
await page.keyboard.press('n');
await page.waitForFunction(() => window.app.needle.placed, null, { timeout: 60000 });
await page.waitForTimeout(1500);
await log('3. tecla N');
await shot('01-aguja-colocada');
// 4. avanzar con ↑ hasta el signo de la tienda (o la luz, si la pared cede enseguida)
let s = await holdUntil('ArrowUp', ['tienda', 'luz', 'pared-post', 'transfixión', 'hueso']);
await log('4. ↑ hasta la pared');
if (s.estado === 'tienda') {
  await shot('02-signo-tienda');
  s = await holdUntil('ArrowUp', ['luz', 'pared-post', 'transfixión', 'hueso']);
}
await page.waitForTimeout(4000); // dejar que aparezca el reflujo en la cámara de la aguja
await log('5. ↑ hasta la luz');
await shot('03-reflujo');
// 6. confirmar con Intro
await page.keyboard.press('Enter');
await page.waitForTimeout(2000);
const result = await page.evaluate(() => ({
  puntuacion: window.app.metrics.score(),
  criterios: window.app.metrics.checks.map((c) => `${c.ok === null ? '·' : c.ok ? '✓' : '✗'} ${c.label}: ${c.detail}`),
}));
await log('6. Intro (evaluación)');
await shot('04-evaluacion');
console.log(JSON.stringify(result, null, 1));
console.log('errores de la página:', errors.length ? errors : 'ninguno');
await browser.close();
const ok = s.estado === 'luz' && !errors.length;
process.exit(ok ? 0 : 1);
