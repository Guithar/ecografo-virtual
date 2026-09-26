// Ejecuta JS en la aplicación y muestra el resultado (sin captura). node tests/eval.mjs <url> <espera_ms> <js>
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const [url, wait, js] = process.argv.slice(2);
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
await page.goto(url);
await page.waitForTimeout(+wait);
try { console.log(JSON.stringify(await page.evaluate(js), null, 0)); } catch (e) { console.log('[evalerr]', e.message.split('\n')[0]); }
await browser.close();
