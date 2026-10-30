/*
 * aitools.js — four tools inspired by paid "AI apply" products, kept free and in your control:
 *   1. #/scan   CV scanner: an instant ATS match score for any advert (keywords, format, results, title), no AI needed.
 *   2. Apply queue (Review mode): tick jobs on the Jobs page, Autopilot prepares a kit for each, you review and apply yourself.
 *   3. #/home   Landing page: what Applywise does, how it works, how it compares, FAQ.
 *   4. Cue cards: a one-screen revision sheet per job for the last 10 minutes before an interview.
 * Nothing here applies, sends or submits anything for you.
 */
(function () {
  const { html, raw, $, $$, toast, esc, gauge, scoreCls, state, masterModel, ukDate } = window.CVT.ui;
  const S = window.CVT.store;
  const J = () => window.CVT.jobs, D = () => window.CVT.docx;

  // =====================================================================
  // 1. CV SCANNER
  // =====================================================================
  // A "result" number: %, money, k/m/bn, thousands, or a count of something (not years, dates or phone numbers).
  const NUM = /(\d+(\.\d+)?\s?%|[£$€]\s?\d|\b\d+(\.\d+)?\s?(k|m|bn|million|billion)\b|\b\d{1,3}(,\d{3})+\b|\b\d+\+?\s+(users|suppliers|vendors|countries|sites|plants|people|staff|engineers|consultants|team members|projects|entities|company codes|business units|days|weeks|months|invoices|orders|categories|catalogues|catalogs|locations|stores|markets|regions)\b)/i;
  const isResult = l => NUM.test(l) && !/@|\+\d{2}\s?\d|linkedin\.com|^\s*(tel|phone|mobile)/i.test(l);

  /** Score a CV against an advert. Returns { score, parts, hit, miss, checks, quantified, titleHit }. Pure apart from the docx checks. */
  async function scan(jd, model, role) {
    const cv = D().plainText(model);
    const kws = [...new Set(J().termsIn(jd + '\n' + (role || '')))];
    const cov = D().keywordCoverage(cv, kws);
    const checks = await D().atsReport(model);
    const fmt = checks.length ? Math.round(100 * checks.filter(c => c.status !== 'warn').length / checks.length) : 70;
    const bullets = model.paras.map(p => p.text.trim()).filter(t => t.length > 40 && t.length < 400);
    const quant = bullets.length ? Math.round(100 * bullets.filter(isResult).length / bullets.length) : 0;
    const roleWords = String(role || (jd.split('\n').find(l => l.trim().length > 5) || '')).toLowerCase().match(/[a-z0-9/+#.]{3,}/g) || [];
    const stop = new Set(['the', 'and', 'for', 'with', 'senior', 'junior', 'lead', 'role', 'job', 'remote', 'hybrid', 'contract', 'permanent', 'london', 'manager']);
    const rw = roleWords.filter(w => !stop.has(w));
    const lc = cv.toLowerCase();
    const titleHit = rw.length ? Math.round(100 * rw.filter(w => lc.includes(w)).length / rw.length) : 50;
    const quantScore = Math.min(100, quant * 2); // 50%+ of bullets with a number = full marks
    const kwScore = kws.length ? cov.pct : 50;
    const score = Math.round(kwScore * 0.6 + fmt * 0.2 + quantScore * 0.1 + titleHit * 0.1);
    return { score, parts: { keywords: kwScore, format: fmt, results: quantScore, title: titleHit }, hit: cov.hit, miss: cov.miss, checks, quantified: quant, bullets: bullets.length, titleHit, kwCount: kws.length };
  }

  async function scanView(root) {
    const masters = await S.listMasters();
    const apps = (await S.listApps()).filter(a => (a.jd || '').trim().length > 150).slice(0, 40);
    const last = S.local.get('cvt.scan', {}) || {};
    root.innerHTML = String(html`
      <header class="page-head"><div><p class="eyebrow">Free · instant · no AI needed</p><h1>CV scanner</h1></div>
        <div class="row gap wrap"><a class="btn ghost" href="#/home">What Applywise does</a></div></header>
      <div class="scan-grid">
        <section class="panel">
          <div class="panel-head"><h2>1. The advert</h2></div>
          ${apps.length ? html`<label class="field"><span>Use an advert from your pipeline</span><select id="sc-app"><option value="">Paste one below instead</option>${apps.map(a => html`<option value="${a.id}">${a.role || 'Role'}${a.company ? ' · ' + a.company : ''}</option>`)}</select></label>` : ''}
          <label class="field"><span>Job title</span><input id="sc-role" type="text" value="${last.role || ''}" placeholder="e.g. SAP Ariba Solution Architect"></label>
          <label class="field"><span>Paste the full advert</span><textarea id="sc-jd" rows="12" placeholder="Paste the whole job description: duties, requirements and nice-to-haves.">${last.jd || ''}</textarea></label>
          <div class="panel-head"><h2>2. Your CV</h2></div>
          ${masters.length ? html`<label class="field"><span>CV to scan</span><select id="sc-cv">${masters.map(m => html`<option value="${m.id}" ${m.isDefault ? raw('selected') : ''}>${m.name}${m.isDefault ? ' (default)' : ''}</option>`)}</select></label>
            <button class="btn primary" id="sc-go" type="button">Scan my CV</button>`
          : html`<p class="hint">Upload your Word CV in <a class="link" href="#/profile">Career profile</a> first.</p>`}
        </section>
        <section class="panel" id="sc-out" aria-live="polite"><p class="hint">Your ATS match score appears here: how many of the advert's skills your CV shows, whether an applicant tracking system can read it, how many of your bullets prove results with numbers, and whether your CV uses the job's title words.</p></section>
      </div>`);
    const appSel = $('#sc-app', root);
    if (appSel) appSel.addEventListener('change', async () => { const a = appSel.value ? await S.getApp(appSel.value) : null; if (a) { $('#sc-jd', root).value = a.jd || ''; $('#sc-role', root).value = a.role || ''; if (a.masterId && $('#sc-cv', root)) $('#sc-cv', root).value = a.masterId; } });
    const go = $('#sc-go', root);
    if (!go) return;
    go.addEventListener('click', async () => {
      const jd = $('#sc-jd', root).value.trim(), role = $('#sc-role', root).value.trim();
      if (jd.length < 150) return toast('Paste the full advert (at least a few lines)', 'warn');
      S.local.set('cvt.scan', { jd: jd.slice(0, 20000), role });
      go.disabled = true; go.textContent = 'Scanning…';
      try {
        const mm = await masterModel($('#sc-cv', root).value);
        const r = await scan(jd, mm.model, role);
        drawResult($('#sc-out', root), r, { jd, role, masterId: $('#sc-cv', root).value });
      } catch (e) { toast(e.message, 'bad'); }
      go.disabled = false; go.textContent = 'Scan again';
    });
  }

  function drawResult(box, r, src) {
    const bar = (label, v, hint) => html`<div class="sc-part"><div class="row"><span>${label}</span><span class="grow-s"></span><strong>${v}</strong></div><div class="sc-bar"><i class="${scoreCls(v)}" style="width:${v}%"></i></div><p class="muted small">${hint}</p></div>`;
    const verdict = r.score >= 75 ? 'Strong match: tailor lightly and apply.' : r.score >= 55 ? 'Good base: tailoring will lift it.' : 'Weak match as it stands: tailor carefully, or skip if the gaps are real.';
    box.innerHTML = String(html`
      <div class="sc-head">${gauge(r.score)}<div><h2>ATS match ${r.score}/100</h2><p class="small">${verdict}</p></div></div>
      ${bar('Skills from the advert on your CV', r.parts.keywords, r.kwCount ? `${r.hit.length} of ${r.kwCount} skills found (60% of the score)` : 'No known skills found in the advert text (60%)')}
      ${bar('ATS-readable format', r.parts.format, 'Contact details, headings, length, text boxes (20%)')}
      ${bar('Results with numbers', r.parts.results, `${r.quantified}% of ${r.bullets} bullets show a number, %, £ or scale (10%)`)}
      ${bar('Job title words on your CV', r.parts.title, 'Recruiters and ATS search on the title (10%)')}
      ${r.miss.length ? html`<h3 class="mt">Missing from your CV</h3><div class="kw">${r.miss.map(k => html`<span class="chip bad">${k}</span>`)}</div><p class="muted small">If you really have one of these, add it to your CV or to Skills in <a class="link" href="#/profile">Career profile</a>; never add what you haven't done.</p>` : ''}
      ${r.hit.length ? html`<details class="mt"><summary>Found on your CV (${r.hit.length})</summary><div class="kw">${r.hit.map(k => html`<span class="chip ok">${k}</span>`)}</div></details>` : ''}
      <h3 class="mt">Format checks</h3>
      <ul class="sc-checks">${r.checks.map(c => html`<li class="${c.status}"><strong>${c.title}</strong><span class="muted small"> · ${c.detail}</span></li>`)}</ul>
      <div class="row gap wrap mt"><button class="btn primary" type="button" id="sc-tailor">Tailor my CV for this advert</button></div>`);
    $('#sc-tailor', box).addEventListener('click', async () => {
      const a = S.newApp(src.masterId); a.jd = src.jd; a.role = src.role || ''; await S.saveApp(a);
      window.CVT.app.go(`#/app/${a.id}/job`);
    });
  }

  // =====================================================================
  // 2. APPLY QUEUE (Review mode)
  // =====================================================================
  const QKEY = 'cvt.queue';
  const queue = () => { try { return S.local.get(QKEY, []) || []; } catch (_) { return []; } };
  const setQueue = q => S.local.set(QKEY, [...new Set(q)].slice(0, 10));
  function toggleQueue(key) { const q = queue(); setQueue(q.includes(key) ? q.filter(k => k !== key) : q.concat(key)); return queue().includes(key); }

  /** Sticky bar on the Jobs page. */
  function queueBar(root) {
    let bar = $('#q-bar', root);
    const q = queue();
    if (!bar) { bar = document.createElement('div'); bar.id = 'q-bar'; bar.className = 'q-bar'; root.append(bar); }
    bar.hidden = !q.length;
    bar.innerHTML = q.length ? String(html`<span><strong>${q.length}</strong> job${q.length === 1 ? '' : 's'} in your apply queue</span><span class="grow-s"></span>
      <button class="btn ghost small" type="button" data-q="clear">Clear</button>
      <button class="btn primary small" type="button" data-q="prep">Prepare kits for review →</button>`) : '';
    bar.onclick = e => {
      const b = e.target.closest('[data-q]'); if (!b) return;
      if (b.dataset.q === 'clear') { setQueue([]); $$('[data-j="queue"]', root).forEach(x => { x.setAttribute('aria-pressed', 'false'); x.textContent = '+ Queue'; }); queueBar(root); }
      if (b.dataset.q === 'prep') { window.CVT._runQueue = true; window.CVT.app.go('#/autopilot'); }
    };
  }

  // =====================================================================
  // 3. LANDING PAGE
  // =====================================================================
  async function homeView(root) {
    const [apps, masters] = await Promise.all([S.listApps(), S.listMasters()]);
    let jobs = 0; try { jobs = (await J().top(500)).items.length; } catch (_) {}
    const applied = apps.filter(a => !['Saved', 'Tailored'].includes(a.status)).length;
    const tailored = apps.filter(a => a.analysis && !a.analysis.legacy).length;
    const interviews = apps.filter(a => /Interview|Offer/.test(a.status || '')).length;
    const step = (n, t, d, href, cta) => html`<li class="hm-step"><span class="hm-n">${n}</span><h3>${t}</h3><p>${d}</p>${href ? html`<a class="link" href="${href}">${cta} →</a>` : ''}</li>`;
    const feat = (ic, t, d, href) => html`<a class="hm-feat" href="${href}"><span class="hm-ic" aria-hidden="true">${ic}</span><strong>${t}</strong><span>${d}</span></a>`;
    const row = (f, us, them) => html`<tr><td>${f}</td><td class="ok-text">${us}</td><td>${them}</td></tr>`;
    const faq = (q, a) => html`<details class="hm-faq"><summary>${q}</summary><p>${a}</p></details>`;
    root.innerHTML = String(html`
      <section class="hm-hero">
        <p class="eyebrow">Free job-search co-pilot · your data stays in your browser</p>
        <h1>Land the right role with a CV written for every job, <span class="hm-accent">without paying for credits</span></h1>
        <p class="hm-sub">Applywise finds matching jobs, scores them against your CV, tailors your own Word CV and cover letter, prepares you for the interview and reminds you to follow up. You stay in control: it never applies or sends anything without your click.</p>
        <div class="row gap wrap"><a class="btn primary" href="${masters.length ? '#/jobs' : '#/profile'}">${masters.length ? 'Find jobs for me' : 'Upload my CV to start'}</a><a class="btn ghost" href="#/scan">Scan my CV free</a></div>
        <div class="hm-stats">
          <div><strong>${jobs}</strong><span>jobs found for you</span></div>
          <div><strong>${tailored}</strong><span>CVs tailored</span></div>
          <div><strong>${applied}</strong><span>applications sent</span></div>
          <div><strong>${interviews}</strong><span>interviews and offers</span></div>
        </div>
      </section>
      <section class="panel"><div class="panel-head"><h2>How it works</h2></div>
        <ol class="hm-steps">
          ${step(1, 'Upload your CV once', 'Your Word CV stays the template: layout, fonts and wording are kept.', '#/profile', 'Career profile')}
          ${step(2, 'Get matched jobs', 'Indeed, your Gmail job alerts and the job robot, scored against your CV. Queue the ones you like.', '#/jobs', 'Jobs for you')}
          ${step(3, 'Review, then apply yourself', 'A tailored CV, cover letter, recruiter note and form answers per job. You check them and press apply.', '#/autopilot', 'Apply queue')}
        </ol></section>
      <section class="panel"><div class="panel-head"><h2>Everything in one place</h2></div>
        <div class="hm-feats">
          ${feat('🎯', 'CV scanner', 'Instant ATS match score and missing skills for any advert.', '#/scan')}
          ${feat('✍️', 'CV tailoring', 'A senior CV writer maps every duty and requirement to your experience.', '#/new')}
          ${feat('📄', 'Cover letters', 'In your voice, from your real achievements.', '#/pipeline')}
          ${feat('🧺', 'Apply queue', 'Tick jobs, get a kit for each, review them one by one.', '#/jobs')}
          ${feat('🎤', 'Mock interviews', 'Spoken practice with feedback, story bank and drill cards.', '#/prep')}
          ${feat('🗂️', 'Interview cue cards', 'One-screen revision sheet per job before you walk in.', '#/pipeline')}
          ${feat('🧠', 'Thinking maps', 'Mind maps, SWOT and gap plans for each job.', '#/pipeline')}
          ${feat('📬', 'Follow-ups', 'Chasers and thank-you notes ready when they are due.', '#/dashboard')}
        </div></section>
      <section class="panel"><div class="panel-head"><h2>Applywise compared with paid "auto-apply" tools</h2></div>
        <div class="table-wrap"><table class="list hm-cmp"><thead><tr><th></th><th>Applywise</th><th>Typical paid auto-apply tools</th></tr></thead><tbody>
          ${row('Price', 'Free; uses free AI engines', 'Monthly subscription, often with credits per application')}
          ${row('Who presses apply', 'You, after reviewing each kit', 'The tool, often in bulk')}
          ${row('CV format', 'Your own Word CV, layout kept', 'Their template')}
          ${row('Where your data lives', 'In your browser', 'On their servers')}
          ${row('Senior-level writing', 'Seniority-aware writer and recruiter check', 'Often generic')}
          ${row('Gmail and LinkedIn alerts', 'Read from your own Gmail (optional)', 'Varies')}
        </tbody></table></div>
        <p class="muted small">Bulk auto-applying can send applications to roles that don't fit and can't be taken back. Applywise prepares the work so applying properly takes minutes, not an hour.</p></section>
      <section class="panel"><div class="panel-head"><h2>Questions</h2></div>
        ${faq('Is it really free?', 'Yes. Applywise uses free AI engines you choose in Settings (Puter, a free Google Gemini key or Chrome’s built-in AI). There are no credits and nothing to buy.')}
        ${faq('Will it apply to jobs for me?', 'No, on purpose. It prepares everything and can fill forms for you to check, but you always press the final button. That keeps quality high and avoids embarrassing mistakes.')}
        ${faq('Does it change my CV layout?', 'No. It edits the text inside your own Word file, so fonts, columns and styling stay exactly as you designed them.')}
        ${faq('Where is my data?', 'In this browser on this device. You can export or delete it from Settings at any time.')}
        ${faq('Can it make things up?', 'It is instructed not to. New points not backed by your CV start unticked, and the Fit tab shows the evidence for every requirement.')}
      </section>`);
  }

  // =====================================================================
  // 4. INTERVIEW CUE CARDS
  // =====================================================================
  async function cueCards(a) {
    const iv = a.interview || {}, an = a.analysis && !a.analysis.legacy ? a.analysis : {};
    const stories = window.CVT.prep && window.CVT.prep.storiesForJob ? window.CVT.prep.storiesForJob(a, (await S.getKV('stories', [])) || [], 4).map(x => x.s) : [];
    let cv = ''; try { cv = await window.CVT.engine.cvText(a); } catch (_) {}
    const numbers = [...new Set(cv.split('\n').map(l => l.trim()).filter(l => l.length > 30 && l.length < 260 && isResult(l)))].slice(0, 6);
    const reqs = (an.requirements || []).filter(r => r && r.type === 'must').sort((x, y) => (x.evidence === 'gap') - (y.evidence === 'gap')).slice(0, 6);
    const reqList = reqs.length ? reqs : (an.requirements || []).slice(0, 6);
    const qs = (iv.questions || []).slice(0, 6);
    return String(html`
      <div class="cue">
        <header class="cue-head"><div><p class="eyebrow">Cue cards · read 10 minutes before</p><h2>${a.role || 'Role'}${a.company ? ' · ' + a.company : ''}</h2>
          ${a.interviewAt ? html`<p class="small">Interview ${new Date(a.interviewAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>` : ''}</div>
          <div class="row gap no-print"><button class="btn ghost small" type="button" data-cue="print">Print / PDF</button><button class="btn primary small" type="button" data-cue="close">Close</button></div></header>
        <div class="cue-grid">
          <section class="cue-card wide"><h3>My 60-second pitch</h3><p>${iv.pitch || 'Prepare the Interview tab first to get your pitch.'}</p></section>
          <section class="cue-card"><h3>What they need → my proof</h3><ul>${reqList.length ? reqList.map(r => html`<li><strong>${r.req || ''}</strong> <span class="chip ${r.evidence === 'direct' ? 'ok' : r.evidence === 'gap' ? 'bad' : 'warn'}">${r.evidence === 'direct' ? 'shown' : r.evidence === 'gap' ? 'gap' : 'related'}</span>${r.note ? html`<br><span class="muted small">${r.note}</span>` : ''}</li>`) : html`<li class="muted">Analyse the job to see requirements.</li>`}</ul></section>
          <section class="cue-card"><h3>Numbers to drop in</h3><ul>${numbers.length ? numbers.map(n => html`<li>${n}</li>`) : html`<li class="muted">Add results with numbers to your CV.</li>`}</ul></section>
          <section class="cue-card"><h3>My stories (STAR)</h3>${stories.length ? stories.map(s => html`<p><strong>${s.title || 'Story'}</strong><br><span class="small">${[s.situation, s.action, s.result].filter(Boolean).join(' → ').slice(0, 260)}</span></p>`) : html`<p class="muted small">Add stories in Interview prep → Story bank.</p>`}</section>
          <section class="cue-card"><h3>Likely questions</h3><ol>${qs.length ? qs.map(q => html`<li>${q.q}</li>`) : html`<li class="muted">Prepare the Interview tab first.</li>`}</ol></section>
          <section class="cue-card"><h3>Gaps: how I'll answer</h3><ul>${(iv.gaps || []).slice(0, 4).map(g => html`<li><strong>${g.gap}</strong> · ${g.how}</li>`)}${(iv.gaps || []).length ? '' : html`<li class="muted">No major gaps listed.</li>`}</ul></section>
          <section class="cue-card"><h3>Questions I'll ask</h3><ul>${(iv.ask_them || []).slice(0, 4).map(t => html`<li>${t}</li>`)}${(iv.ask_them || []).length ? '' : html`<li>What does success look like in the first 90 days?</li><li>What is the biggest challenge for the team right now?</li>`}</ul></section>
          <section class="cue-card"><h3>Revise</h3><p>${(iv.topics || an.job_technologies || []).slice(0, 10).join(' · ') || '—'}</p></section>
        </div>
      </div>`);
  }
  async function openCueCards(a) {
    let ov = document.getElementById('cue-overlay');
    if (!ov) { ov = document.createElement('div'); ov.id = 'cue-overlay'; ov.className = 'cue-overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Interview cue cards'); document.body.append(ov); }
    ov.innerHTML = await cueCards(a);
    ov.hidden = false; document.body.classList.add('cue-open');
    const close = () => { ov.hidden = true; document.body.classList.remove('cue-open'); document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    ov.onclick = e => { const b = e.target.closest('[data-cue]'); if (!b) { if (e.target === ov) close(); return; } if (b.dataset.cue === 'close') close(); if (b.dataset.cue === 'print') window.print(); };
    const f = ov.querySelector('[data-cue="close"]'); if (f) f.focus();
  }

  window.CVT = window.CVT || {};
  window.CVT.aitools = { scan, scanView, homeView, cueCards, openCueCards, queue, setQueue, toggleQueue, queueBar };
})();
