// End-to-end test for Applywise v2: serves the site, mocks the AI engines (Claude plan, Gemini),
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
await page.route('https://cdnjs.cloudflare.com/**', r => { const u = r.request().url(); const f = /pdf\.worker\.min\.js$/.test(u) ? NM + '/pdfjs-dist/build/pdf.worker.min.js' : /pdf\.min\.js$/.test(u) ? NM + '/pdfjs-dist/build/pdf.min.js' : NM + '/jszip/dist/jszip.min.js'; return r.fulfill({ path: f, contentType: 'text/javascript' }); });
await page.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: NM + '/docx-preview/dist/docx-preview.min.js', contentType: 'text/javascript' }));
await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
// Daily collector output (fictional).
const recentIso = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
await page.route('**/data/jobs.json*', r => r.fulfill({ json: { updated: new Date().toISOString(), sources: ['Reed', 'Adzuna'], errors: [], jobs: [
  { key: 'x1', title: 'SAP Ariba Buying Lead', company: 'Example Recruitment Ltd', location: 'Manchester', pay: '£550-£650 per day', url: 'https://example.com/reed/1', posted: recentIso(2), source: 'Reed', sources: ['Reed', 'Adzuna'], snippet: 'Lead SAP Ariba Guided Buying rollout with S/4HANA Central Procurement, CIG integration, SIT and UAT, supplier onboarding with SLP.', type: 'Contract', lastSeen: new Date().toISOString() },
  { key: 'x2', title: 'S/4HANA Procurement Lead', company: 'Demo Energy plc', location: 'Preston', pay: '£85,000-£95,000 per year', url: 'https://example.com/az/2', posted: recentIso(5), source: 'Adzuna', sources: ['Adzuna'], snippet: 'Central Procurement, MDG, SAP MM, cutover and data migration.', type: 'Permanent, Full-time', lastSeen: new Date().toISOString() }
] } }));
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (/auto-update/.test(m.text())) console.log('PAGE', m.text()); });

