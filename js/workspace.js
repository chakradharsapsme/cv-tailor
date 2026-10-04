/* workspace.js — one job application: Job, Fit, CV, Letter, Outreach, Interview, Apply, My questions, Community. */
(function () {
  const { html, raw, esc, $, $$, toast, download, copy, today, ukDate, daysBetween, slug, VERDICT, scoreCls, gauge, progress, state, masterModel } = window.CVT.ui;
  const S = window.CVT.store, A = window.CVT.agent, D = window.CVT.docx;
  const TABS = [
    ['job', 'Job'], ['fit', 'Fit & decision'], ['cv', 'CV'], ['compare', 'Compare CVs'], ['letter', 'Cover letter'],
    ['outreach', 'Outreach'], ['interview', 'Interview prep'], ['docs', 'Documents'], ['apply', 'Apply'], ['myqs', 'My questions'], ['atlas', '🗺 Solution Atlas'], ['community', '🌐 Community']
  ];
  const opts = (list, cur) => list.map(o => html`<option value="${o}" ${o === cur ? raw('selected') : ''}>${o || '—'}</option>`);

  // ---------- tailoring helpers ----------
  const paraById = (mm, id) => mm.model.paras.find(p => p.id === id);
  const normT = t => String(t || '').toLowerCase().replace(/s\/4\s*hana/g, 's4hana').replace(/[^a-z0-9+#.]+/g, ' ').trim();
  const editText = (e, p) => Array.isArray(e.segments) ? e.segments.join('') : typeof e.text === 'string' ? e.text : p.text;

  const words = t => String(t).toLowerCase().replace(/[^\p{L}\p{N}&/+.-]+/gu, ' ').split(' ').map(w => w.replace(/^[.\-]+|[.\-]+$/g, '')).filter(Boolean);
  /** True when every original word survives, in order: the edit only inserts. */
  function insertOnly(orig, next) {
    const a = words(orig), b = words(next);
    let i = 0;
    for (const w of b) { if (i < a.length && w === a[i]) i++; }
    return i === a.length;
  }

  function prepareDecisions(a, mm) {
    const r = a.analysis;
    const seen = new Set();
    r.edits = r.edits.filter(e => { const p = paraById(mm, e.id); if (!p || p.locked || seen.has(e.id) || editText(e, p) === p.text) return false; seen.add(e.id); return true; });
    r.remove = r.remove.filter(x => { const p = paraById(mm, x.id); return p && D.canRemove(p); });
    r.reorder = r.reorder.filter(o => Array.isArray(o.ids) && o.ids.length > 1 && o.ids.every(id => paraById(mm, id)));
    a.decisions = {};
    r.edits.forEach(e => {
      const p = paraById(mm, e.id), t = editText(e, p);
      e.insertOnly = insertOnly(p.text, t);
      // Safe insertions backed by the CV or profile start ticked; rewrites and unproven skills wait for you.
      a.decisions['e' + e.id] = { on: e.insertOnly && e.basis !== 'unconfirmed', text: t };
    });
    // New bullets go after an unlocked bullet; ones backed by the CV or profile start ticked.
    r.new_bullets = (r.new_bullets || []).filter(b => { const p = paraById(mm, Number(b.after)); return p && !p.locked && p.isList && String(b.text || '').trim(); });
    r.new_bullets.forEach((b, i) => { b.after = Number(b.after); a.decisions['n' + i] = { on: b.basis === 'cv' || b.basis === 'profile', text: String(b.text).trim() }; });
    r.reorder.forEach((o, i) => { a.decisions['o' + i] = { on: false }; });
    r.remove.forEach(x => { a.decisions['r' + x.id] = { on: false }; });
  }

  function planOf(a, mm) {
    const r = a.analysis || {}, d = a.decisions || {};
    const edits = [];
    (r.edits || []).forEach(e => {
      const x = d['e' + e.id]; if (!x || !x.on) return;
      const p = paraById(mm, e.id); if (!p) return;
      if (!x.manual && Array.isArray(e.segments) && e.segments.length === p.segments.length) edits.push({ id: e.id, segments: e.segments });
      else edits.push({ id: e.id, text: x.text });
    });
    const adds = (r.new_bullets || []).map((b, i) => ({ b, x: d['n' + i] })).filter(o => o.x && o.x.on && String(o.x.text || '').trim()).map(o => ({ after: o.b.after, text: o.x.text.trim() }));
    return {
      edits, adds,
      reorder: (r.reorder || []).filter((o, i) => d['o' + i] && d['o' + i].on).map(o => o.ids),
      remove: (r.remove || []).filter(x => d['r' + x.id] && d['r' + x.id].on).map(x => x.id)
    };
  }

  async function tailored(a, mm) {
    const res = await D.buildTailored(mm.master.data.slice(0), planOf(a, mm));
    const model = await D.load(await res.blob.arrayBuffer());
    return Object.assign(res, { model, text: D.plainText(model) });
  }

  function termsOf(text) {
    const out = new Set();
    (text.match(/\b\d[\d,.]*\s*(?:%|k|m|bn|\+)?/gi) || []).forEach(n => out.add(n.replace(/[\s,]/g, '').toLowerCase()));
    (text.match(/\b(?:[A-Z]{2,}[A-Za-z0-9/&+-]*|[A-Z][a-z]+[A-Z][A-Za-z]*|S\/4\w*)\b/g) || []).forEach(t => out.add(t.toLowerCase()));
    return out;
  }
  function flagsFor(oldText, newText, ctx) {
    const flags = [];
    const oldT = termsOf(oldText);
    for (const t of termsOf(newText)) {
      if (oldT.has(t) || ctx.known.has(t)) continue;
      if (/^\d/.test(t)) flags.push({ cls: 'bad', text: `New number “${t}” isn't in your CV or profile` });
      else if (ctx.jd.has(t)) flags.push({ cls: 'warn', text: `“${t}” comes from the job ad. Keep it only if true` });
      else flags.push({ cls: 'warn', text: `“${t}” isn't in your CV or profile` });
    }
    if (newText.length > Math.min(oldText.length * 1.35, oldText.length + 120) + 5) flags.push({ cls: 'warn', text: `Longer than the original (${oldText.length} → ${newText.length} chars)` });
    return flags;
  }

  function wordDiff(a, b) {
    const A1 = a.split(/(\s+|[,.;:()])/).filter(Boolean), B1 = b.split(/(\s+|[,.;:()])/).filter(Boolean);
    const n = A1.length, m = B1.length;
    if (n * m > 250000) return [{ t: 'del', s: a }, { t: 'ins', s: b }];
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A1[i] === B1[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = []; let i = 0, j = 0;
    const push = (t, s) => { const l = out[out.length - 1]; if (l && l.t === t) l.s += s; else out.push({ t, s }); };
    while (i < n && j < m) {
      if (A1[i] === B1[j]) { push('eq', A1[i]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) push('del', A1[i++]);
      else push('ins', B1[j++]);
    }
    while (i < n) push('del', A1[i++]);
    while (j < m) push('ins', B1[j++]);
    return out;
  }
  const diffHtml = (a, b) => html`<div class="diff">${wordDiff(a, b).map(p => p.t === 'eq' ? p.s : p.t === 'ins' ? html`<ins>${p.s}</ins>` : html`<del>${p.s}</del>`)}</div>`;

  const letterPlain = t => (t || '').replace(/^\*\*(.+)\*\*$/gm, '$1');
  function letterBlocks(text) {
    const blocks = [];
    const chunks = (text || '').replace(/\r/g, '').split(/\n\s*\n/);
    chunks.forEach((chunk, ci) => {
      chunk.split('\n').filter(l => l.trim()).forEach(line => {
        const m = line.trim().match(/^\*\*(.+)\*\*$/);
        blocks.push(m ? { text: m[1], bold: true } : { text: line.trim() });
      });
      if (ci < chunks.length - 1) blocks.push({ text: '' });
    });
    return blocks;
  }
  const fileBase = a => `${slug(a.company)}_${slug(a.role)}`;
  const stamp = () => today().replace(/-/g, '');

  // =====================================================================
  async function workspace(root, id, tab) {
    let a = id === 'new' ? null : await S.getApp(id);
    if (!a) { root.innerHTML = String(html`<div class="panel"><h1>Application not found</h1><p><a class="link" href="#/pipeline">Back to pipeline</a></p></div>`); return; }
    tab = TABS.some(t => t[0] === tab) ? tab : 'job';
    const [profile, masters, allApps] = await Promise.all([S.getProfile(), S.listMasters(), S.listApps()]);
    const dups = a.role ? window.CVT.jobs.duplicates({ title: a.role, company: a.agency || a.company }, allApps, a.id).concat(a.agency ? window.CVT.jobs.duplicates({ title: a.role, company: a.company }, allApps, a.id) : []) : [];
    const an = a.analysis && !a.analysis.legacy ? a.analysis : null;
    const v = an && VERDICT[an.decision && an.decision.verdict];
    let saveTimer;
    const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => S.saveApp(a), 400); };
    const saveNow = async () => { clearTimeout(saveTimer); await S.saveApp(a); };
    const go = t => window.CVT.app.go(`#/app/${a.id}/${t}`);

    root.innerHTML = String(html`
      <header class="ws-head">
        <div class="ws-title">
          <a class="crumb" href="#/pipeline">Pipeline</a>
          <h1>${a.role || 'New application'}${a.company ? html` <span class="at">at ${a.company}</span>` : ''}</h1>
          <div class="chips">${an ? html`<span class="chip ${scoreCls(an.fit.score)}">Fit ${an.fit.score}</span>` : ''}${v ? html`<span class="chip ${v.cls}">${v.label}</span>` : ''}${a.contractType ? html`<span class="chip muted">${a.contractType}</span>` : ''}${a.appliedAt ? html`<span class="chip muted">Applied ${ukDate(a.appliedAt)}</span>` : ''}</div>
        </div>
        <div class="ws-actions">
          <label class="inline-field">Status <select id="ws-status">${opts(S.STATUSES, a.status)}</select></label>
          <button class="btn primary small ask-btn" id="ws-ask" type="button" title="Ask anything about this job, company or your CV">✦ Ask AI</button>
          <button class="btn ghost small danger" id="ws-delete" type="button">Delete</button>
        </div>
      </header>
      <div class="next-bar">
        <span class="next-label">Next action</span>
        <input id="nx-text" type="text" value="${a.next ? a.next.text : ''}" placeholder="e.g. Chase recruiter about feedback" aria-label="Next action">
        <input id="nx-due" type="date" value="${a.next ? a.next.due : ''}" aria-label="Due date">
        ${a.next ? html`<button class="icon-btn" id="nx-clear" type="button" title="Mark done" aria-label="Mark done">✓</button>` : ''}
      </div>
      ${dups.length ? html`<div class="dup-bar" role="note"><strong>Possible duplicate.</strong> This looks like ${[...new Map(dups.map(d => [d.app.id, d])).values()].map((d, i) => html`${i ? ', ' : ''}<a class="link" href="#/app/${d.app.id}/job">${d.app.role} at ${d.app.company || 'unknown'}</a> (${d.app.status.toLowerCase()})`)}. Being put forward twice, for example by two agencies, can rule you out. Check before applying.</div>` : ''}
      <nav class="ws-tabs" aria-label="Application sections">${TABS.map(([k, label]) => html`<a href="#/app/${a.id}/${k}" ${k === tab ? raw('aria-current="page"') : ''}>${label}</a>`)}</nav>
      <div class="ws-body" id="ws-body"></div>`);

    // header interactions
    $('#ws-status', root).addEventListener('change', async e => {
      S.setStatus(a, e.target.value); await saveNow();
      toast(`Status: ${a.status}` + (a.next ? ` · next: ${a.next.text.toLowerCase()} by ${ukDate(a.next.due)}` : ''));
      window.CVT.app.rerender();
    });
    $('#ws-ask', root).addEventListener('click', () => window.CVT.assistant.open(a.id));
    $('#ws-delete', root).addEventListener('click', async e => {
      const b = e.currentTarget;
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Click to delete'; return; }
      await S.removeApp(a.id); toast('Application deleted'); window.CVT.app.go('#/pipeline');
    });
    const nxSave = () => {
      const text = $('#nx-text', root).value.trim(), due = $('#nx-due', root).value;
      a.next = text || due ? { text: text || 'Follow up', due: due || S.addDays(today(), 3) } : null;
      saveSoon();
    };
    $('#nx-text', root).addEventListener('change', nxSave);
    $('#nx-due', root).addEventListener('change', nxSave);
    const clr = $('#nx-clear', root);
    if (clr) clr.addEventListener('click', async () => { a.next = null; await saveNow(); toast('Marked done'); window.CVT.app.rerender(); });

    const body = $('#ws-body', root);
    const ctx = { a, an, profile, masters, body, saveSoon, saveNow, go, root };
    await ({ job: tabJob, fit: tabFit, cv: tabCv, compare: tabCompare, letter: tabLetter, outreach: tabOutreach, interview: tabInterview, docs: c => window.CVT.docs.tab(c), apply: tabApply, atlas: c => {
      c.body.innerHTML = '<section class="panel atlas" id="atl-app"></section><section class="panel thinkmap" id="tm-app"></section>';
      let tm = null;
      const at = window.CVT.atlas ? window.CVT.atlas.render(c.body.querySelector('#atl-app'), c.a, () => c.saveNow(), () => tm && tm.refresh()) : null;
      tm = window.CVT.thinkmap ? window.CVT.thinkmap.render(c.body.querySelector('#tm-app'), c.a, () => c.saveNow(), { onAtlas: q => at && at.show(q) }) : null;
      return null;
    }, community: c => { c.body.innerHTML = '<section class="panel community" id="cm-app"></section>'; return window.CVT.community ? window.CVT.community.render(c.body.querySelector('#cm-app'), { app: c.a }) : null; }, myqs: c => window.CVT.myqs.tab(c) })[tab](ctx);
  }

  const needAnalysis = ctx => { ctx.body.innerHTML = String(html`<div class="empty-state"><h2>Analyse the job first</h2><p class="hint">Paste the job description on the Job tab and run the analysis. Everything else builds on it.</p><a class="btn primary" href="#/app/${ctx.a.id}/job">Go to Job</a></div>`); };

  // =====================================================================
  // JOB
  // =====================================================================
  async function tabJob(ctx) {
    const { a, body, masters } = ctx;
    const best = masters.length > 1 && (a.jd || '').length > 200 ? await window.CVT.jobs.bestCv({ title: a.role, jd: a.jd }).catch(() => null) : null;
    const f = (k, label, type = 'text', ph = '') => html`<label class="field"><span>${label}</span><input data-f="${k}" type="${type}" value="${a[k] || ''}" placeholder="${ph}" autocomplete="off"></label>`;
    body.innerHTML = String(html`
      <div class="job-grid">
        <section class="panel">
          <div class="panel-head"><h2>Job description</h2>${!a.jd ? html`<button class="btn ghost small" id="example" type="button">Load an example job</button>` : ''}</div>
          <p class="hint">Paste the advert. A full advert gives the best result, but two or three lines (or just the job title) are enough to start.</p>
          <label class="field"><span class="sr">Job description</span><textarea data-f="jd" id="jd" rows="18" placeholder="Paste the job description here, even a short one…">${a.jd}</textarea></label>
          <p class="hint short-hint" id="short-hint" hidden>Short advert: Applywise will fill in what this kind of role usually asks for and mark those points as typical, not from the advert.</p>
          <details class="resp-prev" id="resp-prev" ${(a.jd || '').trim() ? raw('open') : ''}><summary id="resp-sum">Responsibilities in this advert</summary><div id="resp-list"></div></details>
          <label class="field"><span>What to emphasise for this job (treated as true)</span><textarea data-f="emphasis" rows="3" placeholder="e.g. Ran Guided Buying for a regulated utility; can start in 4 weeks">${a.emphasis}</textarea></label>
          <div class="grid-2">
            <label class="field"><span>Master CV to tailor</span>
              <select data-f="masterId">${masters.length ? masters.map(m => html`<option value="${m.id}" ${(a.masterId ? a.masterId === m.id : m.isDefault) ? raw('selected') : ''}>${m.name}${m.isDefault ? ' (default)' : ''}${best && best.id === m.id ? ' · best match for this advert' : ''}</option>`) : html`<option value="">No CV yet: add one in Career profile</option>`}</select>
            </label>
            <label class="field"><span>Cover letter tone</span>
              <select data-f="tone">${opts(['Warm and direct', 'Formal and precise', 'Concise, for a contract role or recruiter'], a.tone)}</select>
            </label>
          </div>
          ${best && best.id !== (a.masterId || (masters.find(m => m.isDefault) || {}).id) ? html`<p class="hint best-cv">Your CV <strong>${best.name}</strong> shows more of this advert's skills (${best.hits} of ${best.of}). <button class="linkish" type="button" id="use-best" data-id="${best.id}">Use it for this job</button></p>` : ''}
          <div class="row gap wrap">
            <button class="btn primary" id="run" type="button">${a.analysis && !a.analysis.legacy ? 'Re-analyse and re-tailor' : 'Analyse fit and tailor CV'}</button>
            <button class="btn ghost" id="stop" type="button" hidden>Stop</button>
          </div>
          <label class="check-line small"><input type="checkbox" id="auto-letter" ${S.local.get('cvt.autoLetter', true) ? raw('checked') : ''}> Also write the cover letter automatically (in the tone chosen above)</label>
          <p class="hint bg-note" id="bg-note" hidden>This runs in the background. Carry on with other jobs or pages; you'll get a notice when it's ready.</p>
          <ol class="progress" id="prog" hidden></ol>
          <p class="error" id="err" role="alert" hidden></p>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Details</h2></div>
          <p class="hint">Filled in automatically from the advert where possible.</p>
          <div class="grid-2">
            ${f('company', 'Company')}${f('role', 'Role title')}
            <label class="field span-2"><span>Job link</span><input data-f="url" type="url" value="${a.url}" placeholder="https://www.linkedin.com/jobs/view/…">${a.url ? html`<a class="link small" href="${a.url}" target="_blank" rel="noopener">Open advert</a>` : ''}</label>
            ${f('location', 'Location')}
            <label class="field"><span>Work mode</span><select data-f="workMode">${opts(['', 'On-site', 'Hybrid', 'Remote'], a.workMode)}</select></label>
            <label class="field"><span>Type</span><select data-f="contractType">${opts(['', 'Permanent', 'Contract', 'Fixed-term'], a.contractType)}</select></label>
            ${f('pay', 'Salary / day rate', 'text', 'as advertised')}
            ${f('closing', 'Closing date', 'date')}
            ${f('hiringManager', 'Hiring manager')}
            ${f('recruiter', 'Recruiter')}
            ${f('agency', 'Agency')}
            ${f('recruiterEmail', 'Recruiter email', 'email')}
          </div>
          <label class="field"><span>Notes</span><textarea data-f="notes" rows="4" placeholder="Anything from calls, referrals, interview dates…">${a.notes}</textarea></label>
          <div class="intel-box" id="intel" hidden><div class="panel-head"><h3>Company intel</h3><button class="btn small ghost" id="intel-run" type="button">Look up on Indeed</button></div><div id="intel-out"><p class="hint">Reviews, size, interview experience and average pay for this role.</p></div></div>
        </section>
      </div>`);

    body.addEventListener('input', e => { const k = e.target.dataset.f; if (k) { a[k] = e.target.value; ctx.saveSoon(); } });
    body.addEventListener('change', e => { const k = e.target.dataset.f; if (k && e.target.tagName === 'SELECT') { a[k] = e.target.value; ctx.saveSoon(); } });
    window.CVT.jobs.available().then(ok => {
      const box = $('#intel', body); if (!ok || !box) return;
      box.hidden = false;
      $('#intel-run', body).addEventListener('click', async ev => {
        const btn = ev.currentTarget;
        const name = (a.company || '').replace(/\s*\(.*\)\s*$/, '').trim();
        if (!name) { toast('Add the company name first', 'warn'); return; }
        btn.disabled = true; $('#intel-out', body).innerHTML = '<p class="muted small">Asking Indeed…</p>';
        try { $('#intel-out', body).innerHTML = String(window.CVT.jobs.intelCard(await window.CVT.jobs.companyIntel(name, a.role))); }
        catch (e) { $('#intel-out', body).innerHTML = String(html`<p class="error small">${window.CVT.jobs.errText(e)}</p>`); btn.disabled = false; }
      });
    });
    const ex = $('#example', body);
    if (ex) ex.addEventListener('click', () => { const it = window.CVT.fields.current().id === 'it'; a.jd = it ? EXAMPLE_JD : EXAMPLE_GENERIC; a.company = a.company || (it ? 'Northgate Energy (fictional example)' : 'Brightside Services (fictional example)'); a.role = a.role || (it ? 'SAP Ariba Solution Architect' : 'Operations Team Leader'); ctx.saveNow().then(() => window.CVT.app.rerender()); });

    const T = window.CVT.tasks;
    $('#stop', body).addEventListener('click', () => T.stop(a.id));
    const ub = $('#use-best', body); if (ub) ub.addEventListener('click', async () => { a.masterId = ub.dataset.id; await ctx.saveNow(); toast('CV switched for this job'); window.CVT.app.rerender(); });
    const al = $('#auto-letter', body); if (al) al.addEventListener('change', () => S.local.set('cvt.autoLetter', al.checked));
    const STEPS = ['Reading your CV and profile', 'Senior CV writer fitting the job into your CV (1–2 min)', 'Recruiter review: fit, realism and your own voice', 'Writing your cover letter'];
    const shortHint = e => { const h = $('#short-hint', body); if (h) { const n = ((e && e.target ? e.target.value : a.jd) || '').trim().length; h.hidden = !(n > 0 && n < 600); } };
    $('#jd', body).addEventListener('input', shortHint); shortHint();
    // Shows which responsibilities were picked up from the advert: every one is carried into the analysis and the tailored CV.
    const respPrev = () => {
      const items = window.CVT.agent.advertItems(a.jd || ''), box = $('#resp-list', body), sum = $('#resp-sum', body);
      if (!box) return;
      const jd = (a.jd || '').trim(), by = k => items.filter(x => x.section === k).map(x => x.text);
      const G = [['resp', 'Responsibilities'], ['must', 'Must-haves'], ['nice', 'Nice-to-haves'], ['qual', 'Qualifications']].map(([k, l]) => [l, by(k)]).filter(g => g[1].length);
      sum.textContent = jd ? `Picked up from this advert: ${G.map(([l, v]) => v.length + ' ' + l.toLowerCase()).join(' · ') || 'nothing labelled yet'}` : 'What this advert asks for';
      box.innerHTML = String(!jd ? html`<p class="muted small">Paste the advert above: its responsibilities, must-haves, nice-to-haves and qualifications are listed here, and every one is mapped to your CV in the analysis.</p>`
        : html`${G.map(([l, v]) => html`<h4 class="resp-h">${l}</h4><ol class="resp-ol small">${v.map(x => html`<li>${x}</li>`)}</ol>`)}
          ${!by('resp').length ? html`<p class="warn-text small">No responsibilities section found in this text.${/Only the advert summary/.test(a.notes || '') || jd.length < 900 ? ' This looks like a summary only: open the full advert' : ' Check the full advert was pasted'}${a.url ? html` (<a class="link" href="${a.url}" target="_blank" rel="noopener">open advert</a>)` : ''} and paste it above. The AI still reads the duties from the text it has.</p>` : ''}
          <p class="muted small">All of these go to the analysis and each is mapped to your CV on the Fit tab; the AI also adds anything else it finds in the text.</p>`);
    };
    let respT = null;
    $('#jd', body).addEventListener('input', () => { clearTimeout(respT); respT = setTimeout(respPrev, 400); });
    respPrev();
    // Shows the background run (if any) for this job, and keeps it up to date while you stay on this page.
    let st = null;
    function paint() {
      const t = T.get(a.id), run = $('#run', body), stop = $('#stop', body);
      if (!run) return;
      const busy = !!(t && t.status === 'running');
      run.disabled = busy; stop.hidden = !busy;
      const bg = $('#bg-note', body); if (bg) bg.hidden = !busy;
      if (busy) { if (!st) st = progress($('#prog', body), t.steps); st.at(t.at); }
    }
    const onTasks = () => { if (!document.body.contains(body)) return document.removeEventListener('cvt-tasks', onTasks); paint(); };
    const onDone = e => {
      if (!document.body.contains(body)) return document.removeEventListener('cvt-task-done', onDone);
      if (e.detail.id !== a.id) return;
      document.removeEventListener('cvt-task-done', onDone); document.removeEventListener('cvt-tasks', onTasks);
      if (e.detail.ok) ctx.go('fit');
      else { const err = $('#err', body); if (st) st.fail(T.get(a.id) ? T.get(a.id).at : 0); err.textContent = e.detail.error === 'Stopped' ? 'Stopped.' : e.detail.error; err.hidden = false; paint(); }
    };
    document.addEventListener('cvt-tasks', onTasks); document.addEventListener('cvt-task-done', onDone);
    paint();

    $('#run', body).addEventListener('click', async () => {
      const err = $('#err', body); err.hidden = true;
      const jd = (a.jd || '').trim();
      if (jd.length < 15 && !(a.role || '').trim()) { err.textContent = 'Paste the advert, even two or three lines, or type the role title under Details.'; err.hidden = false; return; }
      if (!a.masterId && masters.length) a.masterId = (masters.find(m => m.isDefault) || masters[0]).id;
      const mm = await masterModel(a.masterId);
      if (!mm) { err.innerHTML = 'Add your master CV in <a class="link" href="#/profile">Career profile</a> first.'; err.hidden = false; return; }
      if (!(await window.CVT.ai.ensure('Analysing fit and tailoring your CV uses AI.', { big: true }))) {
        // Still useful without AI: which of the advert's skills your CV already shows.
        const J = window.CVT.jobs, want = [...new Set(J.termsIn(a.jd || ''))], have = new Set(J.termsIn(D.plainText(mm.model)));
        const hit = want.filter(t => have.has(t)), miss = want.filter(t => !have.has(t));
        err.innerHTML = String(html`<strong>${state.provider === 'chrome-ai' && state.key ? "Chrome's built-in AI is too small to tailor a CV, so it wasn't tailored." : "The AI is off, so the CV wasn't tailored."}</strong> <button class="linkish" type="button" id="eng-open">Choose a free AI</button>
          ${want.length ? html`<br>Quick check without AI: your CV shows <strong>${hit.length} of ${want.length}</strong> skills this advert asks for.${miss.length ? html` Not found on your CV: ${miss.slice(0, 10).join(', ')}.` : ''}` : ''}`);
        err.hidden = false;
        const eb = $('#eng-open', body); if (eb) eb.addEventListener('click', () => $('#run', body).click());
        return;
      }
      const autoLetter = $('#auto-letter', body) ? $('#auto-letter', body).checked : true;
      await ctx.saveNow();
      const title = `${a.role || 'This job'}${a.company ? ' at ' + a.company : ''}`;
      st = null;
      const ok = T.start({
        id: a.id, title, href: `#/app/${a.id}/fit`, steps: autoLetter ? STEPS : STEPS.slice(0, 3),
        work: async t => {
          t.step(0);
          t.step(1);
          const out = await engine.analyse(a, ctx.profile, t.signal, s => { if (s === 'review' || s === 'coverage' || s === 'humanise') t.step(2); });
          const title = `${a.role || 'This job'}${a.company ? ' at ' + a.company : ''}`; t.title(title);
          t.step(2);
          const verdict = out.decision && out.decision.verdict;
          if (autoLetter && verdict !== 'skip') {
            t.step(3);
            try { await engine.letter(a, ctx.profile); return `CV tailored and cover letter written: ${title}`; }
            catch (le) { if (le.name === 'AbortError') throw le; return `CV tailored: ${title}. The cover letter could not be written (${le.message}).`; }
          }
          return `CV tailored: ${title}`;
        }
      });
      if (!ok) toast('Already working on this job', 'warn');
      document.removeEventListener('cvt-tasks', onTasks); document.removeEventListener('cvt-task-done', onDone);
      document.addEventListener('cvt-tasks', onTasks); document.addEventListener('cvt-task-done', onDone);
      paint();
    });
  }

  // =====================================================================
  // FIT
  // =====================================================================
  /** The whole advert mapped to the CV: responsibilities, must-haves, nice-to-haves and qualifications. */
  function jobMap(a, an) {
    const refs = an.cv_refs || {};
    const EV = { direct: ['ok', 'Shown'], adjacent: ['warn', 'Partly'], gap: ['bad', 'Not shown'] };
    const TL = { edit: ['ok', 'Added to a bullet'], new_bullet: ['accent', 'New bullet'] };
    const where = r => { const ex = (r.cv_ids || []).map(id => refs[id]).filter(Boolean); return ex.length ? html`<div class="jm-where">“${ex[0]}${ex[0].length >= 160 ? '…' : ''}”${ex.length > 1 ? html` <span class="muted">+${ex.length - 1} more</span>` : ''}</div>` : ''; };
    const atl = t => window.CVT.atlas ? html` <button type="button" class="jm-atl" data-atlas="${window.CVT.atlas.termFor(typeof t === 'string' ? t : (t && t.text) || '', a)}" title="Open a mind map of this in Solution Atlas" aria-label="Mind map in Solution Atlas">🗺</button>` : '';
    const row = (text, ev, r, tl) => { const e = EV[ev] || EV.gap, t = TL[tl]; return html`<tr><td>${text}${atl(r.req || r.text)}${r.note ? html`<div class="muted small">${r.note}</div>` : ''}</td>
      <td><span class="chip ${e[0]}">${e[1]}</span>${where(r)}</td>
      <td>${t ? html`<span class="chip ${t[0]}">${t[1]}</span>${r.where ? html`<div class="muted small">under ${r.where}</div>` : ''}` : ev === 'gap' ? html`<span class="muted small">Not added</span>` : html`<span class="muted small">As it is</span>`}</td></tr>`; };
    const resp = Array.isArray(an.responsibilities) ? an.responsibilities : (window.CVT.agent.responsibilities(a.jd || '').map(t => ({ text: t, covered_by: '' })));
    const respEv = r => r.evidence || (r.covered_by === 'cv' ? 'direct' : r.covered_by === 'edit' || r.covered_by === 'new_bullet' ? 'gap' : r.covered_by === 'none' ? 'gap' : '');
    const reqs = an.requirements || [];
    const isQual = r => r.kind === 'qualification' || /\b(certif|certified|degree|qualification|diploma|accredit|licen[cs]e|PMP|PRINCE2|MBA|BSc|MSc)\b/i.test(r.req);
    const isResp = r => r.kind === 'responsibility' && resp.some(x => x.text && r.req && x.text.toLowerCase().slice(0, 40) === r.req.toLowerCase().slice(0, 40));
    const must = reqs.filter(r => r.type !== 'nice' && !isQual(r) && !isResp(r)), nice = reqs.filter(r => r.type === 'nice' && !isQual(r)), qual = reqs.filter(isQual);
    const all = [...resp.map(r => respEv(r)), ...reqs.map(r => r.evidence)];
    const n = k => all.filter(x => x === k).length;
    const group = (title, hint, rows) => rows.length ? html`<tr class="jm-group"><th colspan="3">${title} <span class="muted small">${hint}</span></th></tr>${rows}` : '';
    const legacy = !Array.isArray(an.responsibilities);
    return html`<section class="panel jm">
      <div class="panel-head"><h2>Job vs your CV</h2><span class="muted small">${n('direct')} shown · ${n('adjacent')} partly · ${n('gap')} not shown</span></div>
      <p class="hint">Everything the advert asks for, item by item, and where your CV shows it. "In your tailored CV" shows what Applywise added; new bullets you haven't confirmed stay unticked in the CV tab.${legacy ? html` This job was analysed before the full map was added: <a class="link" href="#/app/${a.id}/job">re-analyse</a> to map every item.` : ''}</p>
      <div class="table-wrap"><table class="list jm-table">
        <thead><tr><th>What the job asks for</th><th>Your CV</th><th>In your tailored CV</th></tr></thead>
        <tbody>
          ${group('Responsibilities', `${resp.length} duties`, resp.map(r => row(r.text, respEv(r), r, r.covered_by === 'edit' || r.covered_by === 'new_bullet' ? r.covered_by : '')))}
          ${group('Must-haves', `${must.length} essential`, must.map(r => row(r.req, r.evidence, r, r.tailored)))}
          ${group('Nice-to-haves', `${nice.length} desirable`, nice.map(r => row(r.req, r.evidence, r, r.tailored)))}
          ${group('Qualifications and certifications', `${qual.length}`, qual.map(r => row(html`${r.req} <span class="chip ${r.type === 'must' ? 'ink' : 'outline'}">${r.type === 'must' ? 'must' : 'nice'}</span>`, r.evidence, r, r.tailored)))}
        </tbody></table></div>
      ${n('gap') ? html`<p class="small warn-text">${n('gap')} item${n('gap') === 1 ? ' is' : 's are'} not shown in your CV. If you have done ${n('gap') === 1 ? 'it' : 'them'}, add a line to "What to emphasise" on the Job tab and re-analyse; otherwise prepare to discuss ${n('gap') === 1 ? 'it' : 'them'} at interview.</p>` : ''}
    </section>`;
  }

  async function tabFit(ctx) {
    const { a, an, body } = ctx;
    if (!an) return needAnalysis(ctx);
    const mm = await masterModel(a.masterId);
    let after = null;
    if (mm) { try { after = D.keywordCoverage((await tailored(a, mm)).text, an.keywords); } catch (_) {} }
    const before = mm ? D.keywordCoverage(D.plainText(mm.model), an.keywords) : null;
    const dec = an.decision || {}, v = VERDICT[dec.verdict] || { label: 'Assessed', cls: 'muted' };
    const bar = (label, val) => html`<div class="fit-bar"><span>${label}</span><div class="track"><div class="fill" style="width:${Math.max(0, Math.min(100, Number(val) || 0))}%"></div></div><span class="v">${Math.round(Number(val) || 0)}</span></div>`;
    const j = an.job || {};

    body.innerHTML = String(html`
      <section class="decision ${v.cls}">
        <div class="decision-main">
          <span class="decision-verdict">${v.label}</span>
          <p class="decision-head">${dec.headline || ''}</p>
          ${dec.angle ? html`<p class="decision-angle"><strong>Angle:</strong> ${dec.angle}</p>` : ''}
        </div>
        <div class="decision-lists">
          ${dec.reasons.length ? html`<div><h3>Why</h3><ul class="tight">${dec.reasons.map(r => html`<li>${r}</li>`)}</ul></div>` : ''}
          ${dec.red_flags.length ? html`<div><h3>Red flags</h3><ul class="tight flags-list">${dec.red_flags.map(r => html`<li>${r}</li>`)}</ul></div>` : html`<div><h3>Red flags</h3><p class="muted small">None spotted.</p></div>`}
        </div>
      </section>

      <div class="two-col">
        <section class="panel">
          <div class="score-row">${gauge(an.fit.score)}
            <div class="fit-bars">${bar('Core skills', an.fit.core)}${bar('Adjacent', an.fit.adjacent)}
              <p class="muted small">${[j.seniority, j.location, j.work_mode, j.contract_type, j.ir35 && j.ir35 !== 'n/a' && j.ir35 !== 'unknown' ? 'IR35 ' + j.ir35 : '', j.pay].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          ${j.summary ? html`<p class="summary">${j.summary}</p>` : ''}
          ${an.writer ? html`<div class="writer-note small"><strong>How your CV was tailored:</strong> written at <strong>${an.writer.level}</strong> level${an.writer.years != null ? html` (about ${an.writer.years} years)` : ''}${an.writer.target && an.writer.target !== 'Not stated' ? html` for a <strong>${an.writer.target}</strong> role` : ''}.
            ${an.writer.edits} insertion${an.writer.edits === 1 ? '' : 's'}${Object.keys(an.writer.newPerRole || {}).length ? html`; new bullets spread as ${Object.entries(an.writer.newPerRole).map(([r, n]) => `${r} ${n}`).join(', ')}` : ''}${an.writer.reorders || an.writer.removals ? html`; ${an.writer.reorders} reorder and ${an.writer.removals} trim suggestion${an.writer.removals === 1 ? '' : 's'} to keep it balanced (optional, on the CV tab)` : ''}.</div>` : ''}
        </section>
        <section class="panel">
          <div class="panel-head"><h2>ATS keywords</h2>${before && after ? html`<span class="cov"><span class="muted">${before.pct}%</span> → <strong class="${scoreCls(after.pct)}-text">${after.pct}%</strong></span>` : ''}</div>
          <p class="hint">Exact terms an applicant tracking system will scan for. Coverage is your master CV before and after the accepted changes.</p>
          <div class="kw">${(after ? after.hit : []).map(k => html`<span class="chip ok">${k}</span>`)}${(after ? after.miss : an.keywords).map(k => html`<span class="chip bad">${k}</span>`)}</div>
          ${an.keywords_missing.length ? html`<p class="small muted">Can't truthfully claim: ${an.keywords_missing.join(', ')}. Address these in the letter or at interview instead.</p>` : ''}
        </section>
      </div>

      ${jobMap(a, an)}

      ${an.talking_points.length ? html`<section class="panel"><div class="panel-head"><h2>Talking points</h2></div><ul class="tight">${an.talking_points.map(t => html`<li>${t}</li>`)}</ul></section>` : ''}

      <div class="next-steps">
        <a class="btn primary" href="#/app/${a.id}/cv">Review CV changes</a>
        <a class="btn ghost" href="#/app/${a.id}/letter">Cover letter</a>
        <a class="btn ghost" href="#/app/${a.id}/outreach">Outreach</a>
      </div>`);
    body.addEventListener('click', async e => { const b = e.target.closest('[data-atlas]'); if (!b) return; a.atlasQ = b.dataset.atlas; await ctx.saveNow(); ctx.go('atlas'); });
  }

  // =====================================================================
  // CV
  // =====================================================================
  async function tabCv(ctx) {
    const { a, an, body, profile } = ctx;
    const mm = await masterModel(a.masterId);
    if (!mm) { body.innerHTML = String(html`<div class="empty-state"><h2>No master CV yet</h2><p class="hint">Upload your Word CV in Career profile.</p><a class="btn primary" href="#/profile">Career profile</a></div>`); return; }
    const t = an ? await tailored(a, mm) : null;
    const ats = await D.atsReport(t ? t.model : mm.model);
    const r = an || { edits: [], reorder: [], remove: [] };
    const nb = r.new_bullets || [];
    const total = r.edits.length + nb.length + r.reorder.length + r.remove.length;
    const BASIS = { cv: ['ok', 'Already shown in your CV'], profile: ['ok', 'From your career profile'], unconfirmed: ['warn', 'Not in your CV: tick only if you really did this'] };
    const flagCtx = {
      known: termsOf(D.plainText(mm.model) + '\n' + (profile.achievements || []).join('\n') + '\n' + (a.emphasis || '')),
      jd: termsOf(a.jd || '')
    };
    const icon = { ok: '✓', warn: '!', info: 'i' };

    body.innerHTML = String(html`
      <div class="cv-grid">
        <div class="cv-main">
          ${an ? html`
          <section class="panel">
            <div class="panel-head"><h2>Requirements added to your CV <span class="muted">· ${total}</span></h2>
              <div class="row gap"><button class="btn ghost small" id="all-on" type="button">Accept all</button><button class="btn ghost small" id="all-off" type="button">Reject all</button></div></div>
            <p class="hint">Your own wording stays exactly as it is. Insertions add a job requirement to the paragraph where it fits best (in green); <strong>new bullets</strong> add the job's main duties under your most recent roles, in your own style. A senior CV writer drafted them, a recruiter-reviewer checked fit and realism${an.reviewed ? '' : ' (skipped this time)'}, and lines that sounded machine-written were rewritten. Items marked “tick only if you really did this” start unticked.</p>
            ${(an.job_technologies || []).length ? (() => { const hay = ' ' + normT(t ? t.text : '') + ' '; const on = an.job_technologies.filter(x => hay.includes(' ' + normT(x) + ' '));
              return html`<div class="tech-cover"><span class="small"><strong>Technologies in the advert: ${on.length} of ${an.job_technologies.length} on your tailored CV</strong>${on.length < an.job_technologies.length ? ' (tick the matching items below to add the rest)' : ''}</span>
                <div class="chips">${an.job_technologies.map(x => html`<span class="chip ${on.includes(x) ? 'ok' : 'muted'}">${on.includes(x) ? '✓ ' : ''}${x}</span>`)}</div></div>`; })() : ''}
            ${(an.review_notes || []).length ? html`<details class="small"><summary>What the reviewer changed (${an.review_notes.length})</summary><ul class="tight">${an.review_notes.map(x => html`<li>${x}</li>`)}</ul></details>` : ''}
            <div class="edits">${total ? '' : html`<p class="empty-note">No changes proposed. Your CV already fits this role well.</p>`}
              ${r.edits.map(e => { const p = paraById(mm, e.id), d = a.decisions['e' + e.id] || { on: false, text: p.text }; const fl = flagsFor(p.text, d.text, flagCtx);
                const ins = d.manual ? insertOnly(p.text, d.text) : e.insertOnly !== false;
                const basis = { cv: ['ok', 'Already shown in your CV'], profile: ['ok', 'From your career profile'], unconfirmed: ['warn', 'Not in your CV: tick only if you really have this'] }[e.basis];
                return html`<div class="edit ${d.on ? '' : 'off'} ${e.basis === 'unconfirmed' ? 'confirm' : ''}" data-key="e${e.id}">
                  <input type="checkbox" data-toggle="e${e.id}" ${d.on ? raw('checked') : ''} aria-label="Include this change">
                  <div class="edit-main">
                    <div class="edit-meta"><span class="kind">${ins ? 'Insert' : 'Rewrite'}</span>${e.requirement ? html`<span class="chip accent">${e.requirement}</span>` : ''}${basis ? html`<span class="chip ${basis[0]}">${basis[1]}</span>` : ''}${ins ? '' : html`<span class="chip bad">Changes your own wording</span>`}<span>¶${p.id}${p.style ? ' · ' + p.style : ''}${p.isList ? ' · bullet' : ''}</span></div>
                    ${diffHtml(p.text, d.text)}
                    <div class="edit-tools"><button class="linkish" data-edit="e${e.id}" type="button">Edit wording</button></div>
                    ${e.reason ? html`<p class="reason">${e.reason}</p>` : ''}
                    ${fl.length || (e.tells || []).length ? html`<div class="flags">${fl.map(x => html`<span class="chip ${x.cls}">${x.text}</span>`)}${(d.manual ? [] : e.tells || []).map(x => html`<span class="chip warn">${x}</span>`)}</div>` : ''}
                  </div></div>`; })}
              ${nb.map((b, i) => { const p = paraById(mm, b.after), d = a.decisions['n' + i] || { on: false, text: b.text }; if (!p) return '';
                const fl = flagsFor('', d.text, flagCtx).filter(x => !/^Longer than/.test(x.text)), basis = BASIS[b.basis], tells = window.CVT.agent.aiTells ? window.CVT.agent.aiTells(d.text) : [];
                return html`<div class="edit ${d.on ? '' : 'off'} ${b.basis === 'unconfirmed' ? 'confirm' : ''}" data-key="n${i}">
                  <input type="checkbox" data-toggle="n${i}" ${d.on ? raw('checked') : ''} aria-label="Include this new bullet">
                  <div class="edit-main">
                    <div class="edit-meta"><span class="kind">New bullet</span>${b.requirement ? html`<span class="chip accent">${b.requirement}</span>` : ''}${basis ? html`<span class="chip ${basis[0]}">${basis[1]}</span>` : ''}<span>${b.role ? b.role + ' · ' : ''}after ¶${p.id}</span></div>
                    <div class="diff nb-after">• ${p.text.length > 110 ? p.text.slice(0, 110) + '…' : p.text}</div>
                    <div class="diff">• <ins>${d.text}</ins></div>
                    <div class="edit-tools"><button class="linkish" data-edit="n${i}" type="button">Edit wording</button></div>
                    ${b.reason ? html`<p class="reason">${b.reason}</p>` : ''}
                    ${fl.length || tells.length ? html`<div class="flags">${fl.map(x => html`<span class="chip ${x.cls}">${x.text}</span>`)}${tells.map(x => html`<span class="chip warn">${x}</span>`)}</div>` : ''}
                  </div></div>`; })}
              ${r.reorder.map((o, i) => { const d = a.decisions['o' + i] || { on: false }; return html`<div class="edit ${d.on ? '' : 'off'}">
                  <input type="checkbox" data-toggle="o${i}" ${d.on ? raw('checked') : ''} aria-label="Include this change">
                  <div class="edit-main"><div class="edit-meta"><span class="kind">Reorder</span></div>
                  <ol class="tight">${o.ids.map(id => html`<li>${paraById(mm, id).text}</li>`)}</ol>${o.reason ? html`<p class="reason">${o.reason}</p>` : ''}</div></div>`; })}
              ${r.remove.map(x => { const p = paraById(mm, x.id), d = a.decisions['r' + x.id] || { on: false }; return html`<div class="edit ${d.on ? '' : 'off'}">
                  <input type="checkbox" data-toggle="r${x.id}" ${d.on ? raw('checked') : ''} aria-label="Include this change">
                  <div class="edit-main"><div class="edit-meta"><span class="kind">Remove</span><span>¶${p.id}</span></div>
                  <div class="diff"><del>${p.text}</del></div>${x.reason ? html`<p class="reason">${x.reason}</p>` : ''}</div></div>`; })}
            </div>
          </section>` : html`
          <section class="panel"><div class="empty-state inline"><h2>No tailoring yet</h2><p class="hint">Run the analysis on the Job tab to get proposed changes. The ATS check on the right is for your master CV as it is.</p><a class="btn primary" href="#/app/${a.id}/job">Go to Job</a></div></section>`}
          <div class="compare" id="compare" hidden>
            <div><h3 class="h-sub">Master</h3><div class="preview-box" id="cmp-a"></div></div>
            <div><h3 class="h-sub">Tailored</h3><div class="preview-box" id="cmp-b"></div></div>
          </div>
        </div>

        <aside class="cv-side">
          <section class="panel">
            <div class="panel-head"><h2>Documents</h2></div>
            <p class="muted small">Master: ${mm.master.name}${t ? html` · ${t.applied} change${t.applied === 1 ? '' : 's'} applied${t.skipped.length ? `, ${t.skipped.length} skipped` : ''}` : ''}</p>
            <div class="stack">
              ${an ? html`<button class="btn primary" id="dl-cv" type="button">Download tailored CV</button>` : ''}
              ${an ? html`<a class="btn ghost" href="#/app/${a.id}/compare">Compare original and tailored</a>` : ''}
              <button class="btn ghost" id="compare-btn" type="button">${an ? 'Word preview, side by side' : 'Preview master'}</button>
              <p class="muted small" id="pages-note"></p>
            </div>
          </section>
          <section class="panel">
            <div class="panel-head"><h2>ATS check</h2></div>
            <ul class="ats">${ats.map(c => html`<li class="${c.status}"><span class="ats-icon" aria-hidden="true">${icon[c.status]}</span><div><strong>${c.title}</strong><span>${c.detail}</span></div></li>`)}</ul>
          </section>
        </aside>
      </div>`);

    body.addEventListener('change', async e => {
      const k = e.target.dataset.toggle; if (!k) return;
      a.decisions[k] = a.decisions[k] || {}; a.decisions[k].on = e.target.checked;
      e.target.closest('.edit').classList.toggle('off', !e.target.checked);
      await ctx.saveNow();
    });
    body.addEventListener('click', async e => {
      const ed = e.target.closest('[data-edit]');
      if (ed) {
        const k = ed.dataset.edit, d = a.decisions[k];
        const wrap = ed.closest('.edit-tools');
        wrap.innerHTML = '';
        const ta = document.createElement('textarea'); ta.rows = 3; ta.value = d.text; ta.id = 'ta-' + k;
        const done = document.createElement('button'); done.className = 'btn ghost small'; done.type = 'button'; done.textContent = 'Save wording';
        wrap.append(ta, done); ta.focus();
        done.addEventListener('click', async () => { d.text = ta.value; d.manual = true; d.on = true; await ctx.saveNow(); window.CVT.app.rerender(); });
      }
    });
    const setAll = async on => { Object.values(a.decisions).forEach(d => { d.on = on; }); await ctx.saveNow(); window.CVT.app.rerender(); };
    const on = $('#all-on', body), off = $('#all-off', body);
    if (on) on.addEventListener('click', () => setAll(true));
    if (off) off.addEventListener('click', () => setAll(false));
    const dl = $('#dl-cv', body);
    if (dl) dl.addEventListener('click', async () => { const x = await tailored(a, mm); download(x.blob, `${fileBase(a)}_CV_${stamp()}.docx`); });
    $('#compare-btn', body).addEventListener('click', async () => {
      const c = $('#compare', body); c.hidden = !c.hidden; if (c.hidden) return;
      if (!window.docx || !window.docx.renderAsync) return;
      const render = async (el, data) => { el.innerHTML = ''; await window.docx.renderAsync(data, el, null, { inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true }); return $$('section.docx', el).length; };
      const pa = await render($('#cmp-a', body), mm.master.data.slice(0));
      if (an) {
        const pb = await render($('#cmp-b', body), (await tailored(a, mm)).blob);
        $('#pages-note', body).textContent = pa === pb ? `Same page count in preview (${pa}). Confirm in Word.` : `Preview shows ${pa} → ${pb} pages. Reject a longer rewrite, then confirm in Word.`;
      } else { $('#cmp-b', body).closest('div').hidden = true; }
      c.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }


  // =====================================================================
  // COMPARE: original CV vs tailored CV, paragraph by paragraph, colour-marked
  // =====================================================================
  function compareRows(a, mm, t) {
    const plan = planOf(a, mm);
    const skipped = new Set((t.skipped || []).map(x => String(x.id)));
    const edits = new Map(plan.edits.filter(e => !skipped.has(String(e.id))).map(e => [e.id, e]));
    const removed = new Set(plan.remove.filter(id => !skipped.has(String(id))));
    let order = mm.model.paras.map(p => p.id);
    const moved = new Set();
    plan.reorder.filter(g => !skipped.has(g.join(','))).forEach(g => {
      const slots = g.map(id => order.indexOf(id)).sort((x, y) => x - y);
      g.forEach((id, i) => { if (order[slots[i]] !== id) moved.add(id); order[slots[i]] = id; });
    });
    const addsAfter = new Map();
    (plan.adds || []).filter(x => !skipped.has('n' + x.after)).forEach(x => { if (!addsAfter.has(x.after)) addsAfter.set(x.after, []); addsAfter.get(x.after).push(x.text); });
    const rowsOut = [];
    order.map(id => paraById(mm, id)).filter(p => p && p.text.trim()).forEach(p => {
      rowsOut.push(rowOf(p));
      (addsAfter.get(p.id) || []).forEach(t => rowsOut.push({ p: { id: p.id, isList: true, text: '' }, before: '', after: t, kind: 'added', heading: false }));
    });
    return rowsOut;
    function rowOf(p) {
      const e = edits.get(p.id);
      const after = removed.has(p.id) ? '' : e ? editText(e, p) : p.text;
      const kind = removed.has(p.id) ? 'removed' : (e && after !== p.text) ? (moved.has(p.id) ? 'edited moved' : 'edited') : moved.has(p.id) ? 'moved' : 'same';
      const heading = /heading|title/i.test(p.style) || (!p.isList && p.text.length < 40 && p.text === p.text.toUpperCase() && /[A-Z]/.test(p.text));
      return { p, before: p.text, after, kind, heading };
    }
  }
  function sideHtml(r, side) {
    const pre = r.p.isList ? '• ' : '';
    if (r.kind === 'added') return side === 'a' ? html`<span class="cmp-gone">New bullet</span>` : html`${pre}<ins>${r.after}</ins>`;
    if (r.kind === 'removed') return side === 'a' ? html`${pre}<del>${r.before}</del>` : html`<span class="cmp-gone">Removed from the tailored CV</span>`;
    if (!/edited/.test(r.kind)) return html`${pre}${side === 'a' ? r.before : r.after}`;
    const parts = wordDiff(r.before, r.after);
    return side === 'a'
      ? html`${pre}${parts.filter(x => x.t !== 'ins').map(x => x.t === 'del' ? html`<del>${x.s}</del>` : x.s)}`
      : html`${pre}${parts.filter(x => x.t !== 'del').map(x => x.t === 'ins' ? html`<ins>${x.s}</ins>` : x.s)}`;
  }

  async function tabCompare(ctx) {
    const { a, an, body } = ctx;
    if (!an) return needAnalysis(ctx);
    const mm = await masterModel(a.masterId);
    if (!mm) { body.innerHTML = String(html`<div class="empty-state"><h2>No master CV yet</h2><a class="btn primary" href="#/profile">Career profile</a></div>`); return; }
    const t = await tailored(a, mm);
    const rows = compareRows(a, mm, t);
    const ch = rows.filter(r => r.kind !== 'same');
    const addedWords = rows.reduce((n, r) => n + (r.kind === 'added' ? (r.after.match(/\S+/g) || []).length : /edited/.test(r.kind) ? wordDiff(r.before, r.after).filter(x => x.t === 'ins').reduce((k, x) => k + (x.s.match(/\S+/g) || []).length, 0) : 0), 0);
    const kws = an.keywords || [];
    const before = D.keywordCoverage(D.plainText(mm.model), kws), after = D.keywordCoverage(t.text, kws);
    const gained = after.hit.filter(k => !before.hit.includes(k));
    const n = k => rows.filter(r => r.kind.includes(k)).length;
    const ui = Object.assign({ only: false }, S.local.get('cvt.cmpUi', {}));

    body.innerHTML = String(html`
      <section class="panel cmp-head">
        <div class="panel-head"><h2>Original vs tailored CV</h2>
          <div class="row gap wrap"><label class="check-line"><input type="checkbox" id="cmp-only" ${ui.only ? raw('checked') : ''}> Show changes only</label>
          <button class="btn ghost small" id="cmp-next" type="button" ${ch.length ? '' : raw('disabled')}>Next change ↓</button>
          <button class="btn ghost small" id="cmp-dl" type="button">Download comparison</button>
          <a class="btn primary small" href="#/app/${a.id}/cv">Accept or reject changes</a></div></div>
        <div class="cmp-stats">
          <div><b>${n('edited')}</b><span>paragraphs updated</span></div>
          <div><b>${n('added')}</b><span>new bullets</span></div>
          <div><b>${addedWords}</b><span>words added</span></div>
          <div><b>${n('moved')}</b><span>moved</span></div>
          <div><b>${n('removed')}</b><span>removed</span></div>
          ${kws.length ? html`<div><b>${before.pct}% → ${after.pct}%</b><span>job keywords covered</span></div>` : ''}
        </div>
        <div class="cmp-legend" aria-label="Colour key">
          <span><i class="lg-ins"></i>Added for this job</span><span><i class="lg-del"></i>Removed</span>
          <span><i class="lg-edit"></i>Paragraph updated</span><span><i class="lg-move"></i>Moved higher</span><span><i class="lg-same"></i>Unchanged</span>
        </div>
        ${gained.length ? html`<p class="small mt">Keywords now on your CV: ${gained.map(k => html`<span class="chip ok">${k}</span> `)}</p>` : ''}
        ${after.miss.length ? html`<p class="small muted">Still missing: ${after.miss.slice(0, 12).join(', ')}${after.miss.length > 12 ? '…' : ''}</p>` : ''}
        ${t.skipped.length ? html`<p class="small warn-text">${t.skipped.length} change${t.skipped.length > 1 ? 's' : ''} could not be applied safely and ${t.skipped.length > 1 ? 'are' : 'is'} not shown.</p>` : ''}
        ${ch.length ? '' : html`<p class="empty-note">No changes accepted yet. Tick changes on the CV tab, then come back here.</p>`}
      </section>
      <section class="panel cmp-panel ${ui.only ? 'only' : ''}" id="cmp">
        <div class="cmp-cols cmp-titles"><div>Original · ${mm.master.name}</div><div>Tailored for ${a.company || 'this job'}</div></div>
        ${rows.map((r, i) => html`<div class="cmp-row k-${r.kind.split(' ').join(' k-')} ${r.heading ? 'is-h' : ''}" data-i="${i}">
          <div class="cmp-a"><span class="cmp-lbl">Original</span>${sideHtml(r, 'a')}</div>
          <div class="cmp-b"><span class="cmp-lbl">Tailored</span>${sideHtml(r, 'b')}${r.kind.includes('moved') ? html` <span class="chip move">moved</span>` : ''}</div>
        </div>`)}
      </section>`);

    $('#cmp-only', body).addEventListener('change', e => { ui.only = e.target.checked; S.local.set('cvt.cmpUi', ui); $('#cmp', body).classList.toggle('only', ui.only); });
    let at = -1;
    $('#cmp-next', body).addEventListener('click', () => {
      const els = $$('.cmp-row:not(.k-same)', body); if (!els.length) return;
      at = (at + 1) % els.length; els.forEach(x => x.classList.remove('focus'));
      els[at].classList.add('focus'); els[at].scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    $('#cmp-dl', body).addEventListener('click', () => {
      const css = `body{font:14px/1.5 Calibri,Arial,sans-serif;color:#141922;margin:24px;max-width:1200px}h1{font-size:20px}table{border-collapse:collapse;width:100%}td,th{vertical-align:top;padding:8px 10px;border-bottom:1px solid #E3E6EC;width:50%}th{text-align:left;background:#F3F4F7}ins{background:#CDEFD8;text-decoration:none}del{background:#F8D3D3;color:#8A2A2A}tr.k-edited td{border-left:4px solid #E0A100}tr.k-moved td{border-left:4px solid #2447D6}tr.k-removed td{background:#FDF1F1}tr.k-same td{color:#5A6373}.h td{font-weight:700}.key span{margin-right:16px}`;
      const out = `<!doctype html><meta charset="utf-8"><title>CV comparison · ${esc(a.role || '')}</title><style>${css}</style><h1>CV comparison: ${esc(a.role || '')}${a.company ? ' at ' + esc(a.company) : ''}</h1><p class="key"><span><ins>added</ins></span><span><del>removed</del></span><span>amber bar: updated</span><span>blue bar: moved</span></p><p>${n('edited')} paragraphs updated · ${addedWords} words added · ${n('moved')} moved · ${n('removed')} removed${kws.length ? ` · keywords ${before.pct}% → ${after.pct}%` : ''}</p><table><tr><th>Original</th><th>Tailored</th></tr>${rows.map(r => `<tr class="k-${r.kind.split(' ')[0]} ${r.heading ? 'h' : ''}"><td>${sideHtml(r, 'a')}</td><td>${sideHtml(r, 'b')}</td></tr>`).join('')}</table>`;
      download(new Blob([out], { type: 'text/html' }), `${fileBase(a)}_CV_comparison.html`);
    });
  }

  // =====================================================================
  // LETTER
  // =====================================================================
  async function tabLetter(ctx) {
    const { a, an, body, profile } = ctx;
    if (!an) return needAnalysis(ctx);
    const words = t => (letterPlain(t).split('\n').slice(4).join(' ').match(/\S+/g) || []).length;
    body.innerHTML = String(html`
      <div class="letter-grid">
        <section class="panel">
          <div class="panel-head"><h2>Cover letter</h2><span class="muted small" id="wc">${a.letter ? words(a.letter) + ' words' : ''}</span></div>
          ${a.letter ? html`
            <p class="hint">Edit freely; it saves as you type. Wrap a line in **double asterisks** to make it bold in Word.</p>
            <textarea id="letter" class="letter" rows="24" spellcheck="true">${a.letter}</textarea>
            <div class="row gap wrap">
              <button class="btn primary" id="dl" type="button">Download (.docx)</button>
              <button class="btn ghost" id="cp" type="button">Copy text</button>
              <button class="btn ghost" id="gen" type="button">Write again</button>
            </div>` : html`
            <div class="empty-state inline"><p class="hint">Written from your tailored CV, the positioning angle and your achievements bank. It uses your CV's fonts, header and letterhead.</p>
            <button class="btn primary" id="gen" type="button">Write cover letter</button></div>`}
          <p class="hint bg-note" id="bg-note" hidden>This runs in the background. Carry on with other jobs or pages; you'll get a notice when it's ready.</p>
          <ol class="progress" id="prog" hidden></ol>
          <p class="error" id="err" role="alert" hidden></p>
        </section>
        <aside class="panel">
          <div class="panel-head"><h2>What good looks like</h2></div>
          <ul class="tight small">
            <li>Opens with the role and one reason this company, not “I am writing to apply”.</li>
            <li>Answers their top two requirements with evidence and numbers.</li>
            <li>Names the angle: ${an.decision && an.decision.angle ? an.decision.angle : 'why you, specifically'}.</li>
            <li>Under 350 words; ends with availability and a next step.</li>
            <li>For agency roles, a short email to the recruiter often works better. See Outreach.</li>
          </ul>
        </aside>
      </div>`);

    const gen = $('#gen', body);
    gen.addEventListener('click', async () => {
      const err = $('#err', body); err.hidden = true;
      const mm = await masterModel(a.masterId);
      const st = progress($('#prog', body), ['Building your tailored CV', 'Writing the letter (15–40 s)']);
      gen.disabled = true; let i = 0;
      try {
        st.at(0); const t = await tailored(a, mm);
        st.at(i = 1);
        const L = await A.coverLetter({ key: state.key, model: state.model, app: a, profile, cvText: t.text });
        const lines = [ukDate(), '', `**Re: ${a.role || an.job.title || ''}${a.company ? ', ' + a.company : ''}**`, '', L.salutation || 'Dear Hiring Manager,', ''];
        L.paragraphs.forEach(p => lines.push(p, ''));
        lines.push(L.signoff || 'Kind regards,', '', L.name || an.candidate_name || profile.name || '');
        a.letter = lines.join('\n'); await ctx.saveNow(); st.done();
        window.CVT.app.rerender();
      } catch (x) { st.fail(i); err.textContent = x.message; err.hidden = false; gen.disabled = false; }
    });
    const ta = $('#letter', body);
    if (ta) {
      ta.addEventListener('input', () => { a.letter = ta.value; $('#wc', body).textContent = words(ta.value) + ' words'; ctx.saveSoon(); });
      $('#cp', body).addEventListener('click', e => copy(letterPlain(ta.value), e.currentTarget));
      $('#dl', body).addEventListener('click', async () => {
        const mm = await masterModel(a.masterId);
        const blob = await D.buildLetter(mm.master.data.slice(0), { letterheadIds: an.letterhead_ids || [], blocks: letterBlocks(ta.value) });
        download(blob, `${fileBase(a)}_CoverLetter_${stamp()}.docx`);
      });
    }
  }

  // =====================================================================
  // OUTREACH
  // =====================================================================
  async function tabOutreach(ctx) {
    const { a, an, body, profile } = ctx;
    if (!an) return needAnalysis(ctx);
    const o = a.outreach;
    const block = (key, title, when, item) => {
      if (!item) return '';
      const isNote = typeof item === 'string';
      const text = isNote ? item : item.body;
      return html`<section class="panel msg">
        <div class="panel-head"><div><h2>${title}</h2><p class="muted small">${when}</p></div>
          <div class="row gap">${isNote ? html`<span class="chip ${text.length > 300 ? 'bad' : 'muted'}" data-count="${key}">${text.length}/300</span>` : ''}<button class="btn ghost small" data-copy="${key}" type="button">Copy</button></div></div>
        ${isNote ? '' : html`<label class="field"><span>Subject</span><input data-o="${key}.subject" type="text" value="${item.subject || ''}"></label>`}
        <textarea data-o="${key}${isNote ? '' : '.body'}" rows="${isNote ? 3 : 7}">${text}</textarea>
      </section>`;
    };
    body.innerHTML = String(html`
      <div class="panel-head bare">
        <p class="hint">Messages that get replies are short, specific and easy to answer. Send the recruiter or hiring-manager note on the same day you apply.</p>
        <button class="btn ${o ? 'ghost' : 'primary'}" id="gen" type="button">${o ? 'Write again' : 'Write outreach messages'}</button>
      </div>
      <ol class="progress" id="prog" hidden></ol>
      <p class="error" id="err" role="alert" hidden></p>
      ${o ? html`<div class="msg-grid">
        ${block('linkedin_note', 'LinkedIn connection note', 'To the hiring manager or recruiter, with your connection request', o.linkedin_note)}
        ${block('hiring_manager', 'Message to the hiring manager', 'LinkedIn message or email, the day you apply', o.hiring_manager)}
        ${block('recruiter', 'Email to the recruiter', a.recruiterEmail ? 'To ' + a.recruiterEmail : 'For agency roles, send before or instead of the portal', o.recruiter)}
        ${block('follow_up', 'Follow-up', '7 days after applying if you have heard nothing', o.follow_up)}
        ${block('thank_you', 'Thank-you note', 'Within 24 hours of an interview; replace [topic]', o.thank_you)}
      </div>` : html`<div class="empty-state"><p class="hint">Writes five ready-to-send messages from this analysis: a LinkedIn note, hiring-manager message, recruiter email, follow-up and thank-you.</p></div>`}`);

    $('#gen', body).addEventListener('click', async e => {
      const btn = e.currentTarget, err = $('#err', body); err.hidden = true;
      const st = progress($('#prog', body), ['Writing messages (15–40 s)']);
      btn.disabled = true;
      try {
        const mm = await masterModel(a.masterId); const t = await tailored(a, mm);
        st.at(0);
        a.outreach = await A.outreach({ key: state.key, model: state.model, app: a, profile, cvText: t.text });
        await ctx.saveNow(); st.done(); window.CVT.app.rerender();
      } catch (x) { st.fail(0); err.textContent = x.message; err.hidden = false; btn.disabled = false; }
    });
    body.addEventListener('input', e => {
      const path = e.target.dataset.o; if (!path) return;
      const [k, sub] = path.split('.');
      if (sub) a.outreach[k][sub] = e.target.value; else a.outreach[k] = e.target.value;
      const c = $(`[data-count="${k}"]`, body);
      if (c) { c.textContent = e.target.value.length + '/300'; c.className = 'chip ' + (e.target.value.length > 300 ? 'bad' : 'muted'); }
      ctx.saveSoon();
    });
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-copy]'); if (!b) return;
      const item = a.outreach[b.dataset.copy];
      copy(typeof item === 'string' ? item : (item.subject ? 'Subject: ' + item.subject + '\n\n' : '') + item.body, b);
    });
  }

  // =====================================================================
  // INTERVIEW
  // =====================================================================
  async function tabInterview(ctx) {
    const { a, an, body, profile } = ctx;
    if (!an) { needAnalysis(ctx); return window.CVT.prep.interviewExtras(ctx); }
    const iv = a.interview;
    const typeCls = { technical: 'accent', behavioural: 'ok', situational: 'warn', motivation: 'muted' };
    body.innerHTML = String(html`
      <div class="panel-head bare">
        <p class="hint">Built only from your real experience. Practise answers out loud; aim for two minutes each.</p>
        <div class="row gap">${iv ? html`<button class="btn ghost" id="cp-all" type="button">Copy as notes</button>` : ''}<button class="btn ${iv ? 'ghost' : 'primary'}" id="gen" type="button">${iv ? 'Prepare again' : 'Prepare for interview'}</button></div>
      </div>
      <ol class="progress" id="prog" hidden></ol>
      <p class="error" id="err" role="alert" hidden></p>
      ${iv ? html`
        <section class="panel pitch"><div class="panel-head"><h2>Your 60-second pitch</h2></div><p class="pre">${iv.pitch || ''}</p></section>
        <section class="panel">
          <div class="panel-head"><h2>Likely questions</h2><span class="muted small">${(iv.questions || []).length} questions</span></div>
          <div class="qs">${(iv.questions || []).map((q, i) => html`<details ${i === 0 ? raw('open') : ''}><summary><span class="chip ${typeCls[q.type] || 'muted'}">${q.type || 'question'}</span><span>${q.q}</span></summary>
            ${q.why ? html`<p class="muted small">They're testing: ${q.why}</p>` : ''}<p class="pre">${q.answer || ''}</p></details>`)}</div>
        </section>
        <div class="two-col">
          <section class="panel"><div class="panel-head"><h2>Revise these topics</h2></div><div class="kw">${(iv.topics || []).map(t => html`<span class="chip muted">${t}</span>`)}</div></section>
          <section class="panel"><div class="panel-head"><h2>Questions to ask them</h2></div><ul class="tight">${(iv.ask_them || []).map(t => html`<li>${t}</li>`)}</ul></section>
        </div>
        ${(iv.gaps || []).length ? html`<section class="panel"><div class="panel-head"><h2>Handling gaps honestly</h2></div><dl class="gaps">${iv.gaps.map(g => html`<dt>${g.gap}</dt><dd>${g.how}</dd>`)}</dl></section>` : ''}
        ${iv.plan_90 ? html`<section class="panel"><div class="panel-head"><h2>First 90 days</h2></div><div class="plan">
          <div><h3>Days 1–30</h3><ul class="tight">${(iv.plan_90.first_30 || []).map(t => html`<li>${t}</li>`)}</ul></div>
          <div><h3>Days 31–60</h3><ul class="tight">${(iv.plan_90.days_31_60 || []).map(t => html`<li>${t}</li>`)}</ul></div>
          <div><h3>Days 61–90</h3><ul class="tight">${(iv.plan_90.days_61_90 || []).map(t => html`<li>${t}</li>`)}</ul></div></div></section>` : ''}
      ` : html`<div class="empty-state"><p class="hint">Get a tailored pitch, 10–14 likely questions with STAR outlines from your CV, SAP topics to revise, gap handling, questions to ask, and a 90-day plan.</p></div>`}`);

    await window.CVT.prep.interviewExtras(ctx);
    $('#gen', body).addEventListener('click', async e => {
      const btn = e.currentTarget, err = $('#err', body); err.hidden = true;
      const st = progress($('#prog', body), ['Preparing questions and answers (30–90 s)']);
      btn.disabled = true;
      try {
        const mm = await masterModel(a.masterId); const t = await tailored(a, mm);
        st.at(0);
        a.interview = await A.interviewPrep({ key: state.key, model: state.model, app: a, profile, cvText: t.text });
        await ctx.saveNow(); st.done(); window.CVT.app.rerender();
      } catch (x) { st.fail(0); err.textContent = x.message; err.hidden = false; btn.disabled = false; }
    });
    const cp = $('#cp-all', body);
    if (cp) cp.addEventListener('click', e => {
      const L = [`Interview prep: ${a.role} at ${a.company}`, '', 'PITCH', iv.pitch, '', 'QUESTIONS'];
      (iv.questions || []).forEach((q, i) => L.push(`${i + 1}. ${q.q}`, q.answer, ''));
      L.push('TOPICS', (iv.topics || []).join(', '), '', 'ASK THEM', ...(iv.ask_them || []).map(x => '- ' + x));
      copy(L.join('\n'), e.currentTarget);
    });
  }

  // =====================================================================
  // APPLY
  // =====================================================================
  async function tabApply(ctx) {
    const { a, an, body, profile } = ctx;
    a.answers = Object.assign({ why: '', salary: '', notice: '', qa: [] }, a.answers || {});
    const ans = a.answers;
    const contactOk = profile.name && profile.email && profile.phone;
    const checks = [
      { ok: !!an, text: 'Fit analysed', href: 'job' },
      { ok: !!an, text: 'CV tailored and reviewed', href: 'cv' },
      { ok: !!a.letter, text: 'Cover letter written', href: 'letter' },
      { ok: !!contactOk, text: 'Name, email and mobile in Career profile', href: null },
      { ok: !!(ans.why || ans.qa.some(q => q.a)), text: 'Form answers drafted', href: null },
      { ok: !!a.outreach, text: 'Outreach message ready for the same day', href: 'outreach' }
    ];
    body.innerHTML = String(html`
      <div class="apply-grid">
        <div>
          <section class="panel">
            <div class="panel-head"><h2>Form answers</h2><button class="btn primary small" id="draft" type="button">Draft answers with AI</button></div>
            <p class="hint">Autofill uses these plus your Career profile. Edit anything; it saves as you type.</p>
            <label class="field"><span>Why this role / why us</span><textarea data-a="why" rows="5">${ans.why}</textarea></label>
            <div class="grid-2">
              <label class="field"><span>Salary / rate answer</span><input data-a="salary" type="text" value="${ans.salary || (a.contractType === 'Contract' ? profile.dayRate : profile.salary) || ''}"></label>
              <label class="field"><span>Notice / availability answer</span><input data-a="notice" type="text" value="${ans.notice || profile.notice || ''}"></label>
            </div>
            <div class="panel-head sub"><h3>Screening questions</h3><button class="btn ghost small" id="add-q" type="button">Add question</button></div>
            <label class="field"><span>Paste questions from the form (one per line), then draft answers</span><textarea id="paste-q" rows="3" placeholder="How many full-cycle SAP Ariba implementations have you led?&#10;Describe your experience with CIG integration."></textarea></label>
            <div class="qa">${ans.qa.map((q, i) => html`<div class="qa-item">
              <input data-qa="${i}.q" type="text" value="${q.q}" aria-label="Question ${i + 1}">
              <textarea data-qa="${i}.a" rows="3" aria-label="Answer ${i + 1}">${q.a}</textarea>
              <button class="icon-btn" data-qdel="${i}" type="button" aria-label="Remove question">×</button></div>`)}</div>
            <p class="hint bg-note" id="bg-note" hidden>This runs in the background. Carry on with other jobs or pages; you'll get a notice when it's ready.</p>
          <ol class="progress" id="prog" hidden></ol>
            <p class="error" id="err" role="alert" hidden></p>
          </section>
        </div>

        <aside>
          <section class="panel">
            <div class="panel-head"><h2>Ready to apply?</h2></div>
            <ul class="checklist">${checks.map(c => html`<li class="${c.ok ? 'ok' : ''}"><span aria-hidden="true">${c.ok ? '✓' : '○'}</span>${c.href && !c.ok ? html`<a class="link" href="#/app/${a.id}/${c.href}">${c.text}</a>` : c.href === null && !c.ok && c.text.startsWith('Name') ? html`<a class="link" href="#/profile">${c.text}</a>` : c.text}</li>`)}</ul>
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Fill the employer's form</h2></div>
            <ol class="steps">
              <li><button class="btn primary small" id="pack" type="button">Copy autofill pack</button></li>
              <li>${a.url ? html`<a class="link" href="${a.url}" target="_blank" rel="noopener">Open the application page</a>` : 'Open the application page'} and click your <a class="bookmarklet small" id="bm" href="#">⤓ Applywise autofill</a> bookmark. First time? Drag that button to your bookmarks bar.</li>
              <li>Check every highlighted field, fill anything left, and attach your CV:
                <div class="row gap wrap mt">${an ? html`<button class="btn ghost small" id="dl-cv" type="button">Download CV</button>` : ''}${a.letter ? html`<button class="btn ghost small" id="dl-letter" type="button">Download letter</button>` : ''}</div></li>
              <li><strong>You</strong> press Submit. Autofill never submits.</li>
            </ol>
            <p class="muted small">Prefer hands-off? Open the form in Chrome and ask your AI browser assistant to fill it from this pack; it will stop before Submit for your approval.</p>
          </section>

          <section class="panel">
            <div class="panel-head"><h2>After you submit</h2></div>
            ${['Saved', 'Tailored'].includes(a.status) ? html`<button class="btn primary" id="applied" type="button">Mark as applied</button><p class="muted small">Sets a follow-up for 7 days' time.</p>` : html`<p class="small">Applied${a.appliedAt ? ' on ' + ukDate(a.appliedAt) : ''}. ${a.next ? html`Next: ${a.next.text} by ${ukDate(a.next.due)}.` : ''}</p>`}
          </section>
        </aside>
      </div>`);

    $('#bm', body).href = window.CVT.bookmarklet();
    $('#bm', body).addEventListener('click', e => { e.preventDefault(); toast('Drag this to your bookmarks bar, then click it on the application form.', 'warn'); });
    body.addEventListener('input', e => {
      const k = e.target.dataset.a, q = e.target.dataset.qa;
      if (k) { ans[k] = e.target.value; ctx.saveSoon(); }
      if (q) { const [i, f] = q.split('.'); ans.qa[Number(i)][f] = e.target.value; ctx.saveSoon(); }
    });
    body.addEventListener('click', async e => {
      const d = e.target.closest('[data-qdel]');
      if (d) { ans.qa.splice(Number(d.dataset.qdel), 1); await ctx.saveNow(); window.CVT.app.rerender(); }
    });
    $('#add-q', body).addEventListener('click', async () => { ans.qa.push({ q: '', a: '' }); await ctx.saveNow(); window.CVT.app.rerender(); });

    $('#draft', body).addEventListener('click', async e => {
      const btn = e.currentTarget, err = $('#err', body); err.hidden = true;
      $('#paste-q', body).value.split('\n').map(s => s.trim()).filter(Boolean).forEach(q => { if (!ans.qa.some(x => x.q === q)) ans.qa.push({ q, a: '' }); });
      const st = progress($('#prog', body), ['Drafting answers (15–40 s)']);
      btn.disabled = true;
      try {
        const mm = await masterModel(a.masterId);
        const cvText = an ? (await tailored(a, mm)).text : D.plainText(mm.model);
        st.at(0);
        const out = await A.answers({ key: state.key, model: state.model, app: a, profile, cvText, questions: ans.qa.filter(x => x.q && !x.a).map(x => x.q) });
        if (!ans.why && out.why) ans.why = out.why;
        if (!ans.salary && out.salary) ans.salary = out.salary;
        if (!ans.notice && out.notice) ans.notice = out.notice;
        (out.qa || []).forEach(x => { const m = ans.qa.find(y => y.q === x.q && !y.a); if (m) m.a = x.a; });
        await ctx.saveNow(); st.done(); window.CVT.app.rerender();
      } catch (x) { st.fail(0); err.textContent = x.message; err.hidden = false; btn.disabled = false; }
    });

    $('#pack', body).addEventListener('click', e => {
      const parts = (profile.name || '').trim().split(/\s+/);
      const pack = {
        kind: 'cv-tailor-pack', v: 1, company: a.company, role: a.role,
        fields: {
          firstName: profile.legalFirst || parts[0] || '', lastName: profile.legalLast || (parts.length > 1 ? parts[parts.length - 1] : ''), fullName: profile.name,
          middleName: profile.middleName, preferredName: profile.preferredName, phoneCode: profile.phoneCode, phoneType: profile.phoneType,
          address1: profile.address1, address2: profile.address2, county: profile.county, hearAbout: profile.hearAbout, previouslyWorked: profile.previouslyWorked,
          rightToWork: profile.rightToWork, sponsorship: profile.sponsorship, relocate: profile.relocate, travel: profile.travel, startDate: profile.startDate,
          currentSalary: profile.currentSalary, school: profile.school, degree: profile.degree, fieldOfStudy: profile.fieldOfStudy,
          email: profile.email, phone: profile.phone, linkedin: profile.linkedin, website: profile.website,
          city: profile.city, postcode: profile.postcode, country: profile.country,
          currentTitle: profile.currentTitle, currentCompany: profile.currentCompany,
          notice: ans.notice || profile.notice, salary: ans.salary || profile.salary, dayRate: profile.dayRate,
          eligibility: profile.eligibility, why: ans.why, coverLetter: letterPlain(a.letter).split('\n').slice(4).join('\n').trim()
        },
        qa: ans.qa.filter(x => x.q && x.a)
      };
      copy(JSON.stringify(pack), e.currentTarget);
    });
    const dlc = $('#dl-cv', body);
    if (dlc) dlc.addEventListener('click', async () => { const mm = await masterModel(a.masterId); const x = await tailored(a, mm); download(x.blob, `${fileBase(a)}_CV_${stamp()}.docx`); });
    const dll = $('#dl-letter', body);
    if (dll) dll.addEventListener('click', async () => { const mm = await masterModel(a.masterId); download(await D.buildLetter(mm.master.data.slice(0), { letterheadIds: an.letterhead_ids || [], blocks: letterBlocks(a.letter) }), `${fileBase(a)}_CoverLetter_${stamp()}.docx`); });
    const ap = $('#applied', body);
    if (ap) ap.addEventListener('click', async () => { S.setStatus(a, 'Applied'); await ctx.saveNow(); toast(`Marked as applied. Follow-up set for ${ukDate(a.next.due)}.`); window.CVT.app.rerender(); });
  }

  // ---------- example job (fictional) ----------
  const EXAMPLE_GENERIC = `Operations Team Leader

Brightside Services (fictional) is growing and needs a team leader to run day-to-day operations for our customer support centre.

What you'll do
- Lead, coach and schedule a team of 10-12 advisors across phone, email and chat
- Hit service levels and quality targets; report weekly KPIs to the operations manager
- Handle escalated complaints and turn them into process improvements
- Train new starters and run monthly one-to-ones and performance reviews
- Work with other departments to fix recurring customer issues

What you'll bring
- 2+ years leading a team in a customer-facing or operations role
- Strong communication and stakeholder management
- Confident with Excel and a CRM system
- Calm, organised and good at problem solving under pressure
- Desirable: a leadership or customer-service qualification, experience with Zendesk or Salesforce`;
  const EXAMPLE_JD = `SAP Ariba Solution Architect (Source-to-Pay)
Northgate Energy (fictional example) · Manchester, hybrid (2 days on site) · Permanent · £95,000–£110,000 + bonus

About the role
We are replacing our legacy procurement tools with SAP Ariba integrated to S/4HANA. You will own the end-to-end Source-to-Pay solution design across Guided Buying, Buying & Invoicing, Sourcing, Contracts and Supplier Lifecycle & Performance (SLP), and work with our systems integrator to deliver it.

What you'll do
- Own the S2P solution architecture and design authority, from requisition to payment
- Lead fit-to-standard workshops with Procurement, Finance and AP stakeholders
- Design integration between SAP Ariba and S/4HANA using SAP Cloud Integration Gateway (CIG) / SAP Integration Suite
- Define the Guided Buying experience, catalogue strategy (punch-out and hosted) and approval flows
- Govern supplier enablement on SAP Business Network with the supplier onboarding team
- Shape the data migration approach for suppliers, contracts and open purchase orders
- Support testing (SIT, UAT), cutover and hypercare
- Mentor junior functional consultants

What you'll bring
- 10+ years in SAP procurement, including at least 3 full-cycle SAP Ariba implementations
- Deep knowledge of P2P processes and SAP MM / S/4HANA Sourcing & Procurement
- Hands-on experience with Guided Buying and SAP Business Network
- Experience with CIG or SAP Integration Suite
- Strong stakeholder management at Head of Procurement / CFO level
- Desirable: SAP Ariba certification, PMP or PRINCE2, utilities sector experience, SAP Ariba Central Procurement / S/4HANA Cloud`;


  // =====================================================================
  // ENGINE: the same steps as the buttons, without the UI (used by Autopilot)
  // =====================================================================
  const engine = {
    async analyse(a, profile, signal, onStage) {
      if ((a.jd || '').trim().length < 15 && !(a.role || '').trim()) throw new Error('Needs the job title or a few lines of the advert');
      const masters = await S.listMasters();
      if (!a.masterId && masters.length) a.masterId = (masters.find(m => m.isDefault) || masters[0]).id;
      const mm = await masterModel(a.masterId);
      if (!mm) throw new Error('Add your master CV in Career profile first');
      const out = await A.analyse({ key: state.key, model: state.model, signal, onStage, app: a, profile, paras: D.forModel(mm.model) });
      // You may have edited this application while the AI worked: build on the latest saved copy.
      const fresh = await S.getApp(a.id);
      if (fresh && fresh !== a) Object.assign(a, fresh);
      const j = out.job || {};
      const fill = (k, v) => { if (!a[k] && v && v !== 'unknown') a[k] = v; };
      fill('company', j.company); fill('role', j.title); fill('location', j.location); fill('pay', j.pay); fill('agency', j.agency);
      fill('workMode', { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' }[j.work_mode]);
      fill('contractType', { permanent: 'Permanent', contract: 'Contract', 'fixed-term': 'Fixed-term' }[j.contract_type]);
      if (/^\d{4}-\d{2}-\d{2}$/.test(j.closing_date || '')) fill('closing', j.closing_date);
      a.masterId = mm.master.id; a.analysis = out; a.analysedAt = S.now();
      prepareDecisions(a, mm);
      a.coverageBefore = D.keywordCoverage(D.plainText(mm.model), out.keywords);
      if (a.status === 'Saved') S.setStatus(a, 'Tailored');
      if (!a.next && a.closing) a.next = { text: 'Apply before the closing date', due: a.closing };
      await S.saveApp(a);
      return out;
    },
    async cvText(a) { const mm = await masterModel(a.masterId); return a.analysis && !a.analysis.legacy ? (await tailored(a, mm)).text : D.plainText(mm.model); },
    async letter(a, profile) {
      const cvText = await engine.cvText(a), an = a.analysis || {};
      const L = await A.coverLetter({ key: state.key, model: state.model, app: a, profile, cvText });
      const lines = [ukDate(), '', `**Re: ${a.role || (an.job && an.job.title) || ''}${a.company ? ', ' + a.company : ''}**`, '', L.salutation || 'Dear Hiring Manager,', ''];
      (L.paragraphs || []).forEach(p => lines.push(p, ''));
      lines.push(L.signoff || 'Kind regards,', '', L.name || an.candidate_name || profile.name || '');
      await commit(a, f => { f.letter = lines.join('\n'); });
    },
    async outreach(a, profile) { const o = await A.outreach({ key: state.key, model: state.model, app: a, profile, cvText: await engine.cvText(a) }); await commit(a, f => { f.outreach = o; }); },
    async answers(a, profile) {
      a.answers = a.answers || { why: '', salary: '', notice: '', qa: [] };
      const out = await A.answers({ key: state.key, model: state.model, app: a, profile, cvText: await engine.cvText(a), questions: [] });
      const ans = a.answers;
      if (!ans.why && out.why) ans.why = out.why; if (!ans.salary && out.salary) ans.salary = out.salary; if (!ans.notice && out.notice) ans.notice = out.notice;
      await S.saveApp(a);
    },
    async interview(a, profile) { const iv = await A.interviewPrep({ key: state.key, model: state.model, app: a, profile, cvText: await engine.cvText(a) }); await commit(a, f => { f.interview = iv; }); }
  };
  /** Save a result into the latest copy of the application, so edits made meanwhile are kept. */
  async function commit(a, fn) {
    const f = (await S.getApp(a.id)) || a;
    fn(f); await S.saveApp(f);
    if (f !== a) Object.assign(a, f);
  }

  window.CVT.views = Object.assign(window.CVT.views || {}, { workspace });
  window.CVT.engine = engine;
})();
