// End-to-end test: serves the site, mocks the Anthropic API, runs the full flow,
// and saves the tailored CV and cover letter for inspection.
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve('.');
const srv = http.createServer((q, s) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(f)) { s.writeHead(404); return s.end(); }
  const ext = path.extname(f); s.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.docx': 'application/octet-stream' }[ext] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(s);
}).listen(8765);
const out = process.argv[2] || 'tests/out'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined }); const ctx = await browser.newContext({ acceptDownloads: true });
const page = await ctx.newPage();
const NM = process.env.NODE_MODULES || 'node_modules';
await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ path: NM + '/jszip/dist/jszip.min.js', contentType: 'text/javascript' }));
await page.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: NM + '/docx-preview/dist/docx-preview.min.js', contentType: 'text/javascript' }));
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
let calls = 0;
await page.route('https://api.anthropic.com/**', async route => {
  const url = route.request().url();
  if (url.includes('/models')) return route.fulfill({ json: { data: [{ id: 'claude-sonnet-test', display_name: 'Sonnet (test)' }] } });
  calls++;
  const body = JSON.parse(route.request().postData());
  const user = body.messages[0].content;
  let reply;
  if (calls === 1) {
    const paras = JSON.parse(user.split('CV PARAGRAPHS')[1].split('\n').slice(1).join('\n').split('\n\nReturn this JSON')[0]);
    const find = s => paras.find(p => p.text.startsWith(s));
    const prof = find('SAP procurement consultant with 14'), client = find('Client:'), b1 = find('Configured Guided Buying'),
          b2 = find('Designed approval flows'), b3 = find('Ran fit-to-standard'), train = find('Prepared training'),
          name = find('ALEX'), contact = find('Leeds, UK'), skills = find('Buying & Invoicing, Guided');
    fs.writeFileSync(out + '/paras.json', JSON.stringify(paras, null, 1));
    reply = {
      job: { title: 'SAP Ariba Solution Architect', company: 'Northgate Energy', location: 'Manchester', contract_type: 'permanent', summary: 'x' },
      requirements: [{ req: 'S2P solution architecture', type: 'must', evidence: 'adjacent', cv_ids: [prof.id], note: 'Design lead on Ariba rollout' },
                     { req: 'CIG integration', type: 'must', evidence: 'direct', cv_ids: [b2.id], note: 'Approval flows via CIG' },
                     { req: 'Utilities sector', type: 'nice', evidence: 'direct', cv_ids: [client.id] },
                     { req: '3 full-cycle Ariba implementations', type: 'must', evidence: 'gap', note: 'One named rollout' }],
      fit: { score: 78, core: 84, adjacent: 66, verdict: 'Strong P2P and Guided Buying fit; architecture title is a stretch.' },
      keywords: { covered: ['Guided Buying', 'CIG', 'SAP Business Network'], missing: ['SLP'] },
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
  } else {
    reply = { salutation: 'Dear Hiring Manager,', paragraphs: ['I am applying for the SAP Ariba Solution Architect role at Northgate Energy.', 'At a UK water utility I designed Guided Buying for 4,000 users.', 'I would welcome a conversation.'], signoff: 'Kind regards,', name: 'Alex Morgan' };
  }
  return route.fulfill({ json: { content: [{ type: 'text', text: '```json\n' + JSON.stringify(reply) + '\n```' }], stop_reason: 'end_turn' } });
});
await page.goto('http://localhost:8765/');
await page.click('#tab-settings'); await page.fill('#api-key', 'sk-ant-test'); await page.click('#save-key');
await page.waitForFunction(() => document.querySelector('#key-status').textContent.startsWith('Connected'));
await page.click('#tab-tailor');
await page.setInputFiles('#cv-file', 'samples/demo-cv.docx');
await page.waitForSelector('#cv-summary:not([hidden])');
console.log('stats', await page.textContent('#cv-paras'), await page.textContent('#cv-editable'), await page.textContent('#cv-locked'));
await page.click('#example-jd');
await page.click('#run');
await page.waitForSelector('#step-review:not([hidden])', { timeout: 15000 });
console.log('edit cards', await page.locator('.edit').count(), '| flags:', (await page.locator('.edit .chip').allTextContents()).join(' / '));
await page.screenshot({ path: out + '/review.png', fullPage: true });
await page.click('#build');
await page.waitForFunction(() => document.querySelector('#letter').value.length > 50, null, { timeout: 15000 });
console.log('result note:', await page.textContent('#cv-result-note'));
let dl = page.waitForEvent('download'); await page.click('#dl-cv'); let d = await dl; await d.saveAs(out + '/tailored.docx'); console.log('cv file:', d.suggestedFilename());
dl = page.waitForEvent('download'); await page.click('#dl-letter'); d = await dl; await d.saveAs(out + '/letter.docx'); console.log('letter file:', d.suggestedFilename());
await page.click('#compare-btn'); await page.waitForTimeout(1500);
console.log('pages note:', await page.textContent('#pages-note'));
await page.screenshot({ path: out + '/outputs.png', fullPage: true });
await page.click('#save-app'); await page.click('#tab-apps');
console.log('apps rows', await page.locator('#apps-table tbody tr').count());
await page.screenshot({ path: out + '/apps.png' });
await page.setViewportSize({ width: 400, height: 900 }); await page.click('#tab-tailor');
await page.screenshot({ path: out + '/mobile.png', fullPage: false });
const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.table-wrap,.preview-box')).slice(0, 6).map(e => e.tagName + '.' + e.className + '#' + e.id + ' ' + Math.round(e.getBoundingClientRect().right)));
console.log('mobile horizontal overflow:', overflow);
console.log('errors:', errors);
await browser.close(); srv.close();
