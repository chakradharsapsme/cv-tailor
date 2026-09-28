// End-to-end test for CV Tailor v2: serves the site, mocks the Anthropic API,
// walks every view, checks the Word output and the autofill bookmarklet.
// Run: npm i playwright jszip@3.10.1 docx-preview@0.3.5 && mkdir -p samples && python3 tests/make_demo_cv.py && node tests/e2e.mjs
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const root = path.resolve('.');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.docx': 'application/octet-stream' };
const srv = http.createServer((q, s) => {
  const p = decodeURIComponent(q.url.split('?')[0]);
  const f = path.join(root, p === '/' ? 'index.html' : p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(s);
}).listen(8765);

const out = process.argv[2] || 'tests/out'; fs.mkdirSync(out, { recursive: true });
const NM = process.env.NODE_MODULES || 'node_modules';
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1360, height: 900 } });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8765' });
const page = await ctx.newPage();
await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ path: NM + '/jszip/dist/jszip.min.js', contentType: 'text/javascript' }));
await page.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: NM + '/docx-preview/dist/docx-preview.min.js', contentType: 'text/javascript' }));
await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));

const PROVIDER = process.env.PROVIDER || 'anthropic';
const calls = {};
function makeReply(sys, user) {
  let reply;
  if (/assess a job/.test(sys)) {
    calls.analyse = user;
    const paras = JSON.parse(user.split('CV PARAGRAPHS')[1].split('\n').slice(1).join('\n').split('\n\nReturn this JSON')[0]);
    const find = s => paras.find(p => p.text.startsWith(s));
    const prof = find('SAP procurement consultant with 14'), client = find('Client:'), b1 = find('Configured Guided Buying'),
      b2 = find('Designed approval flows'), b3 = find('Ran fit-to-standard'), train = find('Prepared training'), name = find('ALEX'), contact = find('Leeds, UK');
    reply = {
      job: { title: 'SAP Ariba Solution Architect', company: 'Northgate Energy', location: 'Manchester', work_mode: 'hybrid', contract_type: 'permanent', pay: '£95,000–£110,000', ir35: 'n/a', closing_date: '2026-10-20', seniority: 'Senior', summary: 'Own S2P design on an Ariba + S/4HANA programme.' },
      decision: { verdict: 'apply_with_angle', headline: 'Strong P2P and Guided Buying match; lead with design ownership.', reasons: ['Direct Guided Buying and CIG experience', 'Utilities client'], red_flags: ['Asks for 3 full-cycle implementations; CV shows one named rollout'], angle: 'Position the utility rollout as end-to-end design authority.' },
      requirements: [{ req: 'S2P solution architecture', type: 'must', evidence: 'adjacent', cv_ids: [prof.id], note: 'Design lead on Ariba rollout' },
        { req: 'CIG integration', type: 'must', evidence: 'direct', cv_ids: [b2.id], note: 'Approval flows via CIG' },
        { req: '3 full-cycle Ariba implementations', type: 'must', evidence: 'gap', note: 'One named rollout' },
        { req: 'Utilities sector', type: 'nice', evidence: 'direct', cv_ids: [client.id] }],
      fit: { score: 78, core: 84, adjacent: 66 },
      keywords: ['Guided Buying', 'CIG', 'SAP Business Network', 'Source-to-Pay', 'S/4HANA', 'SLP'],
      keywords_missing: ['SLP'],
      edits: [
        { id: prof.id, text: 'SAP procurement consultant with 14 years delivering Source-to-Pay (S2P) and Procure-to-Pay (P2P) solutions. Designs SAP Ariba Buying & Invoicing and Guided Buying integrated with S/4HANA, and leads fit-to-standard workshops with procurement and finance.', reason: 'Lead with S2P design' },
        { id: client.id, segments: ['Client: ', 'UK water utility, SAP Ariba Buying & Invoicing and Guided Buying for 4,000 users'], reason: 'utilities + Guided Buying' },
        { id: b2.id, text: 'Designed SAP Ariba approval flows and S/4HANA integration through Cloud Integration Gateway (CIG) with SLP scoring.', reason: 'CIG keyword (SLP deliberately fabricated to test flags)' },
        { id: 99999, text: 'bogus' }
      ],
      reorder: [{ ids: [b2.id, b1.id, b3.id], reason: 'integration first' }],
      remove: [{ id: train.id, reason: 'low relevance' }, { id: name.id, reason: 'should be refused' }],
      letterhead_ids: [name.id, contact.id], candidate_name: 'Alex Morgan',
      talking_points: ['Explain design authority on the utility rollout.']
    };
  } else if (/cover letters/.test(sys)) {
    calls.letter = user;
    reply = { salutation: 'Dear Hiring Manager,', paragraphs: ['I am applying for the SAP Ariba Solution Architect role at Northgate Energy.', 'At a UK water utility I designed Guided Buying for 4,000 users.', 'I would welcome a conversation.'], signoff: 'Kind regards,', name: 'Alex Morgan' };
  } else if (/outreach/.test(sys)) {
    calls.outreach = user;
    const m = (s, b) => ({ subject: s, body: b });
    reply = { linkedin_note: 'Hi Sarah, I led Guided Buying for a UK utility on Ariba + S/4HANA and have applied for your S2P Architect role. Would value connecting.', hiring_manager: m('S2P Architect', 'Hello...'), recruiter: m('SAP Ariba Architect – Alex Morgan', 'Hi...'), follow_up: m('Following up', 'Hi...'), thank_you: m('Thank you', 'Thanks for [topic]...') };
  } else if (/interview coach/.test(sys)) {
    calls.interview = user;
    reply = { pitch: 'I am an SAP procurement consultant...', questions: [{ q: 'Walk me through a CIG integration you designed.', type: 'technical', why: 'Integration depth', answer: 'S: utility... T: ... A: ... R: ...' }, { q: 'Tell me about a difficult stakeholder.', type: 'behavioural', why: 'Stakeholder management', answer: 'STAR...' }], topics: ['CIG vs Integration Suite', 'Guided Buying policies'], gaps: [{ gap: '3 full-cycle implementations', how: 'Be clear it was one end-to-end plus phases elsewhere.' }], ask_them: ['What does success look like at 6 months?'], plan_90: { first_30: ['Meet stakeholders'], days_31_60: ['Design authority'], days_61_90: ['Roadmap'] } };
  } else if (/application forms/.test(sys)) {
    calls.answers = user;
    reply = { why: 'Northgate is moving to Ariba with S/4HANA and wants one design authority. I have done this for a UK water utility.', salary: 'Looking for £100,000 base, open to discuss.', notice: '1 month', qa: [{ q: 'How many full-cycle SAP Ariba implementations have you led?', a: 'One full-cycle rollout as lead consultant, plus later phases.' }] };
  } else if (/LinkedIn profiles/.test(sys)) {
    reply = { headlines: ['SAP Ariba Solution Architect | S2P | Guided Buying | S/4HANA'], about: 'About text', skills: ['SAP Ariba'], open_to_work: ['SAP Ariba Architect'], tips: ['Add a banner'] };
  } else throw new Error('Unknown call: ' + sys.slice(0, 80));
  return reply;
}
await page.route('https://api.anthropic.com/**', async route => {
  const url = route.request().url();
  if (url.includes('/models')) return route.fulfill({ json: { data: [{ id: 'claude-sonnet-test', display_name: 'Sonnet (test)' }] } });
  const body = JSON.parse(route.request().postData());
  const reply = makeReply(body.system, body.messages[0].content);
  return route.fulfill({ json: { content: [{ type: 'text', text: '```json\n' + JSON.stringify(reply) + '\n```' }], stop_reason: 'end_turn' } });
});
await page.route('https://generativelanguage.googleapis.com/**', async route => {
  const url = route.request().url();
  if (url.includes('/models?')) return route.fulfill({ json: { models: [{ name: 'models/gemini-test-flash', displayName: 'Gemini Flash (test)', supportedGenerationMethods: ['generateContent'] }] } });
  calls.gemini = (calls.gemini || 0) + 1;
  const body = JSON.parse(route.request().postData());
  const reply = makeReply(body.systemInstruction.parts[0].text, body.contents[0].parts[0].text);
  return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] }, finishReason: 'STOP' }] } });
});
if (PROVIDER === 'claude') {
  // Simulate claude.ai's artifact runtime: sample() answers from the same mock; downloads fall back to a link.
  await page.exposeFunction('__mockSample', input => { calls.sample = (calls.sample || 0) + 1; return makeReply(input, input); });
  await page.addInitScript(() => {
    window.claude = { use: async name => {
      if (name === 'sample') { const f = async () => { throw new Error('text mode unused'); }; f.json = input => window.__mockSample(input); return f; }
      if (name === 'downloads') return { save: async ({ filename, data }) => { const u = URL.createObjectURL(data); const a = document.createElement('a'); a.href = u; a.download = filename; document.body.append(a); a.click(); a.remove(); return 'saved'; } };
      return null;
    } };
  });
}

