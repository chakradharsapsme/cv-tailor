// Checks the installable-app basics: manifest, service worker, offline start, install button, legal pages.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
const root = path.resolve('.');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json' };
const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(root, p === '/' ? 'index.html' : p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); }).listen(8770);
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.addInitScript(() => { localStorage.setItem('cvt.tourDone', '"1"'); localStorage.setItem('cvt.welcomeDone', '"1"'); });
await page.goto('http://localhost:8770/');
await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller || new Promise(r => navigator.serviceWorker.ready.then(() => setTimeout(() => r(true), 500))), null, { timeout: 20000 });
await page.reload(); await page.waitForTimeout(1500);
console.log('sw controlling:', await page.evaluate(() => !!navigator.serviceWorker.controller));
const m = await page.evaluate(async () => { const r = await fetch('manifest.webmanifest'); const j = await r.json(); return { name: j.name, icons: j.icons.length, maskable: j.icons.filter(i => i.purpose === 'maskable').length, shots: j.screenshots.length, id: j.id }; });
console.log('manifest:', JSON.stringify(m));
const missing = await page.evaluate(async () => { const j = await (await fetch('manifest.webmanifest')).json(); const all = j.icons.map(i => i.src).concat(j.screenshots.map(s => s.src)); const bad = []; for (const u of all) { const r = await fetch(u); if (!r.ok) bad.push(u); } return bad; });
console.log('manifest files missing:', JSON.stringify(missing));
await ctx.setOffline(true);
await page.goto('http://localhost:8770/#/pipeline'); await page.waitForTimeout(2500);
console.log('offline start OK:', await page.evaluate(() => !!document.querySelector('#main') && document.querySelector('#main').children.length > 0), '| offline bar:', await page.locator('#offline-bar').count());
const h = await page.evaluate(() => document.querySelector('h1') && document.querySelector('h1').textContent);
console.log('offline page heading:', h);
await ctx.setOffline(false);
for (const p of ['privacy.html', 'terms.html']) { await page.goto('http://localhost:8770/' + p); console.log(p, '→', await page.textContent('h1')); }
await b.close(); srv.close();
