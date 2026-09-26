// Captura de la aplicación: node tests/shot2.mjs <url> <out.png> [espera] [w] [h] [script-js-opcional]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const [url, out, wait = '8000', w = '1600', h = '900', js = ''] = process.argv.slice(2);
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => { if (m.type() !== 'debug') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url);
await page.waitForTimeout(+wait);
if (js) { try { const r = await page.evaluate(js); if (r !== undefined) logs.push('[eval] ' + JSON.stringify(r)); } catch (e) { logs.push('[evalerr] ' + e.message); } await page.waitForTimeout(+(process.env.POSTWAIT ?? 3000)); }
// detener el bucle de render antes de capturar (SwiftShader es lento)
try { await page.evaluate(() => { const a = window.app; if (a) a.maxFrames = a.frameCount + 1; }); } catch {}
await page.waitForTimeout(4000);
await page.screenshot({ path: out, timeout: 120000 });
console.log(logs.slice(0, 60).join('\n'));
await browser.close();
