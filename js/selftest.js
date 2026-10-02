/*
 * selftest.js — "Check every feature": runs one complete fictional job application through the real AI engine
 * (demo CV, a job advert, a short advert, documents, Studio, interview practice…) and reports each step.
 * Everything it creates is fictional and removed at the end. Results are kept so they can be reviewed.
 */
(function () {
  const { html, esc } = window.CVT.ui;
  const S = window.CVT.store, A = window.CVT.agent;

  const JD = `IT Business Analyst (Procure-to-Pay) — Fictional Foods Ltd (fictional example)
Preston, hybrid (2 days on site) · Permanent · £55,000–£62,000

About the role
Fictional Foods is moving purchasing from spreadsheets and an old ERP to SAP S/4HANA with SAP Ariba Guided Buying. You will be the business analyst between Procurement, Finance and the IT delivery team.

What you will do
- Run requirements workshops and write user stories with acceptance criteria
- Map current and future Procure-to-Pay processes (requisition to payment)
- Own the requirements traceability matrix and support SIT and UAT
- Analyse supplier and spend data in Excel and SQL; build simple Power BI reports
- Help design approval workflows and catalogue buying
- Support training and hypercare after go-live

What you will bring
- 4+ years as a business analyst on ERP or procurement systems
- Strong process mapping (BPMN) and stakeholder management
- Experience with SAP MM, S/4HANA or SAP Ariba
- SQL and Excel; Power BI is a plus
- Agile delivery (Jira, Confluence)`;
  const DOCS = [
    ['Role pack.txt', `Programme Horizon (fictional) replaces the legacy JDE purchasing module with SAP S/4HANA 2023 and SAP Ariba Guided Buying. The UK go-live is planned for March 2027 and the Ireland sites follow in September 2027.
Scope: 1,800 requisitioners, 4,200 active suppliers and about 38,000 purchase orders a year. Maverick spend is currently 27 percent of addressable spend and the target is under 10 percent within a year of go-live.
The business analyst reports to Priya Shah, Head of Procurement Systems, and works daily with the Finance AP team led by Tom Reid.
Known pain points: invoices without purchase orders, slow approvals (average 6 days), duplicate supplier records and no catalogue buying.`],
    ['Recruiter call notes.txt', `Call with the recruiter, Sam Patel (Bright Talent, fictional), 28 September.
Interview process: a 30-minute screening call, then a 90-minute panel with Priya Shah and Tom Reid that includes a case study: map the current requisition-to-payment process and propose three quick wins.
The team uses Jira and Confluence and runs two-week sprints. They value people who can explain SAP concepts to non-technical buyers.
Salary band £55,000 to £62,000 plus 8 percent bonus. Start date flexible, ideally January 2027.`],
    ['Company overview.txt', `Fictional Foods Ltd makes chilled ready meals for UK supermarkets from three sites: Preston, Leyland and Dublin. Revenue was £410 million last year with 2,300 employees.
The 2026 strategy focuses on cost control, supplier consolidation and better spend visibility. Procurement wants catalogue buying for packaging, MRO and IT equipment first.`]
  ];

  function render(box, rows, done) {
    const ok = rows.filter(r => r.ok).length, bad = rows.filter(r => r.ok === false).length;
    box.innerHTML = String(html`<p class="small"><strong>${ok}</strong> passed · <strong>${bad}</strong> failed · ${rows.length} steps${done ? ' · finished' : ' · running…'}</p>
      <table class="list"><thead><tr><th>Step</th><th>Result</th><th>Time</th><th>Details</th></tr></thead><tbody>${rows.map(r => html`<tr><td>${r.step}</td><td>${r.ok == null ? '…' : r.ok ? '✓' : '✗'}</td><td class="muted">${r.ms != null ? (r.ms / 1000).toFixed(1) + ' s' : ''}</td><td class="small">${r.detail || ''}</td></tr>`)}</tbody></table>`);
  }

  async function keep(rows, meta) {
    try { await S.setKV('selftest', { at: new Date().toISOString(), meta, rows }); } catch (_) {}
    // Inside claude.ai also keep a copy in this person's private store, so a support session can read it.
    try {
      if (!(window.claude && window.claude.use)) return;
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      const id = user && await user.id(); if (!db || !id) return;
      await db.doc(`data/users/${id}/selftest`).set({ at: new Date().toISOString(), meta, rows: JSON.parse(JSON.stringify(rows)) });
    } catch (_) {}
  }

  async function run(box) {
    const rows = [], meta = { provider: (window.CVT.ui.state || {}).provider || '', ua: navigator.userAgent.slice(0, 120) };
    const step = async (name, fn) => {
      const r = { step: name, ok: null }; rows.push(r); render(box, rows); const t0 = performance.now();
      try { const d = await fn(); r.ok = true; r.detail = d || ''; }
      catch (e) { r.ok = false; r.detail = 'ERROR: ' + ((e && e.message) || e); }
      r.ms = Math.round(performance.now() - t0); render(box, rows); await keep(rows, meta);
      return r.ok;
    };
    const created = { apps: [], master: null };
    let profile = await S.getProfile(), a = null, a2 = null;
    const E = window.CVT.engine;
    try {
      await step('Switch on the AI', async () => { if (!(await window.CVT.ai.ensure('The feature check uses the AI.', { big: true }))) throw new Error('No AI engine chosen'); return 'engine: ' + (window.CVT.ui.state.provider || '?'); });
      await step('Add the demo CV', async () => {
        const buf = await window.CVT.demoCv('it');
        created.master = await S.addMaster('Self-test demo CV (fictional)', 'selftest-demo-cv.docx', buf);
        const id = typeof created.master === 'string' ? created.master : created.master && created.master.id;
        created.masterId = id || (await S.listMasters()).find(m => m.name.startsWith('Self-test'))?.id;
        return 'CV id ' + created.masterId;
      });
      await step('Create the application', async () => {
        a = S.newApp(created.masterId); Object.assign(a, { jd: JD, role: '', company: '', tone: 'Warm and direct' }); await S.saveApp(a); created.apps.push(a.id); return a.id;
      });
      await step('Analyse fit and tailor the CV', async () => {
        const out = await E.analyse(a, profile);
        return `fit ${out.fit && out.fit.score}/100, advice ${out.decision && out.decision.verdict}, ${out.requirements.length} requirements, ${out.edits.length} CV edits, role "${a.role}" at "${a.company}"`;
      });
      await step('Build the tailored CV (Word)', async () => { const t = await E.cvText(a); if (t.length < 300) throw new Error('tailored CV text too short'); return t.length + ' characters'; });
      await step('Cover letter', async () => { await E.letter(a, profile); if (!a.letter || a.letter.length < 300) throw new Error('letter too short'); return a.letter.split(/\s+/).length + ' words'; });
      await step('Recruiter and hiring-manager messages', async () => { await E.outreach(a, profile); return Object.keys(a.outreach || {}).join(', '); });
      await step('Application-form answers', async () => { await E.answers(a, profile); return ['why', 'salary', 'notice'].filter(k => a.answers && a.answers[k]).join(', ') + ' filled'; });
      await step('Interview prep', async () => { await E.interview(a, profile); const q = (a.interview && a.interview.questions) || []; if (!q.length) throw new Error('no questions'); return q.length + ' questions'; });
      await step('Ask AI about the application', async () => {
        const r = await A.appChat({ context: `JOB: ${a.role} at ${a.company}\nJOB ADVERT:\n${a.jd}\nCANDIDATE CV:\n${(await E.cvText(a)).slice(0, 5000)}`, history: [], question: 'What are my two biggest gaps for this job, and how should I handle them?' });
        if (!r || !r.answer) throw new Error('no answer'); return r.answer.slice(0, 140) + '…';
      });
      await step('Short advert (three lines)', async () => {
        a2 = S.newApp(created.masterId); Object.assign(a2, { jd: 'Junior Procurement Systems Analyst, Leyland. SAP and Excel. Permanent, £35k.', role: '', company: '' }); await S.saveApp(a2); created.apps.push(a2.id);
        const out = await E.analyse(a2, profile); await E.letter(a2, profile);
        return `fit ${out.fit && out.fit.score}, ${out.requirements.length} requirements (typical ones inferred), letter ${a2.letter.split(/\s+/).length} words`;
      });
      // ---------- documents ----------
      const D = window.CVT.docs, ST = window.CVT.studio;
      await step('Add three documents (pasted text)', async () => {
        a = await S.getApp(a.id);
        a.docs = DOCS.map(([name, text], i) => ({ id: 'st' + i + Date.now().toString(36), name, type: 'text/plain', size: text.length, kind: 'text', added: new Date().toISOString(), status: 'ready', use: true, text, note: '' }));
        await S.saveApp(a); return a.docs.map(d => d.name).join(', ');
      });
      const docs = () => a.docs.filter(d => d.use !== false && (d.text || '').trim());
      await step('Interview questions from documents', async () => {
        const { passages } = D.passagesOf(docs());
        const r = await A.docQuestions({ app: a, profile, stories: [], passages });
        const v = D.verifyQuestions(r.questions, passages, docs());
        if (!v.items.length) throw new Error(`all ${(r.questions || []).length} questions failed the document check`);
        return `${v.items.length} kept, ${v.removed} dropped`;
      });
      await step('Mind map', async () => {
        const { passages } = D.passagesOf(docs());
        const v = D.verifyTree((await A.docMindmap({ passages })) || {}, passages, docs());
        if (!v.kept) throw new Error('no node passed the document check'); return `${v.kept} nodes kept, ${v.removed} dropped, ${v.tree.branches.length} branches`;
      });
      await step('Ask about these documents', async () => {
        const { passages } = D.passagesOf(docs(), Infinity);
        const hits = D.retrieve(passages, 'When is the UK go-live and what is the case study?');
        const r = await A.docAsk({ app: a, passages: hits, question: 'When is the UK go-live and what is the case study?', history: [] });
        if (!r || !r.answer) throw new Error('no answer'); return r.answer.slice(0, 140) + '…';
      });
      for (const [kind, label] of ST.KINDS.filter(k => k[0] !== 'notes')) {
        await step('Studio: ' + label, async () => {
          const { passages } = D.passagesOf(docs());
          const r = await A.docStudio({ kind, app: a, passages });
          const v = ST.verify(kind, r, passages, docs(), D.found);
          if (v.empty) throw new Error(`nothing passed the document check (${JSON.stringify(r).slice(0, 160)})`);
          return `${v.kept} items kept, ${v.removed} dropped`;
        });
      }
      await step('Studio screen: Create button builds and shows the FAQ', async () => {
        const el = document.createElement('div'); el.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px'; document.body.append(el);
        try {
          ST.open(a.id, 'faq');
          ST.mount(el, { a, readable: docs, passagesOf: D.passagesOf, found: D.found, save: () => S.saveApp(a), sig: () => 'selftest' });
          const btn = el.querySelector('[data-st="gen"]'); if (!btn) throw new Error('no Create button'); if (btn.disabled) throw new Error('Create button is disabled');
          btn.click();
          const t0 = Date.now(); while (!(a.studio && a.studio.faq) && Date.now() - t0 < 180000) await new Promise(r => setTimeout(r, 500));
          await new Promise(r => setTimeout(r, 300));
          if (!(a.studio && a.studio.faq)) throw new Error('nothing was built: ' + (document.querySelector('#toasts') || {}).textContent);
          const shown = el.querySelectorAll('.st-qa details').length; if (!shown) throw new Error('built but not shown on screen');
          return shown + ' questions shown';
        } finally { el.remove(); }
      });
      // ---------- interview practice ----------
      let mq = null;
      await step('Mock interview: question', async () => { mq = await A.mockQuestion({ app: a, profile, stories: [], asked: [] }); if (!mq || !(mq.question || mq.q)) throw new Error('no question'); return (mq.question || mq.q).slice(0, 120); });
      await step('Mock interview: score an answer', async () => {
        const g = await A.mockGrade({ app: a, profile, stories: [], question: (mq && (mq.question || mq.q)) || 'Tell me about a process you improved.', answer: 'At my last client I mapped the requisition-to-pay process with procurement and finance, found that approvals took six days, and introduced approval limits by spend category. Approval time fell to two days and we cut invoices without POs by a third.' });
        return JSON.stringify(g).slice(0, 140);
      });
      await step('Story bank drafts', async () => { const r = await A.storyDrafts({ profile, cvText: (await E.cvText(a)).slice(0, 6000), have: [] }); return ((r && r.stories) || []).length + ' stories'; });
      await step('Drill cards on a topic', async () => { const r = await A.moreCards({ topic: 'SAP Ariba Guided Buying', count: 5 }); return ((r && r.cards) || []).length + ' cards'; });
      await step('Counter-offer', async () => { const r = await A.counterOffer({ profile, offer: { company: 'Fictional Foods Ltd', type: 'Permanent', base: 55000, bonus: '8%' }, others: [], goal: '£60,000 base' }); if (!r || !r.email) throw new Error('no email'); return r.email_subject || 'email written'; });
      await step('LinkedIn profile ideas', async () => { const r = await A.linkedin({ profile, cvText: (await E.cvText(a)).slice(0, 6000) }); return Object.keys(r || {}).join(', '); });
    } finally {
      await step('Remove the fictional test data', async () => {
        for (const id of created.apps) await S.removeApp(id);
        if (created.masterId && S.removeMaster) await S.removeMaster(created.masterId);
        return created.apps.length + ' applications and the demo CV removed';
      });
      render(box, rows, true); await keep(rows, meta);
    }
    return rows;
  }

  window.CVT = window.CVT || {};
  window.CVT.selftest = { run };
})();
// A test copy of the app can start the check by itself (set window.CVT_AUTOSELFTEST before this file loads).
if (window.CVT_AUTOSELFTEST) {
  try { localStorage.setItem('cvt.welcomeDone', '"1"'); } catch (_) {}
  setTimeout(() => {
    const box = document.createElement('div');
    box.className = 'selftest-float panel';
    box.style.cssText = 'position:fixed;inset:70px 20px auto auto;width:min(720px,calc(100vw - 40px));max-height:calc(100vh - 90px);overflow:auto;z-index:90;padding:14px;';
    box.innerHTML = '<h2>Feature check</h2><div id="st-auto"></div>';
    document.body.append(box);
    window.CVT.selftest.run(box.querySelector('#st-auto'));
  }, 3000);
}
