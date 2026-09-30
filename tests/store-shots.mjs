// Builds the app-store screenshots (fictional data) into assets/store/.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
const root = '/home/claude/cv-tailor', OUT = root + '/assets/store', NM = root + '/node_modules';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(root, p === '/' ? 'index.html' : p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); }).listen(8769);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const d = n => new Date(Date.now() - n * 864e5).toISOString();
const JOBS = [
  ['Operations Manager', 'Northwind Logistics', 'Manchester, United Kingdom', 1, 'Lead day-to-day operations, KPIs, team leadership, process improvement, budget management, stakeholder management and Excel reporting.'],
  ['Customer Operations Team Leader', 'Brightside Energy', 'Leeds, United Kingdom', 2, 'Team leadership, coaching, service levels, complaints handling, Zendesk, KPIs, training new starters.'],
  ['Service Delivery Manager', 'Harbour Health', 'London, United Kingdom', 3, 'Stakeholder management, KPIs, process improvement, supplier management and reporting.'],
  ['Operations Team Lead', 'Fieldstone Retail', 'Birmingham, United Kingdom', 5, 'Rota planning, team leadership, customer service, stock control, health and safety.'],
  ['Contact Centre Manager', 'Clearwater Utilities', 'Edinburgh, United Kingdom', 6, 'Contact centre, performance management, workforce planning, KPIs and coaching.']
].map(([name, co, loc, age, txt], i) => ({ name, company: { name: co }, locations: [{ name: loc }], levels: [{ name: 'Mid Level' }], refs: { landing_page: 'https://example.com/job/' + i }, publication_date: d(age), contents: '<p>' + txt + '</p>' }));
async function run(w, h, dpr, shots) {
  const ctx = await b.newContext({ serviceWorkers: 'block', viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: w < 800, hasTouch: w < 800, timezoneId: 'Europe/London', locale: 'en-GB' });
  const page = await ctx.newPage();
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ path: NM + '/jszip/dist/jszip.min.js', contentType: 'text/javascript' }));
  await page.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: NM + '/docx-preview/dist/docx-preview.min.js', contentType: 'text/javascript' }));
  await page.route('https://fonts.**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('https://www.themuse.com/**', r => r.fulfill({ json: { page_count: 1, results: JOBS } }));
  await page.route(/greenhouse|lever\.co|ashbyhq|smartrecruiters|remotive|jobicy/, r => r.fulfill({ json: { jobs: [], content: [] } }));
  await page.goto('http://localhost:8769/');
  await page.waitForSelector('.welcome .wl-card');
  await page.click('.wl-chip[data-field="operations"]');
  await page.fill('#wl-roles', 'Operations Manager\nTeam Leader');
  await page.click('[data-w="next"]'); await page.click('[data-w="next"]');
  await page.click('[data-w="demo"]'); await page.waitForTimeout(300);
  await page.click('[data-w="next"]');
  await page.waitForSelector('#jb-refresh'); await page.waitForTimeout(3500);
  await page.evaluate(async () => { const p = await window.CVT.store.getProfile(); Object.assign(p, { name: 'Alex Morgan', currentTitle: 'Customer Operations Team Leader', weeklyGoal: 5 }); await window.CVT.store.saveProfile(p); });
  for (const [route, file] of shots) {
    await page.goto('http://localhost:8769/#/' + route); await page.waitForTimeout(1600);
    await page.evaluate(r => { document.querySelectorAll('#toasts, .upd-bar, .offline-bar').forEach(x => x.remove()); const j = r === 'jobs' && window.innerWidth < 800 && document.querySelector('.jobs-feed'); window.scrollTo(0, j ? j.getBoundingClientRect().top + scrollY - 70 : 0); }, route); await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${file}.png` });
  }
  await ctx.close();
}
await run(360, 640, 3, [['dashboard', 'phone-1-dashboard'], ['jobs', 'phone-2-jobs'], ['prep/drills', 'phone-3-prep']]);
await run(1280, 720, 1.5, [['dashboard', 'wide-1-dashboard']]);
await b.close(); srv.close();