const PROVIDER = process.env.PROVIDER || 'claude';
const calls = {};
function makeReply(sys, user) {
  let reply;
  if (/Ireland phase adds 300 suppliers/.test(user) && !/Prove you read it/.test(user) && !/retrieval-augmented answering/.test(sys) && !/expects \(or was asked\)|wants to ASK/.test(user)) {
    calls.extra = (calls.extra || 0) + 1; calls.extraUser = (calls.extraUser || '') + user.slice(0, 200);
    const E1 = 'The Ireland phase adds 300 suppliers to SLP onboarding in 2028', E2 = 'The contract team uses Ariba Contracts for renewals';
    const X = (o, q) => Object.assign(o, { ref: 'D1-P1', quote: q });
    if (/Build a mind map of what these passages contain/.test(user)) return { center: 'Extra', branches: [X({ label: 'Ireland phase', detail: '300 suppliers in 2028.', children: [] }, E1), X({ label: 'Scope', detail: 'Contracts.', children: [X({ label: 'Contract renewals', detail: 'Ariba Contracts.' }, E2)] }, E2)] };
    if (/interviewer would ask BECAUSE/.test(user)) return { questions: [X({ q: 'How would you onboard 300 Irish suppliers through SLP by 2028?', type: 'case', why: 'Scale', answer_outline: ['Wave plan'], story_hint: '' }, E1)], themes: ['Ireland rollout'] };
    if (/BRIEFING DOC/.test(user)) return { title: 'x', summary: 'x', sections: [{ heading: 'Programme', points: [X({ text: 'Ireland adds 300 suppliers in 2028' }, E1)] }] };
    if (/STUDY GUIDE/.test(user)) return { concepts: [X({ term: 'Ariba Contracts', explain: 'Used for renewals.' }, E2)], questions: [] };
    if (/an FAQ/.test(user)) return { items: [X({ q: 'How many Irish suppliers?', a: '300.' }, E1)] };
    if (/TIMELINE/.test(user)) return { events: [X({ when: '2028', what: 'Ireland supplier onboarding' }, E1)], cast: [X({ name: 'Contract team', role: 'Runs renewals' }, E2)] };
    if (/FLASHCARDS/.test(user)) return { cards: [X({ front: 'Irish suppliers?', back: '300 in 2028' }, E1)] };
    if (/multiple-choice QUIZ/.test(user)) return { questions: [X({ q: 'When does Ireland onboard?', options: ['2026', '2027', '2028', '2029'], answer: 2, explain: '2028.' }, E1)] };
    if (/AUDIO OVERVIEW/.test(user)) return { title: 'x', lines: [X({ host: 'B', text: 'And Ireland brings 300 more suppliers.' }, E1)] };
  }
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
        { id: prof.id, text: 'SAP procurement consultant with 14 years of experience delivering Source-to-Pay (S2P) purchasing and invoicing solutions for manufacturing and public-sector clients. Strong in SAP MM configuration and SAP Ariba Buying & Invoicing and Guided Buying, with a record of leading workshops and working closely with finance teams.', adds: 'Source-to-Pay (S2P); and Guided Buying', requirement: 'S2P solution design', basis: 'cv', reason: 'Names S2P in the summary' },
        { id: client.id, segments: ['Client: ', 'UK water utility, Ariba Buying & Invoicing and Guided Buying rollout to 4,000 users'], adds: 'and Guided Buying', requirement: 'Utilities sector', basis: 'cv', reason: 'utilities + Guided Buying' },
        { id: b2.id, text: 'Designed approval flows in SAP Ariba integrated with S/4HANA via Cloud Integration Gateway (CIG), including SLP supplier onboarding.', adds: '(CIG), including SLP supplier onboarding', requirement: 'SLP', basis: 'unconfirmed', reason: 'SLP is a must-have' },
        { id: b3.id, text: 'Led fit-to-standard workshops with procurement and AP teams.', requirement: 'Workshops', basis: 'cv', reason: 'deliberate rewrite to test detection' },
        { id: 99999, text: 'bogus' }
      ],
      reorder: [],
      remove: [],
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
  } else if (/Build a mind map of what these passages contain/.test(user)) {
    calls.map = user;
    const n = (label, quote, children) => ({ label, detail: label + '.', ref: 'D1-P1', quote, children: children || [] });
    reply = { center: 'Northgate procurement programme', center_ref: 'D1-P1', branches: [
      n('Programme', 'replace legacy procurement with SAP Ariba and S/4HANA 2023', [n('Phased go-live', 'phased, UK first in Q3 2027, then Ireland')]),
      n('Scope', 'Guided Buying, Buying and Invoicing, Contracts, SLP supplier onboarding', [n('Case study task', 'design an approval flow for IT hardware over 5,000 GBP')]),
      n('Pain points', 'maverick spend 22 percent, invoice exceptions, slow supplier onboarding'),
      n('Commercials', 'Day rate up to 650 outside IR35', [n('Invented topic', 'Coupa migration planned for 2028 across all of Europe')]),
      n('Made-up branch', 'the client plans to outsource all AP to a shared service centre')
    ] };
  } else if (/Prove you read it/.test(user)) {
    calls.digest = (calls.digest || 0) + 1;
    const name = (user.match(/=== DOCUMENT: ([^(]+) \(/) || [])[1] || 'file';
    const bodyWords = ((user.split(/=== DOCUMENT:[^\n]*\n/)[1] || '').replace('CANDIDATE NOTES / TRANSCRIPT: ', '').split(/\s+/).filter(Boolean));
    reply = { summary: `Summary of ${name.trim()}.`, facts: ['Maverick spend 22 percent', 'UK go-live Q3 2027'], relevance: 'high: same programme', questions: [{ q: `What stood out to you in ${name.trim()}?`, type: 'case', quote: bodyWords.slice(0, 7).join(' '), why: 'Checks preparation', answer_outline: ['Point 1', 'Point 2'] }, { q: 'Invented question with no quote', type: 'ba', quote: 'nothing like this appears in any uploaded file at all', why: 'x', answer_outline: [] }] };
  } else if (/interviewer would ask BECAUSE of what these passages say/.test(user)) {
    calls.docQ = user;
    reply = { questions: [{ q: 'How would you phase SLP supplier onboarding before the UK go-live?', type: 'case', ref: 'D1-P1', quote: 'phased, UK first in Q3 2027, then Ireland', why: 'Tests planning against the role pack timeline', answer_outline: ['Segment suppliers by spend', 'Registration questionnaires first', 'Use the utility rollout lessons'], story_hint: '' }, { q: 'Walk us through an approval flow for IT hardware over £5,000.', type: 'functional', ref: 'D1-P1', quote: 'design an approval flow for IT hardware over 5,000 GBP', why: 'Case study task', answer_outline: ['Guided Buying policy', 'Approval chain', 'Budget check'], story_hint: '' }, { q: 'Tell me about yourself (from the advert).', type: 'motivation', ref: 'D1-P1', quote: 'seeking a passionate architect to join our dynamic team', why: 'Generic', answer_outline: [] }], themes: ['Supplier onboarding', 'Maverick spend'] };
  } else if (/expects \(or was asked\) this interview question|wants to ASK the interviewer/.test(user)) {
    calls.myAns = user;
    reply = { outline: ['Explain the supplier value first', 'Offer light enablement', 'Escalate via procurement policy'], answer: 'At the utility I phased onboarding by spend tier and ran supplier webinars.', listen_for: ['Blaming the supplier'], follow_ups: ['What if a key supplier still refuses?'], sources: [] };
  } else if (/research assistant like NotebookLM/.test(sys)) {
    calls.studio = (calls.studio || 0) + 1; calls.studioUser = user;
    const R = (o, q) => Object.assign(o, { ref: 'D1-P1', quote: q });
    const Q1 = 'replace legacy procurement with SAP Ariba and S/4HANA 2023', Q2 = 'phased, UK first in Q3 2027, then Ireland', Q3 = 'maverick spend 22 percent, invoice exceptions, slow supplier onboarding', FAKE = 'the client will migrate everything to Oracle Cloud next spring';
    if (/BRIEFING DOC/.test(user)) reply = { title: 'Northgate procurement programme', summary: 'Ariba and S/4HANA replace legacy procurement.', sections: [{ heading: 'Programme', points: [R({ text: 'Replacing legacy procurement with Ariba + S/4HANA 2023' }, Q1), R({ text: 'Phased go-live, UK first' }, Q2)] }, { heading: 'Pain points', points: [R({ text: 'Maverick spend at 22%' }, Q3), R({ text: 'Oracle migration' }, FAKE)] }] };
    else if (/STUDY GUIDE/.test(user)) reply = { concepts: [R({ term: 'Maverick spend', explain: '22% of spend is off-contract.' }, Q3)], questions: [R({ q: 'When does the UK go live?', answer: 'Q3 2027, then Ireland.' }, Q2)] };
    else if (/an FAQ/.test(user)) reply = { items: [R({ q: 'What is being replaced?', a: 'Legacy procurement.' }, Q1), R({ q: 'Fake?', a: 'x' }, FAKE)] };
    else if (/TIMELINE/.test(user)) reply = { events: [R({ when: 'Q3 2027', what: 'UK go-live' }, Q2)], cast: [R({ name: 'Northgate Energy', role: 'The client' }, Q1)] };
    else if (/FLASHCARDS/.test(user)) reply = { cards: [R({ front: 'Maverick spend?', back: '22 percent' }, Q3), R({ front: 'UK go-live?', back: 'Q3 2027' }, Q2), R({ front: 'Fake', back: 'x' }, FAKE)] };
    else if (/multiple-choice QUIZ/.test(user)) reply = { questions: [R({ q: 'Which country goes live first?', options: ['Ireland', 'UK', 'France', 'Spain'], answer: 1, explain: 'UK first.' }, Q2), R({ q: 'Maverick spend?', options: ['5%', '10%', '22%', '40%'], answer: 2, explain: '22 percent.' }, Q3)] };
    else if (/AUDIO OVERVIEW/.test(user)) reply = { title: 'Inside Northgate', lines: [R({ host: 'A', text: 'Northgate is replacing legacy procurement with Ariba.' }, Q1), { host: 'B', text: 'Why does that matter?', ref: '', quote: '' }, R({ host: 'A', text: 'Maverick spend is 22 percent.' }, Q3)] };
  } else if (/retrieval-augmented answering/.test(sys)) {
    calls.docAsk = user;
    reply = { answer: 'They are replacing legacy procurement with SAP Ariba and S/4HANA 2023 [D1-P1]. The team is 40 people in Leeds [D1-P1].', found: true, claims: [{ ref: 'D1-P1', quote: 'replace legacy procurement with SAP Ariba and S/4HANA 2023' }, { ref: 'D1-P1', quote: 'a team of 40 people based in Leeds' }], ask_them: 'Is the Integration Suite tenant already provisioned?' };
  } else if (/Ask the NEXT single question/.test(user)) {
    calls.mockQ = (calls.mockQ || 0) + 1;
    reply = { question: calls.mockQ === 1 ? 'Walk me through how you would design Guided Buying policies for IT hardware.' : 'Tell me about a time a go-live went wrong.', type: calls.mockQ === 1 ? 'functional' : 'behavioural', why: 'Design depth', look_for: ['thresholds', 'catalogue first', 'approvals'], story_hint: '' };
  } else if (/Assess like the interviewer/.test(user)) {
    reply = { score: 3, verdict: 'Solid structure, needs numbers.', strengths: ['Clear policy logic'], gaps: ['No result metrics'], better_answer: 'I would start with catalogue-first... [add: adoption figure]', follow_up: 'How did you measure adoption?' };
  } else if (/Draft up to 8 interview stories/.test(user)) {
    reply = { stories: [{ title: 'Guided Buying rollout for a UK utility', situation: 'Ariba Buying rollout to 4,000 users', task: 'Lead consultant', action: 'Configured policies, ran fit-to-standard workshops', result: 'Live on time', metrics: '4,000 users', tags: ['stakeholder management', 'cutover'], skills: ['SAP Ariba', 'Guided Buying'] }, { title: 'Vendor master migration', situation: 'Global manufacturer', task: 'Migrate vendor master and open POs', action: 'Cleansed and loaded data', result: 'Reconciled first time', metrics: '', tags: ['data migration'], skills: ['SAP MM', 'Data migration'] }] };
  } else if (/counter-offer/.test(user)) {
    reply = { email_subject: 'Offer – next steps', email: 'Thank you for the offer...', call_script: ['Thank them'], ask_for: ['Base £95k'], walk_away_note: 'Accept at £90k or more.' };
  } else if (/interview practice cards/.test(user)) {
    reply = { cards: [{ q: 'What is SAP Ariba Contracts?', a: 'Contract lifecycle management...' }, { q: 'What is a contract workspace?', a: 'A project container...' }] };
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
// Paid APIs must never be called: record and block any attempt.
await page.route('https://api.anthropic.com/**', route => { calls.paid = (calls.paid || 0) + 1; return route.abort(); });
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
  // Fictional Indeed answers in the connector's real markdown shape.
  const blk = (i, t, c, l, d, ty, pay) => `**Job Title:** ${t}\n            **Job Id:** JOBSEARCH_${i}\n            **Company:** ${c}\n            **Location:** ${l}\n            **Posted on:** ${d}\n            **Job Type:** ${ty}\n            **Compensation:** ${pay}\n            **View Job URL:** https://example.com/job/${i}\n            \n\n`;
  const recent = n => new Date(Date.now() - n * 864e5).toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
  const JOBS = [
    [1, 'SAP Ariba Solution Architect', 'Fictional Energy plc', 'Leeds', recent(1), 'Permanent', 'N/A'],
    [2, 'SAP P2P Lead Consultant', 'Example Resourcing Ltd', 'Manchester', recent(3), 'Contract', '£600 per day'],
    [3, 'Junior Procurement Assistant', 'Sample Foods', 'Preston', recent(2), 'Full-time', '£24,000 a year'],
    [4, 'S/4HANA Procurement Consultant', 'Demo Consulting', 'London', recent(40), 'Permanent', '£80,000-£90,000 a year']
  ];
  await page.exposeFunction('__mockMcp', (server, tool, input) => {
    calls.mcp = (calls.mcp || 0) + 1;
    if (tool === 'search_jobs') return { result: JOBS.filter((j, i) => input.location === 'remote' ? i === 0 : true).map(j => blk(...j)).join('') };
    if (tool === 'get_job_details') {
      const j = JOBS.find(x => 'JOBSEARCH_' + x[0] === input.job_id);
      return { result: `### ${j[1]}\n        **View Job URL:** https://example.com/d/${j[0]}\n        **Job Id:** JOBSEARCH_${j[0]}\n        **Company:** ${j[2]}\n        **Location:** ${j[3]}\n        **Posted on:** ${j[4]}\n        **Job Type:** ${j[5]}\n        **Compensation:** None\n\n        *Key Responsibilities:*\n\n* Own the SAP Ariba Buying and Guided Buying design.\n* Lead S/4HANA Central Procurement integration via CIG and SAP Integration Suite.\n* Run fit-to-standard workshops, SIT, UAT and cutover.\n* Supplier onboarding with SLP.\n\n*Required:* 10+ years SAP MM / P2P, Coupa or Jaggaer a plus, SC clearance.\n\nPay: £85,000.00-£95,000.00 per year\n` };
    }
    if (tool === 'get_company_data') return { employerData: { dossier: { employerDetails: { briefDescription: 'A fictional employer.', employeesLocalizedLabel: '1,001 to 5,000', sectors: { results: [{ localizedLabel: 'Energy' }] } } }, ugcStats: { interview: { difficulty: 'MEDIUM', experience: 'POSITIVE', processLength: 'TWO_WEEKS' }, recommendFriend: { yesCount: 70, noCount: 30 } }, companyPageUrl: 'https://example.com/cmp', salaries: { forJobTitle: input.jobTitle, averageSalary: 72000, count: 12, salaryType: 'YEARLY' } } };
    throw new Error('unknown tool');
  });
  const ASSETS = new Map();
  await page.exposeFunction('__assetPut', (id, text) => { ASSETS.set(id, text); });
  await page.route('**/_blob/**', r => { const id = r.request().url().split('/_blob/')[1]; return ASSETS.has(id) ? r.fulfill({ body: ASSETS.get(id), contentType: 'text/plain' }) : r.fulfill({ status: 404, body: '' }); });
  await page.addInitScript(() => {
    window.claude = { use: async name => {
      if (name === 'sample') { const f = async () => { throw new Error('text mode unused'); }; f.json = input => window.__mockSample(input); return f; }
      if (name === 'user') return { id: async () => 'u1', isOwner: async () => true, canEdit: async () => true, can: async () => true };
      if (name === 'db') {
        const M = window.__db || (window.__db = new Map());
        const robot = { updated: new Date().toISOString(), sources: ['Indeed', 'LinkedIn', 'Totaljobs'], errors: [], jobs: [
          { title: 'SAP S2P Solution Architect', company: 'Example Utilities plc', location: 'Manchester (hybrid)', pay: '£650 per day', url: 'https://example.com/li/1', posted: new Date(Date.now() - 864e5).toISOString().slice(0, 10), source: 'LinkedIn', sources: ['LinkedIn'], snippet: 'Lead SAP Ariba and S/4HANA Source-to-Pay design, Guided Buying, SLP, CIG integration and cutover.', type: 'Contract' }] };
        if (!M.has('robot/latest')) M.set('robot/latest', robot);
        const snap = (path, v) => ({ id: path.split('/').pop(), exists: v !== undefined, data: () => v });
        if (!window.__seeded) { window.__seeded = 1; M.set('sync/kv_mocks', { v: [{ id: 'legacy-mock', started: '2026-01-01T09:00:00.000Z', appId: '', kind: 'mixed', title: 'General interview', turns: [] }], updated: '2026-01-02T00:00:00.000Z' }); }
        const doc = path => ({ get: async () => snap(path, M.get(path)), set: async v => { M.set(path, JSON.parse(JSON.stringify(v))); }, delete: async () => { M.delete(path); }, collection: c => col(path + '/' + c) });
        const col = c => { const q = { doc: id => doc(c + '/' + id), limit: () => q, get: async () => { const docs = [...M.entries()].filter(([k]) => k.startsWith(c + '/') && k.split('/').length === c.split('/').length + 1).map(([k, v]) => snap(k, v)); return { docs, size: docs.length, empty: !docs.length }; } }; return q; };
        return { doc, collection: col };
      }
      if (name === 'assets') return { upload: async blob => { const id = 'a' + Math.random().toString(36).slice(2, 10); await window.__assetPut(id, await blob.text()); return { id, url: '/_blob/' + id, sizeBytes: blob.size, contentType: 'text/plain' }; }, delete: async id => { window.__assetDeleted = (window.__assetDeleted || 0) + 1; } };
      if (name === 'mcp') return { callTool: async (server, tool, input) => ({ content: [], payload: await window.__mockMcp(server, tool, input) }) };
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
{ // first-run tour
  await page.waitForSelector('.tour-card', { timeout: 5000 });
  const steps = [];
  for (let k = 0; k < 10; k++) {
    const c = await page.locator('.tour-card').count(); if (!c) break;
    steps.push((await page.textContent('.tour-card h2')).trim() + (await page.locator('.tour-hole').count() ? '' : ' (no target)'));
    if (k === 0 || k === 2) await shot('00-tour-' + (k + 1));
    await page.click('.tour-card [data-t="next"]'); await page.waitForTimeout(200);
  }
  log('tour:', steps.join(' → '), '| saved done:', await page.evaluate(() => localStorage.getItem('cvt.tourDone')));
}
await shot('01-dashboard-empty');
await page.waitForTimeout(2500);
log('private sync:', JSON.stringify(await page.evaluate(async () => { if (!window.__db) return 'no db here'; const keys = [...window.__db.keys()]; return { shared: keys.filter(k => /^(sync|apps|masters)\//.test(k)), private: keys.filter(k => k.startsWith('data/users/u1/')).length, legacyMoved: JSON.stringify(await window.CVT.store.getKV('mocks', null)).includes('legacy-mock') }; })));
log('coach notes (empty):', await page.locator('.note').count());

// 2. Settings
await page.click('a[data-nav="settings"]');
if (PROVIDER === 'claude') {
  log('claude-plan radio checked:', await page.isChecked('input[value="claude-plan"]'));
} else {
  await page.check(`input[value="${PROVIDER}"]`);
  await page.waitForSelector('#api-key');
  await page.fill('#api-key', 'AIza-test'); await page.click('#save-key');
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
log('edit cards:', await page.locator('.edit').count(), '| ticked:', await page.locator('.edit input:checked').count(), '| kinds:', (await page.locator('.edit .kind').allTextContents()).join(','), '| chips:', (await page.locator('.edit-meta .chip').allTextContents()).join(' / '));
log('ATS checks:', (await page.locator('.ats li strong').allTextContents()).join(' | '));
let dl = page.waitForEvent('download'); await page.click('#dl-cv'); let d = await dl; await d.saveAs(`${out}/tailored.docx`); log('cv file:', d.suggestedFilename());
await page.click('#compare-btn'); await page.waitForTimeout(1200);
log('pages note:', await page.textContent('#pages-note'));
await shot('04-cv');

// 5b. Compare CVs tab
await page.click('.ws-tabs a:has-text("Compare CVs")');
await page.waitForSelector('.cmp-row');
log('compare stats:', (await page.textContent('.cmp-stats')).replace(/\s+/g, ' ').trim());
log('compare rows:', await page.locator('.cmp-row').count(), '| changed:', await page.locator('.cmp-row:not(.k-same)').count(), '| ins:', await page.locator('.cmp-b ins').count(), '| del:', await page.locator('.cmp-a del').count());
log('first change:', ((await page.locator('.cmp-row:not(.k-same) .cmp-b').first().textContent()) || '').replace(/\s+/g, ' ').slice(0, 200));
await page.click('#cmp-next'); await page.waitForTimeout(400);
await shot('04b-compare');
await page.check('#cmp-only'); await page.waitForTimeout(200);
log('changes-only visible rows:', await page.locator('.cmp-row:visible').count());
await shot('04c-compare-only');
dl = page.waitForEvent('download'); await page.click('#cmp-dl'); d = await dl; await d.saveAs(`${out}/comparison.html`); log('comparison file:', d.suggestedFilename());
await page.uncheck('#cmp-only');

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

// 8b. Documents
await page.click('.ws-tabs a:has-text("Documents")');
await page.waitForSelector('#dz');
await page.setInputFiles('#dz-in', ['tests/fixtures/role-pack.pdf', 'tests/fixtures/recruiter-notes.txt', 'tests/fixtures/slide.png', 'tests/fixtures/briefing.webm']);
await page.waitForFunction(() => document.querySelectorAll('.doc').length === 4 && ![...document.querySelectorAll('.doc')].some(d => /Reading/.test(d.textContent)), null, { timeout: 30000 });
log('docs:', JSON.stringify(await page.$$eval('.doc', els => els.map(e => e.querySelector('.doc-name').textContent + ' → ' + e.querySelector('.doc-main .muted.small').textContent.replace(/\s+/g, ' ').trim()))));
await page.waitForFunction(() => document.querySelectorAll('.doc-check.ok').length >= 2, null, { timeout: 20000 });
log('reading checks:', await page.locator('.doc-check.ok').count(), '| not read:', await page.locator('.doc-check.warn').count(), '| per-file questions:', await page.locator('.dq-list.compact .dq').count(), '| first facts:', (await page.locator('.doc-check.ok ul').first().textContent()).replace(/\s+/g, ' ').slice(0, 80));
await page.fill('[data-id] .doc-note >> nth=2', 'Slide shows the programme timeline: UK go-live Q3 2027.');
await page.locator('.doc-list').click({ position: { x: 5, y: 5 } });
await page.click('[data-id] [data-digest]:not([disabled]) >> nth=2').catch(() => {});
await page.waitForFunction(() => document.querySelectorAll('.doc-check.ok').length >= 3, null, { timeout: 20000 }).catch(() => {});
log('after notes check:', await page.locator('.doc-check.ok').count());
await page.click('#dq-go'); await page.waitForSelector('.docs-grid > section:nth-child(2) .dq', { timeout: 20000 });
log('grouped headings:', JSON.stringify(await page.$$eval('.docs-grid .panel:nth-child(2) h3', e => e.map(x => x.textContent))));
log('doc questions:', await page.locator('.docs-grid > section:nth-child(2) .dq').count(), '| fake dropped:', /1 dropped/.test(await page.textContent('.docs-grid > section:nth-child(2)')), '| advert in prompt:', /ADVERT/.test(calls.docQ || ''), '| prompt had pdf text:', /maverick spend 22 percent/.test(calls.docQ || ''), '| had notes:', /UK go-live Q3 2027/.test(calls.docQ || ''), '| txt:', /650 outside IR35/.test(calls.docQ || ''));
await page.click('.docs-grid > section:nth-child(2) .dq summary >> nth=0'); log('question detail:', (await page.textContent('.docs-grid > section:nth-child(2) .dq-more')).replace(/\s+/g, ' ').slice(0, 140)); await shot('07e-questions');
{ // question tools + nothing spills out of the panels
  const P = '.docs-grid > section:nth-child(2)';
  await page.fill(`${P} [data-dqn] >> nth=0`, 'At the utility I phased onboarding by spend tier.'); await page.waitForTimeout(700);
  await page.click(`${P} [data-dqp] >> nth=0`); await page.waitForTimeout(300);
  const prog = (await page.textContent(`${P} .dq-prog`)).replace(/\s+/g, ' ').trim();
  await page.click(`${P} [data-dqf="todo"]`); await page.waitForTimeout(200); const todo = await page.locator(`${P} .dq`).count();
  await page.click(`${P} [data-dqf="all"]`); await page.waitForTimeout(200);
  await page.click('#dq-prep-all'); await page.waitForTimeout(400);
  const drills = await page.evaluate(async () => ((await window.CVT.store.getKV('drills', null)) || {}).custom || []);
  const saved = await page.evaluate(async () => { const a = (await window.CVT.store.listApps()).find(x => x.docQuestions); return a.docQuestions.items[0]; });
  log('question tools:', prog, '| not-practised filter shows:', todo, '| prep cards:', drills.length, drills[0] && /My notes: At the utility/.test(drills[0].a), '| notes saved:', !!saved.notes, '| practised saved:', !!saved.practised);
  for (const w of [1440, 1000, 760, 390]) {
    await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(250);
    const bad = await page.evaluate(() => { const out = []; document.querySelectorAll('.docs-grid .panel').forEach(p => { const r = p.getBoundingClientRect(); p.querySelectorAll('*').forEach(el => { const b = el.getBoundingClientRect(); if (b.width && b.right > r.right + 1 && !el.closest('.mm-wrap')) out.push((el.className || el.tagName) + ':' + Math.round(b.right - r.right)); }); }); return out.slice(0, 5); });
    const pageW = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    log(`overflow at ${w}px:`, bad.length ? bad.join(', ') : 'none', '| page scroll:', pageW);
    if (w !== 760) await shot('07f-questions-' + w);
  }
  await page.setViewportSize({ width: 1360, height: 900 });
}
{ // My questions tab
  const aidQ = await page.evaluate(async () => (await window.CVT.store.listApps()).find(x => x.docQuestions || (x.docs || []).length).id);
  const back = '#/app/' + aidQ + '/docs';
  await page.evaluate(h => window.CVT.app.go(h), '#/app/' + aidQ + '/myqs'); await page.waitForSelector('#mq-form');
  log('tabs:', JSON.stringify(await page.$$eval('.ws-tabs a', e => e.map(x => x.textContent.trim()).slice(-3))));
  await page.fill('#mq-text', '1. How would you handle a supplier refusing Ariba Network?\n- Why are you leaving your current role?'); await page.click('#mq-form button[type=submit]'); await page.waitForTimeout(300);
  await page.selectOption('#mq-kind', 'ask'); await page.fill('#mq-text', 'What does success look like in six months?'); await page.click('#mq-form button[type=submit]'); await page.waitForTimeout(300);
  await page.click('#mq-import').catch(() => {}); await page.waitForTimeout(300);
  const n = await page.locator('.myq-grid .dq').count();
  await page.click('.myq-grid .dq summary >> nth=0'); await page.click('[data-mhelp] >> nth=0'); await page.waitForSelector('.my-help', { timeout: 20000 });
  const helpTxt = (await page.textContent('.my-help')).replace(/\s+/g, ' ').slice(0, 160);
  await page.click('[data-muse] >> nth=0'); await page.waitForTimeout(300);
  await page.click('[data-mprac] >> nth=0'); await page.waitForTimeout(200);
  await page.click('[data-mf="ask"]'); await page.waitForTimeout(200); const askN = await page.locator('.myq-grid .dq').count(); await page.click('[data-mf="all"]');
  await page.click('#mq-prep'); await page.waitForTimeout(400);
  const st = await page.evaluate(async () => { const a = (await window.CVT.store.listApps()).find(x => (x.myQs || []).length); return { n: a.myQs.length, notes: !!a.myQs[0].notes, practised: !!a.myQs[0].practised, kinds: a.myQs.map(q => q.kind).join(',') }; });
  await page.click('[data-mdel] >> nth=-1'); await page.waitForTimeout(300);
  log('my questions:', n, '| help:', helpTxt, '| ask filter:', askN, '| saved:', JSON.stringify(st), '| after delete:', await page.locator('.myq-grid .dq').count(), '| prompt had profile:', /CANDIDATE PROFILE/.test(calls.myAns || ''), '| had passages:', /\[D\d+-P\d+\]/.test(calls.myAns || ''));
  await shot('07h-myqs');
  await page.evaluate(h => window.CVT.app.go(h), back); await page.waitForSelector('#dq-go');
}
await page.fill('#dc-q', 'What connects Ariba to S/4HANA?'); await page.click('#dc-form button'); await page.waitForSelector('.chat-a', { timeout: 20000 });
log('doc answer:', (await page.textContent('.chat-a .ans')).replace(/\s+/g, ' ').slice(0, 160), '| markers hidden:', !/D\d+-P\d+/.test(await page.textContent('.chat-a')), '| retrieval sent:', (calls.docAsk.match(/\[D\d+-P\d+\]/g) || []).length, 'passages | advert in prompt:', /ADVERT/.test(calls.docAsk), '| suggestions:', await page.locator('[data-suggest]').count());
await shot('07g-ask');
{ // Studio
  await page.click('[data-jump="sec-studio"]'); await page.waitForSelector('#studio-root .st-tabs');
  const res = {};
  for (const k of ['briefing', 'study', 'faq', 'timeline', 'flashcards', 'quiz', 'audio']) {
    await page.click(`[data-sttab="${k}"]`); await page.click('#studio-root [data-st="gen"]'); await page.waitForSelector('#studio-root .st-body', { timeout: 20000 });
    res[k] = (await page.textContent('#studio-root .st-meta')).replace(/\s+/g, ' ').replace(/Built [^·]+· /, '').trim();
  }
  log('studio:', JSON.stringify(res), '| advert in prompt:', /ADVERT/.test(calls.studioUser || ''), '| fake shown:', /Oracle/.test(await page.textContent('#studio-root')));
  await page.click('[data-sttab="briefing"]'); log('briefing points:', await page.locator('.st-points li').count(), '| quote boxes shown:', await page.locator('.st-body .mm-quote').count());
  await shot('07i-studio-briefing');
  await page.click('[data-sttab="flashcards"]'); const front = (await page.textContent('.fc-text')).trim(); await page.click('[data-st="flip"]'); const back = (await page.textContent('.fc-text')).trim(); await page.click('[data-st="known"]');
  log('flashcards:', front, '->', back, '|', (await page.textContent('.fc-bar')).replace(/\s+/g, ' ').trim());
  await page.click('[data-sttab="quiz"]'); await page.click('[data-qz="0:1"]'); await page.click('[data-qz="1:0"]');
  log('quiz:', (await page.textContent('.fc-bar')).replace(/\s+/g, ' ').trim(), '| right/wrong marks:', await page.locator('.quiz li.right').count(), await page.locator('.quiz li.wrong').count());
  await shot('07j-studio-quiz');
  await page.click('[data-sttab="audio"]'); await page.click('[data-au="play"]'); await page.waitForTimeout(400); log('audio lines:', await page.locator('.au-line').count(), '| checked lines:', await page.locator('.au-line .src-chip').count(), '| play button:', (await page.textContent('[data-au="play"]')).trim()); await page.click('[data-au="stop"]');
  await shot('07k-studio-audio');
  await page.click('[data-pin="0"]'); await page.waitForTimeout(300);
  await page.fill('#st-note', 'Ask about the Ireland phase timing.'); await page.click('.st-note-add button[type=submit]'); await page.waitForTimeout(300);
  log('notes:', await page.locator('.st-note').count(), '| pinned:', await page.locator('.st-note.pinned').count(), '| jump:', (await page.textContent('[data-jump="sec-studio"]')).replace(/\s+/g, ' ').trim());
  await shot('07l-studio-notes');
}
await page.click('#mm-go'); await page.waitForSelector('.mm-svg', { timeout: 20000 });
log('mind map nodes:', await page.locator('.mm-node').count(), '| branches:', await page.locator('.mm-node.d1').count(), '| prompt had docs:', /maverick spend 22 percent/.test(calls.map || ''), '| advert excluded:', !/ADVERT|JOB\n/.test(calls.map || ''), '| passages:', (calls.map.match(/\[D\d+-P\d+\]/g) || []).length);
log('grounding note:', (await page.textContent('.docs-map .hint')).replace(/\s+/g, ' ').slice(0, 220));
await page.click('.mm-node.d1 >> nth=0'); await page.waitForSelector('.mm-detail');
log('node detail:', (await page.textContent('.mm-detail')).replace(/\s+/g, ' ').slice(0, 100));
await page.click('[data-mm-toggle]'); await page.waitForTimeout(200);
log('after collapse nodes:', await page.locator('.mm-node').count());
await shot('07c-mindmap');
await page.click('[data-mm-mode="outline"]'); log('outline items:', await page.locator('.mm-outline li').count()); await page.click('[data-mm-mode="map"]');
dl = page.waitForEvent('download'); await page.click('#mm-dl'); d = await dl; await d.saveAs(`${out}/mindmap.svg`); log('mind map file:', d.suggestedFilename(), fs.readFileSync(`${out}/mindmap.svg`, 'utf8').includes('<svg'));
await shot('07b-documents');
{ // Auto-update: a new document is merged into the mind map, questions and every Studio output
  const cnt = async () => page.evaluate(async () => { const a = (await window.CVT.store.listApps()).find(x => (x.docs || []).length); const st = a.studio || {}; const L = { briefing: d => d.sections.reduce((n, s) => n + s.points.length, 0), study: d => d.concepts.length + d.questions.length, faq: d => d.items.length, timeline: d => d.events.length + d.cast.length, flashcards: d => d.cards.length, quiz: d => d.questions.length, audio: d => d.lines.length };
    const walk = n => 1 + (n.children || []).reduce((x, c) => x + walk(c), 0);
    return { map: a.docMap ? a.docMap.tree.branches.reduce((x, b) => x + walk(b), 0) : 0, qs: a.docQuestions ? a.docQuestions.items.length : 0, studio: Object.fromEntries(Object.entries(st).map(([k, o]) => [k, L[k] ? L[k](o.data) : 0])) }; });
  const b4 = await cnt();
  await page.setInputFiles('#dz-in', ['tests/fixtures/extra-brief.txt']);
  await page.waitForSelector('#docs-upd:not([hidden])', { timeout: 15000 }).catch(() => {});
  const bannerTxt = (await page.textContent('#docs-upd').catch(() => '')).trim();
  await page.waitForFunction(() => { const b = document.querySelector('#docs-upd'); return b && b.hidden; }, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  const af = await cnt();
  log('auto-update banner:', bannerTxt.slice(0, 120));
  log('auto-update before:', JSON.stringify(b4)); log('auto-update after: ', JSON.stringify(af), '| extra calls:', calls.extra, '| old docs re-sent:', /maverick spend 22/.test(calls.extraUser || ''));
  log('mind map has Ireland:', /Ireland phase/.test(await page.textContent('#mm-root')), '| question added:', /300 Irish suppliers/.test(await page.textContent('#sec-qs')));
  // Deleting that file removes what came from it
  await page.click('[data-id]:has-text("extra-brief.txt") [data-del]'); await page.click('[data-id]:has-text("extra-brief.txt") [data-del]'); await page.waitForTimeout(600);
  log('after deleting it:', JSON.stringify(await cnt()));
  await shot('07m-auto-update');
  const words = (await page.textContent('.docs-grid')).match(/\b(quote[sd]?|passage[s]?|cited|citation[s]?|checked against|NotebookLM|dropped)\b/gi);
  log('citation wording on page:', JSON.stringify(words));
}
const stored = await page.evaluate(async () => { const a = (await window.CVT.store.listApps()).find(x => (x.docs || []).length); return { n: a.docs.length, blob: !!(await window.CVT.store.getFile(a.docs[0].id)), synced: a.docs.filter(d => d.assetId).length }; });
log('docs stored:', JSON.stringify(stored));
{ // Delete controls
  const nq = await page.locator('.docs-grid > section:nth-child(2) [data-qdel]').count();
  const gq = await page.locator('[data-gqdel]').count();
  await page.click('.docs-grid > section:nth-child(2) [data-qdel] >> nth=0'); await page.waitForTimeout(300);
  if (gq) { await page.click('[data-gqdel] >> nth=0'); await page.waitForTimeout(300); }
  const nc = await page.locator('[data-cdel]').count(); await page.click('[data-cdel] >> nth=0'); await page.waitForTimeout(300);
  await page.click('#mm-del'); const armed = (await page.textContent('#mm-del')).trim(); await page.click('#mm-del'); await page.waitForTimeout(300);
  const nd = await page.locator('[data-del]').count(); await page.click('[data-del] >> nth=0'); await page.click('[data-del] >> nth=0'); await page.waitForTimeout(500);
  log('delete: questions', nq, '->', await page.locator('.docs-grid > section:nth-child(2) [data-qdel]').count(), '| file questions', gq, '->', await page.locator('[data-gqdel]').count(), '| chat', nc, '->', await page.locator('[data-cdel]').count(), '| map armed:', armed, 'gone:', !(await page.locator('.mm-svg').count()), '| files', nd, '->', await page.locator('[data-del]').count(), '| synced copy deleted:', await page.evaluate(() => window.__assetDeleted || 0));
  log('questions left after deleting role-pack.pdf (they came from it):', await page.locator('[data-qdel]').count());
  if (await page.locator('#dq-clear').count()) { await page.click('#dq-clear'); await page.click('#dq-clear'); await page.waitForTimeout(300); }
  log('delete all questions:', !(await page.locator('[data-qdel]').count()), '| button back to:', (await page.textContent('#dq-go')).trim());
  await shot('07d-deletes');
  const before = await page.evaluate(async () => { const a = (await window.CVT.store.listApps()).find(x => (x.docs || []).length); return { id: a.id, files: a.docs.map(d => d.id) }; });
  await page.click('#docs-wipe'); const armedW = (await page.textContent('#docs-wipe')).trim(); await page.click('#docs-wipe'); await page.waitForTimeout(800);
  const after = await page.evaluate(async id => { const a = await window.CVT.store.getApp(id); return { docs: a.docs.length, q: !!a.docQuestions, map: !!a.docMap, chat: (a.docChat || []).length, studio: Object.keys(a.studio || {}).length, notes: (a.docNotes || []).length, myQs: (a.myQs || []).length }; }, before.id);
  const blobs = await page.evaluate(async ids => (await Promise.all(ids.map(i => window.CVT.store.getFile(i)))).filter(Boolean).length, before.files);
  log('delete everything:', armedW, '->', JSON.stringify(after), '| local files left:', blobs, '| wipe button gone:', !(await page.locator('#docs-wipe').count()), '| section buttons still there after re-add: see earlier');
}
const media = await page.evaluate(async () => {
  const A = window.CVT.agent, orig = A.claudeSample; let sent = 0;
  const fake = async () => { const f = async () => ({}); f.limits = async () => ({ images: { maxCount: 4, maxInputBytes: 5e6, mediaTypes: ['image/jpeg', 'image/png'] } }); f.json = async (input, o) => { sent = (o.images || []).length; return { text: 'Timeline slide: UK go-live Q3 2027', summary: 'A programme timeline.' }; }; return f; };
  A.claudeSample = fake;
  try {
    const v = await (await fetch('/tests/fixtures/briefing.webm')).blob();
    const r1 = await window.CVT.docs.extract({ kind: 'video', name: 'briefing.webm' }, v); const n1 = sent;
    const im = await (await fetch('/tests/fixtures/slide.png')).blob();
    const r2 = await window.CVT.docs.extract({ kind: 'image', name: 'slide.png' }, im);
    return { video: r1.status + ' frames=' + n1 + ' ' + r1.text.slice(0, 40), image: r2.status + ' ' + r2.text.slice(0, 40) };
  } catch (e) { return { err: e.message }; } finally { A.claudeSample = orig; }
});
log('media read:', JSON.stringify(media));

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

// 10b. Jobs feed (claude only: mocked Indeed connector)
if (PROVIDER === 'claude') {
  await page.click('a[data-nav="jobs"]');
  await page.waitForSelector('#jb-refresh');
  await page.click('#jb-refresh');
  await page.waitForSelector('.job .score-pill');
  await page.waitForTimeout(800);
  const jobRows = await page.$$eval('.job', els => els.map(e => [...e.querySelectorAll('.src-badge')].map(x => x.textContent.trim()).join('+') + ': ' + e.querySelector('.job-title').textContent.trim() + ' = ' + e.querySelector('.score-pill').textContent.trim() + ' [' + [...e.querySelectorAll('.job-chips .chip')].map(c => c.textContent.trim()).join(', ') + ']'));
  log('robot panel:', (await page.locator('.jobs-side .panel').first().textContent()).replace(/\s+/g, ' ').slice(0, 160));
  log('jobs (default 30d filter):', JSON.stringify(jobRows));
  log('source bar:', (await page.textContent('#f-src')).replace(/\s+/g, ' ').trim(), '| summary:', (await page.textContent('#jb-sum')).replace(/\s+/g, ' ').trim());
  const nAll = await page.locator('.job').count();
  const firstSrc = page.locator('#f-src [data-src]:not([data-src=""])').first();
  if (await firstSrc.count()) { const lbl = (await firstSrc.textContent()).trim(); await firstSrc.click(); await page.waitForTimeout(300); log('source filter', lbl, '→', await page.locator('.job').count(), 'of', nAll); await page.click('#f-src [data-src=""]'); await page.waitForTimeout(300); }
  await page.selectOption('#f-kind', 'contract'); await page.waitForTimeout(300); log('contract only:', await page.locator('.job').count());
  await page.selectOption('#f-kind', ''); await page.selectOption('#f-sort', 'pay'); await page.waitForTimeout(300);
  log('by pay:', JSON.stringify(await page.$$eval('.job .job-meta', els => els.slice(0, 3).map(e => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 90)))));
  await page.selectOption('#f-sort', 'score'); await page.waitForTimeout(200);
  await page.evaluate(() => { window.__dl = null; const o = window.CVT.ui.download; window.CVT.ui.download = async (b, n) => { window.__dl = { n, t: await b.text() }; }; });
  await page.click('#jb-csv'); await page.waitForTimeout(300);
  log('csv:', await page.evaluate(() => window.__dl && (window.__dl.n + ' | ' + window.__dl.t.split('\r\n').length + ' lines | ' + window.__dl.t.split('\r\n')[0])));
  await page.click('.job [data-j="details"]');
  await page.waitForSelector('.job-detail');
  log('detail kw:', (await page.textContent('.kw-cols')).replace(/\s+/g, ' ').slice(0, 200));
  await page.click('[data-j="intel"]');
  await page.waitForSelector('.intel-list');
  log('intel:', (await page.textContent('.intel')).replace(/\s+/g, ' ').slice(0, 200));
  log('market:', (await page.textContent('#mk')).replace(/\s+/g, ' ').slice(0, 260));
  log('calc:', (await page.textContent('#rc-out')).replace(/\s+/g, ' ').slice(0, 200));
  log('boards:', await page.locator('#b-links a').count());
  await shot('10b-jobs');
  const addBtn = page.locator('#mk [data-add]').first();
  if (await addBtn.count()) { await addBtn.click(); await page.waitForTimeout(300); log('profile extra skills:', await page.evaluate(async () => (await window.CVT.store.getProfile()).extraSkills)); }
  await page.locator('.job [data-j="import"]').first().click();
  await page.waitForSelector('#ws-body #jd');
  log('imported:', await page.inputValue('[data-f="role"]'), '|', await page.inputValue('[data-f="company"]'), '| jd chars', (await page.inputValue('#jd')).length, '| type', await page.inputValue('[data-f="contractType"]'));
  await page.click('#intel-run'); await page.waitForSelector('#intel-out .intel-list');
  log('ws intel ok');
  // Duplicate guard: add the same role manually.
  const dupId = await page.evaluate(async () => { const S = window.CVT.store; const a = S.newApp(''); a.role = 'SAP Ariba Solution Architect'; a.company = 'Fictional Energy'; await S.saveApp(a); return a.id; });
  await page.evaluate(id => window.CVT.app.go('#/app/' + id + '/job'), dupId);
  await page.waitForSelector('.ws-head');
  log('dup bar:', await page.locator('.dup-bar').count() ? (await page.textContent('.dup-bar')).replace(/\s+/g, ' ').slice(0, 160) : 'none');
  await page.click('a[data-nav="dashboard"]');
  await page.waitForSelector('#dash-jobs .job, #dash-jobs .empty-state');
  log('dashboard jobs:', await page.locator('#dash-jobs .job').count(), '| badge', await page.textContent('#jobs-badge'), await page.isHidden('#jobs-badge'));
  await shot('10c-dashboard-jobs');
  await page.click('.side-link'); await page.waitForSelector('.help-grid'); await shot('10d-help');
}

// 10e. Interview prep (claude only)
if (PROVIDER === 'claude') {
  const aid = await page.evaluate(async () => (await window.CVT.store.listApps()).find(a => a.jd && a.jd.length > 300).id);
  // Story bank: draft from CV
  await page.evaluate(() => window.CVT.app.go('#/prep/stories'));
  await page.waitForSelector('#st-draft');
  await page.click('#st-draft'); await page.waitForSelector('.story');
  log('stories drafted:', await page.locator('.story').count(), '| missing themes:', (await page.textContent('#prep-body .panel')).includes('not covered'));
  // Interview slot + calendar on the application
  await page.evaluate(id => window.CVT.app.go('#/app/' + id + '/interview'), aid);
  await page.waitForSelector('#iv-at');
  const when = new Date(Date.now() + 3 * 864e5); when.setHours(10, 0, 0, 0);
  const local = new Date(when.getTime() - when.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await page.fill('#iv-at', local);
  const [icsDl] = await Promise.all([page.waitForEvent('download'), page.click('#iv-ics')]);
  const ics = fs.readFileSync(await icsDl.path(), 'utf8');
  log('ics:', icsDl.suggestedFilename(), '| events', (ics.match(/BEGIN:VEVENT/g) || []).length, '| alarms', (ics.match(/BEGIN:VALARM/g) || []).length);
  log('stories for job:', await page.locator('.story-hits li').count());
  await shot('10e-interview-tab');
  // Mock interview
  await page.evaluate(id => window.CVT.app.go('#/prep/mock/' + id), aid);
  await page.waitForSelector('#mk-start'); await page.click('#mk-start');
  await page.waitForSelector('#mk-ans');
  // Microphone blocked (as inside claude.ai): Speak must fall back to device dictation help.
  await page.evaluate(() => { window.webkitSpeechRecognition = window.SpeechRecognition = class { start() { setTimeout(() => this.onerror && this.onerror({ error: 'not-allowed' }), 50); } stop() {} }; });
  await page.click('#mk-mic'); await page.waitForSelector('#mk-mic-help:not([hidden])');
  log('mic blocked help:', (await page.textContent('#mk-mic-help')).slice(0, 140), '| read-aloud button:', await page.locator('#mk-say').count());
  await shot('10f0-mic-help');
  log('mock q:', (await page.textContent('.mock-question')).slice(0, 80));
  await page.fill('#mk-ans', 'I would start with catalogue-first policies for standard hardware, a threshold above which a sourcing request is required, and approvals from the IT budget owner.');
  await page.click('#mk-send'); await page.waitForSelector('.score-stars');
  log('mock feedback:', (await page.textContent('.score-stars')), '|', (await page.textContent('.mock-q')).replace(/\s+/g, ' ').slice(0, 120));
  await shot('10f-mock');
  await page.click('#mk-next'); await page.waitForSelector('#mk-ans'); await page.click('#mk-end');
  log('mock summary:', (await page.textContent('#mk-live')).replace(/\s+/g, ' ').slice(0, 80));
  // Drill cards
  await page.evaluate(() => window.CVT.app.go('#/prep/drills'));
  await page.waitForSelector('.flash'); await page.click('#dr-show'); await page.click('[data-r="2"]'); await page.click('#dr-show'); await page.click('[data-r="0"]');
  log('drills progress:', await page.evaluate(async () => Object.keys((await window.CVT.store.getKV('drills')).p).length));
  await page.fill('#dr-topic', 'SAP Ariba Contracts'); await page.click('#dr-gen'); await page.waitForTimeout(500);
  log('custom cards:', await page.evaluate(async () => (await window.CVT.store.getKV('drills')).custom.length));
  await shot('10g-drills');
  // Offers
  await page.evaluate(() => window.CVT.app.go('#/prep/offers'));
  await page.waitForSelector('#of-add'); await page.click('#of-add');
  await page.fill('[data-k="company"]', 'Northgate Energy'); await page.fill('[data-k="salary"]', '90000'); await page.fill('[data-k="bonus"]', '10'); await page.fill('[data-k="pension"]', '8'); await page.click('[data-save]');
  await page.click('#of-add'); await page.fill('[data-k="company"]', 'Example Resourcing'); await page.selectOption('[data-k="type"]', 'Contract'); await page.fill('[data-k="rate"]', '600'); await page.selectOption('[data-k="ir35"]', 'Outside'); await page.click('[data-save]');
  await page.waitForSelector('table.offers');
  log('offers:', (await page.textContent('table.offers')).replace(/\s+/g, ' ').slice(0, 260));
  await page.click('[data-of="counter"]'); await page.fill('#co-goal', '£95k'); await page.click('#co-go'); await page.waitForSelector('#co-out .copy-block');
  log('counter-offer ok');
  await shot('10h-offers');
  // Dashboard prep panel
  await page.click('a[data-nav="dashboard"]'); await page.waitForSelector('#dash-prep .prep-tile');
  log('dash prep:', (await page.textContent('#dash-prep')).replace(/\s+/g, ' ').slice(0, 200));
  // Sync: the other device's copy should restore a locally lost application and profile
  await page.waitForTimeout(1500);
  const synced = await page.evaluate(async () => { const S = window.CVT.store; const apps = await S._all('apps'); const id = apps[0].id; await S._del('apps', id); const m = JSON.parse(localStorage.getItem('cvt.syncMeta')); m.profile = '2000-01-01T00:00:00Z'; localStorage.setItem('cvt.syncMeta', JSON.stringify(m)); const r = await window.CVT.sync.pull(); return { r, back: !!(await S.getApp(id)), remoteApps: [...window.__db.keys()].filter(k => k.startsWith('apps/')).length, remoteMasters: [...window.__db.keys()].filter(k => k.startsWith('masters/')).length }; });
  log('sync:', JSON.stringify(synced));
  const cvRestore = await page.evaluate(async () => { const S = window.CVT.store; const m = (await S._all('masters'))[0]; await S._del('masters', m.id); await window.CVT.sync.pull(); const back = await S.getMaster(m.id); return back ? back.data.byteLength === m.data.byteLength : false; });
  log('cv restored from sync:', cvRestore);
  await page.click('a[data-nav="settings"]'); await page.waitForSelector('#sy-chip');
  log('settings sync chip:', await page.textContent('#sy-chip'));
}

// 10i. Autopilot (claude only)
if (PROVIDER === 'claude') {
  await page.evaluate(async () => { const S = window.CVT.store; const a = S.newApp(''); a.created = new Date(Date.now() - 2 * 3600e3).toISOString(); await S.saveApp(a); await S.setKV('autopilot', { max: 2, min: 40, letter: true, outreach: true, answers: true, interview: false, includeAgency: true }); });
  await page.click('a[data-nav="dashboard"]'); await page.waitForSelector('.kpis');
  await page.click('.page-head [data-go="#/autopilot"]'); await page.waitForSelector('#ap-run');
  await page.click('#ap-run');
  await page.waitForSelector('#ap-log');
  await page.waitForFunction(() => { const h = document.querySelector('#ap-live h2'); return h && h.textContent === 'Last run'; }, null, { timeout: 180000 });
  log('autopilot summary:', (await page.textContent('#ap-live')).replace(/\s+/g, ' ').slice(0, 400));
  log('ready rows:', await page.locator('table.list tbody tr').count());
  const prepared = await page.evaluate(async () => (await window.CVT.store.listApps()).filter(a => a.autopilot).map(a => ({ role: a.role, fit: a.analysis && a.analysis.fit.score, letter: !!a.letter, outreach: !!a.outreach, why: !!(a.answers && a.answers.why), status: a.status })));
  log('prepared apps:', JSON.stringify(prepared));
  log('empty drafts left:', await page.evaluate(async () => (await window.CVT.store.listApps()).filter(a => !a.role && !a.company && !a.jd).length));
  await shot('10i-autopilot');
}

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

// 11b. Top bar search, pricing, shots of the refreshed look
log('private sync later:', JSON.stringify(await page.evaluate(() => { if (!window.__db) return 'no db here'; const keys = [...window.__db.keys()]; return { shared: keys.filter(k => !k.startsWith('data/users/') && k !== 'robot/latest'), privateApps: keys.filter(k => k.startsWith('data/users/u1/root/apps/')).length, privateOther: keys.filter(k => k.startsWith('data/users/u1/') && !k.includes('/root/')).length }; })));
log('visible Claude mentions:', JSON.stringify(await page.evaluate(async () => { const out = []; for (const h of ['#/dashboard', '#/settings', '#/help', '#/pricing', '#/prep/mock', '#/jobs']) { await window.CVT.app.go(h); await new Promise(r => setTimeout(r, 400)); const t = document.body.innerText; const m = t.match(/[^\n]{0,40}\bClaude\b[^\n]{0,40}/g); if (m) out.push(h + ': ' + m.join(' | ')); } return out; })));
await page.goto('http://localhost:8765/#/dashboard'); await page.waitForSelector('.kpis');
await page.keyboard.press('/'); await page.keyboard.type('ariba');
await page.waitForSelector('#tb-results .tb-hit', { timeout: 8000 });
log('search results:', JSON.stringify(await page.$$eval('#tb-results .tb-hit', e => e.map(x => x.querySelector('.tb-kind').textContent + ': ' + x.querySelector('.tb-t').textContent).slice(0, 6))));
await shot('20-search');
await page.keyboard.press('Enter'); await page.waitForTimeout(700);
log('search opened:', await page.textContent('#tb-title'), '|', (await page.evaluate(() => document.title)));
await page.click('.tb-link'); await page.waitForSelector('.plans');
log('pricing:', await page.locator('.plan-card').count(), 'plans |', (await page.textContent('.plans')).includes('not on sale') || (await page.textContent('.view')).includes('not on sale'));
await page.click('[data-plan="pro"]'); await page.waitForTimeout(300); log('notify saved:', await page.evaluate(async () => !!((await window.CVT.store.getKV('planInterest', null)) || {}).pro));
await shot('21-pricing');
for (const [h, n] of [['#/dashboard', '22-dashboard'], ['#/pipeline', '23-pipeline'], ['#/jobs', '24-jobs'], ['#/settings', '25-settings']]) { await page.goto('http://localhost:8765/' + h); await page.waitForTimeout(900); await page.screenshot({ path: `${out}/${n}.png` }); }
await page.click('#tb-tour'); await page.waitForSelector('.tour-card'); log('tour relaunch:', await page.textContent('.tour-card h2')); await page.keyboard.press('Escape'); log('tour closed:', !(await page.locator('.tour').count()));

// 12. Mobile layout
await page.setViewportSize({ width: 400, height: 860 });
const overflow = async () => page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.table-wrap,.preview-box,.board-wrap,.side,.ws-tabs')).slice(0, 6).map(e => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right)));
for (const h of ['#/dashboard', '#/jobs', '#/pipeline', '#/profile', '#/settings', '#/help', '#/prep/mock', '#/prep/stories', '#/prep/drills', '#/prep/offers', '#/autopilot', '#/pricing']) { await page.goto('http://localhost:8765/' + h); await page.waitForTimeout(500); log('overflow', h, JSON.stringify(await overflow())); }
const appId = await page.evaluate(async () => (await window.CVT.store.listApps())[0].id);
for (const t of ['job', 'fit', 'cv', 'letter', 'outreach', 'interview', 'docs', 'apply', 'myqs']) { await page.goto(`http://localhost:8765/#/app/${appId}/${t}`); await page.waitForTimeout(600); log('overflow', t, JSON.stringify(await overflow())); }
await page.goto(`http://localhost:8765/#/app/${appId}/fit`); await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/12-mobile-fit.png`, fullPage: false });
await page.goto('http://localhost:8765/#/dashboard'); await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/13-mobile-dashboard.png`, fullPage: false });

log('calls:', JSON.stringify({ gemini: calls.gemini || 0, sample: calls.sample || 0, mcp: calls.mcp || 0, paidApiCalls: calls.paid || 0 }));
for (const [h, n] of [['#/jobs', '14-mobile-jobs'], ['#/app/' + (await page.evaluate(async () => (await window.CVT.store.listApps()).find(a => a.analysis)?.id)) + '/compare', '18-mobile-compare'], ['#/prep/drills', '15-mobile-drills'], ['#/prep/stories', '16-mobile-stories'], ['#/dashboard', '17-mobile-dash']]) { await page.goto('http://localhost:8765/' + h); await page.waitForTimeout(800); await page.screenshot({ path: `${out}/${n}.png`, fullPage: false }); }
log('errors:', JSON.stringify(errors));
await browser.close(); srv.close();
