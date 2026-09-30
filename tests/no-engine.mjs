// With no AI engine: pressing "Analyse fit and tailor CV" offers the free engines instead of an error,
// and "Not now" still gives a quick skills check.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
const root = path.resolve('.'), NM = root + '/node_modules', OUT = process.argv[2] || '.';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(root, p === '/' ? 'index.html' : p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); }).listen(8772);
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ path: NM + '/jszip/dist/jszip.min.js', contentType: 'text/javascript' }));
await page.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: NM + '/docx-preview/dist/docx-preview.min.js', contentType: 'text/javascript' }));
await page.route('https://fonts.**', r => r.fulfill({ body: '', contentType: 'text/css' }));
await page.addInitScript(() => { localStorage.setItem('cvt.tourDone', '"1"'); localStorage.setItem('cvt.welcomeDone', '"1"'); });
await page.goto('http://localhost:8772/#/profile'); await page.waitForSelector('#m-demo');
await page.evaluate(async () => { const p = await window.CVT.store.getProfile(); p.targetRoles = ['SAP Ariba Solution Architect']; await window.CVT.store.saveProfile(p); });
await page.click('#m-demo'); await page.waitForTimeout(800);
await page.goto('http://localhost:8772/#/new'); await page.waitForTimeout(800);
await page.click('#example'); await page.waitForTimeout(600);
await page.click('#run');
await page.waitForSelector('.engine-modal', { timeout: 5000 });
console.log('dialog:', (await page.textContent('.engine-modal h2')).trim(), '| options:', await page.locator('.engine-modal .eng-opt').count());
await page.screenshot({ path: OUT + '/engine-dialog.png' });
await page.click('.engine-modal [data-e="close"]'); await page.waitForTimeout(500);
console.log('after Not now:', (await page.textContent('#err')).replace(/\s+/g, ' ').trim().slice(0, 260));
console.log('old API-key text gone:', !(await page.content()).includes('Add your API key'));
await page.screenshot({ path: OUT + '/engine-quickcheck.png' });
await b.close(); srv.close();