const log = (...a) => console.log(...a);
const shot = n => page.screenshot({ path: `${out}/${n}.png`, fullPage: true });

// 1. Empty dashboard
await page.goto('http://localhost:8765/');
await page.waitForSelector('.kpis');
await shot('01-dashboard-empty');
log('coach notes (empty):', await page.locator('.note').count());

// 2. Settings
await page.click('a[data-nav="settings"]');
if (PROVIDER === 'claude') {
  log('claude-plan radio checked:', await page.isChecked('input[value="claude-plan"]'));
} else {
  await page.check(`input[value="${PROVIDER}"]`);
  await page.waitForSelector('#api-key');
  await page.fill('#api-key', PROVIDER === 'gemini' ? 'AIza-test' : 'sk-ant-test'); await page.click('#save-key');
  await page.waitForFunction(() => document.querySelector('#key-status').textContent.startsWith('Connected'));
}
log('engine pill:', await page.textContent('#key-pill'));
await shot('01b-settings');
const bm = await page.getAttribute('#bm', 'href');
log('bookmarklet length:', bm.length, bm.startsWith('javascript:'));

// 3. Profile
await page.click('a[data-nav="profile"]');
await page.setInputFiles('#m-file', 'samples/demo-cv.docx');
await page.waitForSelector('.master');
await page.fill('[data-p="name"]', 'Alex Morgan');
await page.fill('[data-p="email"]', 'alex.morgan@example.com');
await page.fill('[data-p="phone"]', '+44 7700 900123');
await page.fill('[data-p="linkedin"]', 'https://www.linkedin.com/in/alex-morgan-demo');
await page.fill('[data-p="city"]', 'Leeds');
await page.fill('[data-p="notice"]', '1 month');
await page.fill('[data-p="salary"]', '£100,000');
await page.fill('[data-p="eligibility"]', 'Yes');
await page.fill('[data-p="targetRoles"]', 'SAP Ariba Solution Architect\nS2P Programme Lead');
await page.click('#ach-add');
await page.fill('[data-ach="0"]', 'Led Guided Buying rollout to 4,000 users at a UK water utility.');
await page.waitForTimeout(700);
await shot('02-profile');

