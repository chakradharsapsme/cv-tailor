// With Chrome's on-device AI chosen, big steps (fit analysis) offer a bigger free engine instead of stalling.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
const root = path.resolve('.'), NM = root + '/node_modules';
const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(root, p === '/' ? 'index.html' : p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); }).listen(8775);
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } }); const page = await ctx.newPage();
await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ path: NM + '/jszip/dist/jszip.min.js', contentType: 'text/javascript' }));
await page.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: NM + '/docx-preview/dist/docx-preview.min.js', contentType: 'text/javascript' }));
await page.addInitScript(() => {
  localStorage.setItem('cvt.tourDone', '"1"'); localStorage.setItem('cvt.welcomeDone', '"1"'); localStorage.setItem('cvt.provider', '"chrome-ai"');
  // A pretend on-device model that never answers (like the real one stalling on a long prompt).
  window.LanguageModel = { availability: async () => 'available', create: async () => ({ prompt: () => new Promise(() => {}), destroy() {} }) };
});
await page.goto('http://localhost:8775/#/profile'); await page.waitForSelector('#m-demo');
await page.click('#m-demo'); await page.waitForTimeout(800);
await page.goto('http://localhost:8775/#/new'); await page.waitForTimeout(800);
await page.click('#example'); await page.waitForTimeout(500);
await page.click('#run');
await page.waitForSelector('.engine-modal', { timeout: 5000 });
console.log('dialog:', (await page.textContent('.engine-modal h2')).trim(), '| options:', JSON.stringify(await page.$$eval('.engine-modal .eng-opt strong', e => e.map(x => x.textContent))));
await page.click('.engine-modal [data-e="close"]'); await page.waitForTimeout(400);
console.log('progress started:', await page.locator('#prog li').count(), '| message:', (await page.textContent('#err')).replace(/\s+/g, ' ').slice(0, 120));
await b.close(); srv.close();