// 4. New application + analysis
await page.click('.new-btn');
await page.waitForSelector('#example');
await page.click('#example');
await page.waitForSelector('#run');
await page.click('#run');
await page.waitForSelector('.decision', { timeout: 15000 });
log('analyse prompt includes achievements:', calls.analyse.includes('4,000 users at a UK water utility'));
log('fit tab verdict:', await page.textContent('.decision-verdict'), '| coverage:', (await page.textContent('.cov')).trim());
await shot('03-fit');

// 5. CV tab
await page.click('.ws-tabs a:has-text("CV")');
await page.waitForSelector('.ats');
log('edit cards:', await page.locator('.edit').count(), '| flags:', (await page.locator('.edit .flags .chip').allTextContents()).join(' / '));
log('ATS checks:', (await page.locator('.ats li strong').allTextContents()).join(' | '));
let dl = page.waitForEvent('download'); await page.click('#dl-cv'); let d = await dl; await d.saveAs(`${out}/tailored.docx`); log('cv file:', d.suggestedFilename());
await page.click('#compare-btn'); await page.waitForTimeout(1200);
log('pages note:', await page.textContent('#pages-note'));
await shot('04-cv');

// 6. Letter
await page.click('.ws-tabs a:has-text("Cover letter")');
await page.click('#gen'); await page.waitForSelector('#letter', { timeout: 15000 });
dl = page.waitForEvent('download'); await page.click('#dl'); d = await dl; await d.saveAs(`${out}/letter.docx`); log('letter file:', d.suggestedFilename());
await shot('05-letter');

// 7. Outreach
await page.click('.ws-tabs a:has-text("Outreach")');
await page.click('#gen'); await page.waitForSelector('.msg-grid', { timeout: 15000 });
log('outreach blocks:', await page.locator('.msg').count(), '| note count chip:', await page.textContent('[data-count="linkedin_note"]'));
await shot('06-outreach');

// 8. Interview
await page.click('.ws-tabs a:has-text("Interview")');
await page.click('#gen'); await page.waitForSelector('.qs', { timeout: 15000 });
log('interview questions:', await page.locator('.qs details').count());
await shot('07-interview');

// 9. Apply
await page.click('.ws-tabs a:has-text("Apply")');
await page.fill('#paste-q', 'How many full-cycle SAP Ariba implementations have you led?');
await page.click('#draft'); await page.waitForSelector('.qa-item', { timeout: 15000 });
await page.waitForFunction(() => document.querySelector('[data-a="why"]').value.length > 10);
log('checklist ok:', await page.locator('.checklist li.ok').count(), '/', await page.locator('.checklist li').count());
await page.click('#pack');
const pack = await page.evaluate(() => navigator.clipboard.readText());
log('pack kind:', JSON.parse(pack).kind, '| qa:', JSON.parse(pack).qa.length);
await shot('08-apply');
await page.click('#applied');
await page.waitForSelector('text=Applied on');
log('status after apply:', await page.inputValue('#ws-status'), '| next:', await page.inputValue('#nx-text'), await page.inputValue('#nx-due'));

// 10. Pipeline + dashboard
await page.click('a[data-nav="pipeline"]');
await page.waitForSelector('.card-app');
log('pipeline applied column:', await page.locator('.col[aria-label="Applied"] .card-app').count());
await shot('09-pipeline');
await page.click('a[data-nav="dashboard"]');
await page.waitForSelector('.kpis');
log('KPI applied this week:', (await page.locator('.kpi-num').first().textContent()).trim(), '| next actions:', await page.locator('.actions li').count());
await shot('10-dashboard');

// 11. Autofill bookmarklet on a test form (never submits)
const form = await ctx.newPage();
await form.goto('http://localhost:8765/tests/fixtures/form.html');
await form.evaluate(p => navigator.clipboard.writeText(p), pack);
await form.evaluate(code => { (0, eval)(decodeURIComponent(code.slice('javascript:'.length))); }, bm);
await form.waitForSelector('#cvt-autofill-panel');
await form.waitForTimeout(300);
const vals = await form.evaluate(() => Object.fromEntries(['fn', 'ln', 'em', 'ph', 'li', 'city', 'np', 'sal', 'rtw', 'why', 'q1', 'pre'].map(i => [i, document.getElementById(i).value])));
log('autofill values:', JSON.stringify(vals));
log('submitted?', await form.evaluate(() => !!window.submitted));
log('panel:', (await form.textContent('#cvt-autofill-panel')).replace(/\s+/g, ' ').slice(0, 220));
await form.screenshot({ path: `${out}/11-autofill.png`, fullPage: true });

// 12. Mobile layout
await page.setViewportSize({ width: 400, height: 860 });
const overflow = async () => page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.table-wrap,.preview-box,.board-wrap,.side,.ws-tabs')).slice(0, 6).map(e => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right)));
for (const h of ['#/dashboard', '#/pipeline', '#/profile', '#/settings']) { await page.goto('http://localhost:8765/' + h); await page.waitForTimeout(500); log('overflow', h, JSON.stringify(await overflow())); }
const appId = await page.evaluate(async () => (await window.CVT.store.listApps())[0].id);
for (const t of ['job', 'fit', 'cv', 'letter', 'outreach', 'interview', 'apply']) { await page.goto(`http://localhost:8765/#/app/${appId}/${t}`); await page.waitForTimeout(600); log('overflow', t, JSON.stringify(await overflow())); }
await page.goto(`http://localhost:8765/#/app/${appId}/fit`); await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/12-mobile-fit.png`, fullPage: false });
await page.goto('http://localhost:8765/#/dashboard'); await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/13-mobile-dashboard.png`, fullPage: false });

log('calls:', JSON.stringify({ gemini: calls.gemini || 0, sample: calls.sample || 0 }));
log('errors:', JSON.stringify(errors));
await browser.close(); srv.close();
