/* views.js — Dashboard, Pipeline, Career profile, Settings. */
(function () {
  const { html, raw, esc, $, $$, toast, download, copy, today, ukDate, longDate, daysBetween, VERDICT, scoreCls, state, masterModel } = window.CVT.ui;
  const S = window.CVT.store, A = window.CVT.agent, D = window.CVT.docx;
  const enc = encodeURIComponent;
  const ACTIVE = ['Applied', 'Screening', 'Interview', 'Offer'];
  const REACHED = s => ['Screening', 'Interview', 'Offer', 'Accepted'].includes(s);

  // ---------- shared bits ----------
  const fitChip = a => a.analysis && a.analysis.fit && a.analysis.fit.score != null
    ? html`<span class="chip ${scoreCls(a.analysis.fit.score)}" title="Fit score">${a.analysis.fit.score}</span>` : '';
  const verdictChip = a => {
    const v = a.analysis && a.analysis.decision && VERDICT[a.analysis.decision.verdict];
    return v ? html`<span class="chip ${v.cls}">${v.label}</span>` : '';
  };
  function dueChip(next) {
    if (!next || !next.due) return '';
    const d = daysBetween(today(), next.due);
    const cls = d < 0 ? 'bad' : d === 0 ? 'warn' : 'muted';
    const txt = d < 0 ? `${-d}d overdue` : d === 0 ? 'Due today' : d === 1 ? 'Tomorrow' : `In ${d}d`;
    return html`<span class="chip ${cls}">${txt}</span>`;
  }
  const appTitle = a => (a.role || 'Untitled role') + (a.company ? ' · ' + a.company : '');
  const openHref = a => `#/app/${a.id}/${a.analysis && !a.analysis.legacy ? 'fit' : 'job'}`;

  function searchLinks(role, loc, pref) {
    const jt = pref === 'Contract' ? '&f_JT=C' : pref === 'Permanent' ? '&f_JT=F' : '';
    const s = x => x.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const uk = /united kingdom|^uk$/i.test(loc);
    return [
      { name: 'LinkedIn · 24h', href: `https://www.linkedin.com/jobs/search/?keywords=${enc(role)}&location=${enc(loc)}&f_TPR=r86400${jt}` },
      { name: 'Indeed · 24h', href: `https://uk.indeed.com/jobs?q=${enc(role)}&l=${enc(uk ? '' : loc)}&fromage=1` },
      { name: 'Reed', href: `https://www.reed.co.uk/jobs/${s(role)}-jobs${uk ? '' : '-in-' + s(loc)}` }
    ];
  }

  // =====================================================================
  // DASHBOARD
  // =====================================================================
  async function dashboard(root) {
    const [apps, profile, masters] = await Promise.all([S.listApps(), S.getProfile(), S.listMasters()]);
    const t = today();
    const applied = apps.filter(a => a.appliedAt || (a.history || []).some(h => h.status === 'Applied'));
    const week = applied.filter(a => a.appliedAt && daysBetween(a.appliedAt) <= 6);
    const responded = applied.filter(a => (a.history || []).some(h => REACHED(h.status)));
    const interviews = apps.filter(a => (a.history || []).some(h => h.status === 'Interview'));
    const active = apps.filter(a => ACTIVE.includes(a.status));
    const goal = Math.max(1, Number(profile.weeklyGoal) || 5);
    const rate = applied.length ? Math.round(100 * responded.length / applied.length) : null;
    const due = apps.filter(a => a.next && a.next.due).sort((a, b) => a.next.due.localeCompare(b.next.due));
    const overdue = due.filter(a => a.next.due < t);
    const hour = new Date().getHours();
    const hello = (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') + (profile.name ? ', ' + profile.name.split(' ')[0] : '');

    // Coach notes: rule-based, most important first.
    const notes = [];
    if (!masters.length) notes.push({ cls: 'bad', text: 'Upload your master CV so the agent has something to tailor.', href: '#/profile', cta: 'Career profile' });
    if (!state.key) notes.push({ cls: 'bad', text: 'Switch the agent on: use your Claude plan or a free Gemini key.', href: '#/settings', cta: 'Settings' });
    if (overdue.length) notes.push({ cls: 'warn', text: `${overdue.length} follow-up${overdue.length > 1 ? 's are' : ' is'} overdue. A short chase doubles the chance of a reply.`, href: '#/pipeline', cta: 'Pipeline' });
    if ((profile.achievements || []).filter(Boolean).length < 5) notes.push({ cls: 'accent', text: 'Add at least 5 achievements with numbers. The agent may quote them, which makes tailoring stronger without inventing anything.', href: '#/profile', cta: 'Achievements' });
    if (week.length < goal) notes.push({ cls: 'muted', text: `${goal - week.length} more application${goal - week.length > 1 ? 's' : ''} to reach this week's goal of ${goal}. Quality beats volume: aim for roles that score 70+.` });
    if (applied.length >= 10 && rate !== null && rate < 10) notes.push({ cls: 'warn', text: `Response rate is ${rate}%. Tighten targeting to 70+ fits and message the recruiter or hiring manager the same day you apply.` });
    const stale = apps.filter(a => ['Saved', 'Tailored'].includes(a.status) && daysBetween(a.updated) > 5);
    if (stale.length) notes.push({ cls: 'muted', text: `${stale.length} prepared application${stale.length > 1 ? 's have' : ' has'} sat for over 5 days. Roles often close within two weeks.`, href: '#/pipeline', cta: 'Review' });
    const needPrep = apps.filter(a => ['Screening', 'Interview'].includes(a.status) && !a.interview);
    needPrep.slice(0, 2).forEach(a => notes.push({ cls: 'accent', text: `Prepare for ${a.company || 'your'} ${a.status.toLowerCase()}: questions, STAR answers and a 90-day plan.`, href: `#/app/${a.id}/interview`, cta: 'Interview prep' }));
    if (!(profile.targetRoles || []).length) notes.push({ cls: 'muted', text: 'Add your target job titles to get one-click job searches here.', href: '#/profile', cta: 'Targets' });

    const roles = (profile.targetRoles || []).length ? profile.targetRoles : ['SAP Ariba Consultant', 'SAP S2P Solution Architect', 'SAP Procurement Lead'];
    const locs = (profile.targetLocations || []).length ? profile.targetLocations : ['United Kingdom'];

    root.innerHTML = html`
      <header class="page-head">
        <div><p class="eyebrow">${longDate()}</p><h1>${hello}</h1></div>
        <a class="btn primary" href="#/new">New application</a>
      </header>

      <section class="kpis" aria-label="Your numbers">
        <div class="kpi">
          <span class="kpi-label">Applied this week</span>
          <span class="kpi-num">${week.length}<small>/ ${goal}</small></span>
          <div class="meter" aria-hidden="true"><span style="width:${Math.min(100, Math.round(100 * week.length / goal))}%"></span></div>
        </div>
        <div class="kpi">
          <span class="kpi-label">Active applications</span>
          <span class="kpi-num">${active.length}</span>
          <span class="kpi-sub">${apps.filter(a => ['Saved', 'Tailored'].includes(a.status)).length} being prepared</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Response rate</span>
          <span class="kpi-num">${rate === null ? '—' : rate + '%'}</span>
          <span class="kpi-sub">${responded.length} of ${applied.length} applied reached screening</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Interviews</span>
          <span class="kpi-num">${interviews.length}</span>
          <span class="kpi-sub">${apps.filter(a => a.status === 'Offer' || a.status === 'Accepted').length} offer(s)</span>
        </div>
      </section>

      <div class="dash-grid">
        <section class="panel">
          <div class="panel-head"><h2>Next actions</h2><a class="link" href="#/pipeline">Pipeline</a></div>
          ${due.length ? html`<ul class="actions">${due.slice(0, 8).map(a => html`
            <li class="${a.next.due < t ? 'overdue' : ''}">
              <div class="action-main">
                <a href="#/app/${a.id}/${a.status === 'Interview' || a.status === 'Screening' ? 'interview' : 'outreach'}">${a.next.text}</a>
                <span class="muted small">${appTitle(a)}</span>
              </div>
              <div class="action-side">${dueChip(a.next)}
                <button class="icon-btn" data-act="done" data-id="${a.id}" title="Mark done" aria-label="Mark done">✓</button>
                <button class="icon-btn" data-act="snooze" data-id="${a.id}" title="Snooze 2 days" aria-label="Snooze 2 days">+2d</button>
              </div>
            </li>`)}</ul>`
            : html`<p class="empty-note">Nothing due. When you mark a job as applied, a follow-up is scheduled for 7 days later.</p>`}
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Coach notes</h2></div>
          ${notes.length ? html`<ul class="notes">${notes.slice(0, 5).map(n => html`
            <li class="note ${n.cls}"><span>${n.text}</span>${n.href ? html`<a class="link" href="${n.href}">${n.cta}</a>` : ''}</li>`)}</ul>`
            : html`<p class="empty-note">You're on track. Keep going.</p>`}
        </section>

        <section class="panel wide">
          <div class="panel-head">
            <h2>Find new roles</h2>
            <label class="inline-field">Location
              <select id="search-loc">${locs.map(l => html`<option>${l}</option>`)}</select>
            </label>
          </div>
          <p class="hint">Opens each board filtered to your target titles${profile.workPreference && profile.workPreference !== 'Both' ? ' and ' + profile.workPreference.toLowerCase() + ' roles' : ''}. Paste a good one into “New application”.</p>
          <div class="search-rows" id="search-rows"></div>
        </section>

        <section class="panel wide">
          <div class="panel-head"><h2>Recent applications</h2><a class="link" href="#/pipeline">See all</a></div>
          ${apps.length ? html`<div class="table-wrap"><table class="list">
            <thead><tr><th>Role</th><th>Status</th><th>Fit</th><th>Decision</th><th>Updated</th></tr></thead>
            <tbody>${apps.slice(0, 6).map(a => html`<tr>
              <td><a href="${openHref(a)}">${appTitle(a)}</a></td>
              <td><span class="status s-${a.status.toLowerCase()}">${a.status}</span></td>
              <td>${fitChip(a) || html`<span class="muted">—</span>`}</td>
              <td>${verdictChip(a) || html`<span class="muted">—</span>`}</td>
              <td class="muted">${ukDate(a.updated)}</td></tr>`)}</tbody></table></div>`
            : html`<p class="empty-note">No applications yet. Start with <a class="link" href="#/new">New application</a>.</p>`}
        </section>
      </div>`;

    const drawSearch = () => {
      const loc = $('#search-loc', root).value;
      $('#search-rows', root).innerHTML = roles.map(r => html`<div class="search-row">
        <span class="search-role">${r}</span>
        <span class="search-links">${searchLinks(r, loc, profile.workPreference).map(l => html`<a class="pill-link" href="${l.href}" target="_blank" rel="noopener">${l.name}</a>`)}</span>
      </div>`).join('');
    };
    drawSearch();
    $('#search-loc', root).addEventListener('change', drawSearch);

    root.addEventListener('click', async e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const a = await S.getApp(b.dataset.id); if (!a) return;
      if (b.dataset.act === 'done') { a.next = null; toast('Marked done'); }
      if (b.dataset.act === 'snooze') { a.next.due = S.addDays(a.next.due < today() ? today() : a.next.due, 2); toast('Snoozed 2 days'); }
      await S.saveApp(a); window.CVT.app.rerender();
    });
  }

  // =====================================================================
  // PIPELINE
  // =====================================================================
  async function pipeline(root) {
    const apps = await S.listApps();
    root.innerHTML = html`
      <header class="page-head">
        <div><p class="eyebrow">${apps.length} application${apps.length === 1 ? '' : 's'}</p><h1>Pipeline</h1></div>
        <div class="row gap wrap">
          <input id="pl-search" type="search" placeholder="Search company or role" aria-label="Search applications">
          <select id="pl-type" aria-label="Filter by type"><option value="">All types</option><option>Permanent</option><option>Contract</option><option>Fixed-term</option></select>
          <button class="btn ghost" id="pl-csv" type="button">Export CSV</button>
          <a class="btn primary" href="#/new">New application</a>
        </div>
      </header>
      <div class="board-wrap"><div class="board" id="board"></div></div>`;

    const draw = () => {
      const q = $('#pl-search', root).value.toLowerCase().trim();
      const type = $('#pl-type', root).value;
      const list = apps.filter(a => (!q || (a.company + ' ' + a.role).toLowerCase().includes(q)) && (!type || (a.contractType || '').toLowerCase() === type.toLowerCase()));
      $('#board', root).innerHTML = S.COLUMNS.map(col => {
        const items = list.filter(a => col.statuses.includes(a.status));
        return html`<section class="col" aria-label="${col.title}">
          <header class="col-head"><h2>${col.title}</h2><span class="count">${items.length}</span></header>
          <div class="col-body">${items.length ? items.map(a => html`
            <article class="card-app">
              <a class="card-title" href="${openHref(a)}">${a.role || 'Untitled role'}</a>
              <div class="card-co">${a.company || '—'}${a.location ? html` <span class="muted">· ${a.location}</span>` : ''}</div>
              <div class="card-chips">${fitChip(a)}${verdictChip(a)}${a.contractType ? html`<span class="chip muted">${a.contractType}</span>` : ''}${a.appliedAt ? html`<span class="chip muted">${daysBetween(a.appliedAt)}d since applied</span>` : ''}</div>
              ${a.next ? html`<div class="card-next">${dueChip(a.next)}<span>${a.next.text}</span></div>` : ''}
              <label class="card-status"><span class="sr">Status</span>
                <select data-status="${a.id}">${S.STATUSES.map(s => html`<option ${s === a.status ? raw('selected') : ''}>${s}</option>`)}</select>
              </label>
            </article>`) : html`<p class="col-empty">—</p>`}</div>
        </section>`;
      }).join('');
    };
    draw();
    $('#pl-search', root).addEventListener('input', draw);
    $('#pl-type', root).addEventListener('change', draw);
    root.addEventListener('change', async e => {
      const sel = e.target.closest('[data-status]'); if (!sel) return;
      const a = apps.find(x => x.id === sel.dataset.status);
      S.setStatus(a, sel.value); await S.saveApp(a);
      toast(`Moved to ${sel.value}` + (a.next ? ` · next: ${a.next.text.toLowerCase()}` : ''));
      draw();
    });
    $('#pl-csv', root).addEventListener('click', () => {
      const cols = ['created', 'company', 'role', 'location', 'contractType', 'pay', 'status', 'appliedAt', 'fit', 'decision', 'recruiter', 'agency', 'url', 'nextAction', 'nextDue', 'notes'];
      const val = (a, c) => c === 'fit' ? (a.analysis && a.analysis.fit ? a.analysis.fit.score : '') : c === 'decision' ? (a.analysis && a.analysis.decision ? a.analysis.decision.verdict : '') : c === 'nextAction' ? (a.next ? a.next.text : '') : c === 'nextDue' ? (a.next ? a.next.due : '') : a[c];
      const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [cols.join(','), ...apps.map(a => cols.map(c => q(val(a, c))).join(','))].join('\r\n');
      download(new Blob(['﻿' + csv], { type: 'text/csv' }), `applications_${today()}.csv`);
    });
  }

  // =====================================================================
  // CAREER PROFILE
  // =====================================================================
  async function profile(root) {
    const [p, masters] = await Promise.all([S.getProfile(), S.listMasters()]);
    const lines = arr => (arr || []).join('\n');
    const field = (key, label, attrs = {}) => html`<label class="field"><span>${label}</span><input data-p="${key}" type="${attrs.type || 'text'}" value="${p[key] ?? ''}" placeholder="${attrs.ph || ''}" autocomplete="off"></label>`;

    root.innerHTML = html`
      <header class="page-head">
        <div><p class="eyebrow">Used by every tailoring, letter and form answer</p><h1>Career profile</h1></div>
        <span class="muted small" id="p-saved" aria-live="polite"></span>
      </header>

      <section class="panel">
        <div class="panel-head"><h2>Master CVs</h2></div>
        <p class="hint">Keep one Word CV per positioning, for example “Ariba consultant” and “S2P architect / lead”. Each application picks one. Files stay in this browser.</p>
        <div class="masters">${masters.map(m => html`
          <div class="master">
            <span class="file-ext">DOCX</span>
            <input class="master-name" data-mname="${m.id}" value="${m.name}" aria-label="CV name">
            <span class="muted small">${m.fileName}</span>
            ${m.isDefault ? html`<span class="chip accent">Default</span>` : html`<button class="btn ghost small" data-mact="default" data-id="${m.id}" type="button">Make default</button>`}
            <button class="btn ghost small" data-mact="preview" data-id="${m.id}" type="button">Preview</button>
            <button class="btn ghost small danger" data-mact="remove" data-id="${m.id}" type="button">Remove</button>
          </div>`)}</div>
        <label class="drop" id="m-drop">
          <input type="file" id="m-file" accept=".docx">
          <span class="drop-title">${masters.length ? 'Add another master CV (.docx)' : 'Drop your master CV (.docx) here or choose a file'}</span>
          <span class="drop-sub">Word .docx only. PDFs can't be edited without changing the layout.</span>
        </label>
        <div class="preview-box" id="m-preview" hidden></div>
      </section>

      <div class="two-col">
        <section class="panel">
          <div class="panel-head"><h2>About you</h2></div>
          <p class="hint">Used for application forms and letters. Only what you'd put on a form anyway.</p>
          <div class="grid-2">
            ${field('name', 'Full name')}
            ${field('email', 'Email', { type: 'email' })}
            ${field('phone', 'Mobile', { type: 'tel' })}
            ${field('linkedin', 'LinkedIn URL', { type: 'url', ph: 'https://www.linkedin.com/in/…' })}
            ${field('city', 'Town / city')}
            ${field('postcode', 'Postcode')}
            ${field('currentTitle', 'Current job title')}
            ${field('currentCompany', 'Current employer')}
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Targets</h2></div>
          <div class="grid-2">
            <label class="field span-2"><span>Target job titles (one per line)</span><textarea data-p="targetRoles" data-list rows="4" placeholder="SAP Ariba Solution Architect&#10;S2P Programme Lead&#10;SAP Procurement Consultant">${lines(p.targetRoles)}</textarea></label>
            <label class="field span-2"><span>Preferred locations (one per line)</span><textarea data-p="targetLocations" data-list rows="2">${lines(p.targetLocations)}</textarea></label>
            <label class="field"><span>Work preference</span><select data-p="workPreference">${['Both', 'Permanent', 'Contract'].map(o => html`<option ${o === p.workPreference ? raw('selected') : ''}>${o}</option>`)}</select></label>
            ${field('weeklyGoal', 'Weekly application goal', { type: 'number' })}
            ${field('salary', 'Salary expectation', { ph: 'e.g. £95,000–£110,000 + bonus' })}
            ${field('dayRate', 'Day rate expectation', { ph: 'e.g. £650–£750 outside IR35' })}
            ${field('notice', 'Notice / availability', { ph: 'e.g. 1 month' })}
            ${field('eligibility', 'Work eligibility (for forms)', { ph: 'As you would answer on a form' })}
          </div>
        </section>
      </div>

      <section class="panel">
        <div class="panel-head"><h2>Achievements bank</h2><button class="btn ghost small" id="ach-add" type="button">Add achievement</button></div>
        <p class="hint">True, specific results the agent may quote. Format: what you did, scale, result. Example: “Led Guided Buying rollout to 12,000 users across 9 countries; cut PO cycle time by 40%.”</p>
        <ol class="ach" id="ach">${(p.achievements || []).map((x, i) => html`<li><textarea data-ach="${i}" rows="2" aria-label="Achievement ${i + 1}">${x}</textarea><button class="icon-btn" data-achdel="${i}" type="button" aria-label="Remove achievement">×</button></li>`)}</ol>
        <label class="field"><span>Never claim (the agent will not write or imply these)</span><textarea data-p="neverClaim" rows="2" placeholder="e.g. Hands-on ABAP development; SAP IBP">${p.neverClaim || ''}</textarea></label>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>LinkedIn profile</h2><button class="btn primary small" id="li-run" type="button">Suggest headline and About</button></div>
        <p class="hint">Recruiters search LinkedIn by keywords. This suggests a headline, About section and skills from your default CV and targets.</p>
        <p class="error" id="li-err" hidden></p>
        <div id="li-out">${p.linkedinSuggestions ? linkedinOut(p.linkedinSuggestions) : ''}</div>
      </section>`;

    let timer;
    const save = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => { await S.saveProfile(p); state.profile = p; $('#p-saved', root).textContent = 'Saved'; setTimeout(() => { const s = $('#p-saved', root); if (s) s.textContent = ''; }, 1500); }, 350);
    };
    root.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.p) {
        p[t.dataset.p] = t.hasAttribute('data-list') ? t.value.split('\n').map(s => s.trim()).filter(Boolean) : t.type === 'number' ? Number(t.value) : t.value;
        save();
      } else if (t.dataset.ach) { p.achievements[Number(t.dataset.ach)] = t.value; save(); }
      else if (t.dataset.mname) { clearTimeout(t._t); t._t = setTimeout(async () => { const m = await S.getMaster(t.dataset.mname); m.name = t.value.trim() || 'CV'; await S.saveMaster(m); }, 400); }
    });
    root.addEventListener('change', e => { if (e.target.tagName === 'SELECT' && e.target.dataset.p) { p[e.target.dataset.p] = e.target.value; save(); } });
    $('#ach-add', root).addEventListener('click', async () => { p.achievements = (p.achievements || []).concat(''); await S.saveProfile(p); await window.CVT.app.rerender(); const all = $$('[data-ach]'); if (all.length) all[all.length - 1].focus(); });

    root.addEventListener('click', async e => {
      const del = e.target.closest('[data-achdel]');
      if (del) { p.achievements.splice(Number(del.dataset.achdel), 1); await S.saveProfile(p); return window.CVT.app.rerender(); }
      const b = e.target.closest('[data-mact]'); if (!b) return;
      const id = b.dataset.id;
      if (b.dataset.mact === 'default') { await S.setDefaultMaster(id); toast('Default CV updated'); return window.CVT.app.rerender(); }
      if (b.dataset.mact === 'preview') {
        const box = $('#m-preview', root); box.hidden = false;
        const m = await S.getMaster(id);
        box.innerHTML = '';
        if (window.docx && window.docx.renderAsync) await window.docx.renderAsync(m.data.slice(0), box, null, { inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true });
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      if (b.dataset.mact === 'remove') {
        if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Click to confirm'; return; }
        await S.removeMaster(id); state.masterCache.delete(id); toast('CV removed'); return window.CVT.app.rerender();
      }
    });

    const addFile = async file => {
      if (!file || !/\.docx$/i.test(file.name)) return toast('Please choose a Word .docx file.', 'warn');
      try {
        const buf = await file.arrayBuffer();
        const model = await D.load(buf.slice(0));
        await S.addMaster(file.name.replace(/\.docx$/i, ''), file.name, buf);
        const editable = model.paras.filter(x => x.text.trim() && !x.locked).length;
        toast(`Added. ${editable} paragraphs can be tailored.`);
        window.CVT.app.rerender();
      } catch (err) { toast(err.message, 'bad'); }
    };
    $('#m-file', root).addEventListener('change', e => addFile(e.target.files[0]));
    const drop = $('#m-drop', root);
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => addFile(e.dataTransfer.files[0]));

    $('#li-run', root).addEventListener('click', async e => {
      const btn = e.currentTarget, err = $('#li-err', root);
      err.hidden = true;
      const mm = await masterModel();
      if (!mm) { err.textContent = 'Upload a master CV first.'; err.hidden = false; return; }
      btn.disabled = true; btn.textContent = 'Thinking…';
      try {
        const out = await A.linkedin({ key: state.key, model: state.model, profile: p, cvText: D.plainText(mm.model) });
        p.linkedinSuggestions = out; await S.saveProfile(p);
        $('#li-out', root).innerHTML = linkedinOut(out);
      } catch (x) { err.textContent = x.message; err.hidden = false; }
      finally { btn.disabled = false; btn.textContent = 'Suggest headline and About'; }
    });
    root.addEventListener('click', e => { const c = e.target.closest('[data-copy]'); if (c) copy(c.closest('.copy-block').querySelector('.copy-src').innerText, c); });
  }

  function linkedinOut(o) {
    return String(html`
      <div class="copy-grid">
        ${(o.headlines || []).map((h, i) => html`<div class="copy-block"><div class="copy-head"><h3>Headline option ${i + 1}</h3><span class="muted small">${h.length}/220</span><button class="btn ghost small" data-copy type="button">Copy</button></div><p class="copy-src">${h}</p></div>`)}
        <div class="copy-block span-all"><div class="copy-head"><h3>About</h3><button class="btn ghost small" data-copy type="button">Copy</button></div><p class="copy-src pre">${o.about || ''}</p></div>
        <div class="copy-block"><div class="copy-head"><h3>Skills to list</h3></div><div class="kw">${(o.skills || []).map(s => html`<span class="chip muted">${s}</span>`)}</div></div>
        <div class="copy-block"><div class="copy-head"><h3>Open to Work titles</h3></div><div class="kw">${(o.open_to_work || []).map(s => html`<span class="chip muted">${s}</span>`)}</div></div>
        <div class="copy-block span-all"><div class="copy-head"><h3>Improvements</h3></div><ul class="tight">${(o.tips || []).map(t => html`<li>${t}</li>`)}</ul></div>
      </div>`);
  }

  // =====================================================================
  // SETTINGS
  // =====================================================================
  async function settings(root) {
    const inClaude = window.CVT.app.inClaude();
    root.innerHTML = html`
      <header class="page-head"><div><p class="eyebrow">Stored only in this browser</p><h1>Settings</h1></div></header>
      <div class="two-col">
        <section class="panel span-2 engine">
          <div class="panel-head"><h2>AI engine</h2><span class="muted small" id="key-status" aria-live="polite"></span></div>
          <p class="hint">Pick what writes your tailoring, letters and answers. Two options cost nothing extra.</p>
          <div class="engines">
            <label class="engine-opt ${state.provider === 'claude-plan' ? 'on' : ''} ${inClaude ? '' : 'disabled'}">
              <input type="radio" name="provider" value="claude-plan" ${state.provider === 'claude-plan' ? raw('checked') : ''} ${inClaude ? '' : raw('disabled')}>
              <span class="engine-name">Your Claude plan <span class="chip ok">No extra cost</span></span>
              <span class="engine-sub">Uses the Claude subscription you already pay for. Works when CV Tailor is opened from claude.ai. No key needed.</span>
              ${inClaude ? '' : html`<span class="engine-sub"><strong>Not available on this web address.</strong> Open your CV Tailor link on claude.ai to use it.</span>`}
            </label>
            <label class="engine-opt ${state.provider === 'gemini' ? 'on' : ''}">
              <input type="radio" name="provider" value="gemini" ${state.provider === 'gemini' ? raw('checked') : ''}>
              <span class="engine-name">Google Gemini <span class="chip ok">Free tier</span></span>
              <span class="engine-sub">Free key from <a class="link" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">aistudio.google.com</a>, no card needed. Daily limits apply; free-tier prompts may be used by Google to improve its models.</span>
            </label>
            <label class="engine-opt ${state.provider === 'anthropic' ? 'on' : ''}">
              <input type="radio" name="provider" value="anthropic" ${state.provider === 'anthropic' ? raw('checked') : ''}>
              <span class="engine-name">Anthropic API <span class="chip muted">Pay as you go</span></span>
              <span class="engine-sub">Key from console.anthropic.com. A few pence per application.</span>
            </label>
          </div>
          <div class="engine-form" id="engine-form"></div>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Autofill bookmarklet</h2></div>
          <p class="hint">Drag this button to your bookmarks bar once. On a job application form, click it to fill the fields it recognises. It never submits.</p>
          <p class="row gap wrap"><a class="bookmarklet" id="bm" href="#">⤓ CV Tailor autofill</a><button class="btn ghost small" id="bm-copy" type="button">Copy bookmark code</button></p>
          <ol class="tight small">
            <li>Show the bookmarks bar (Ctrl+Shift+B).</li>
            <li>Drag the button above onto it. If dragging doesn't work, press <strong>Copy bookmark code</strong>, add a new bookmark named “CV Tailor autofill” and paste the code as its URL.</li>
            <li>In an application, go to <strong>Apply</strong>, press <strong>Copy autofill pack</strong>, open the employer's form and click the bookmark.</li>
          </ol>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Backup</h2></div>
          <p class="hint">Browser data can be cleared by the browser. Export a backup now and then, especially before switching computers.</p>
          <div class="row gap wrap">
            <button class="btn ghost" id="export" type="button">Export backup (.json)</button>
            <label class="btn ghost">Import backup<input type="file" id="import" accept=".json,application/json" hidden></label>
          </div>
          <p class="muted small" id="backup-status" aria-live="polite"></p>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Reset</h2></div>
          <p class="hint">Removes your CVs, profile, applications and API key from this browser.</p>
          <button class="btn ghost danger" id="clear" type="button">Clear all data</button>
        </section>
      </div>`;

    $('#bm', root).href = window.CVT.bookmarklet();
    $('#bm', root).addEventListener('click', e => { e.preventDefault(); toast('Drag this button to your bookmarks bar instead of clicking it.', 'warn'); });
    $('#bm-copy', root).addEventListener('click', e => copy(window.CVT.bookmarklet(), e.currentTarget));

    const drawEngine = () => {
      const f = $('#engine-form', root), p = state.provider;
      if (p === 'claude-plan') { f.innerHTML = String(html`<p class="small">Ready. The first time you run the agent, claude.ai asks you to allow this page to use your Claude plan. Choose <strong>Allow</strong>.</p>`); return; }
      const key = p === 'gemini' ? state.geminiKey : state.anthropicKey;
      const cur = p === 'gemini' ? state.geminiModel : state.anthropicModel;
      f.innerHTML = String(html`<div class="grid-2">
          <label class="field"><span>${p === 'gemini' ? 'Gemini API key' : 'Anthropic API key'}</span><input id="api-key" type="password" autocomplete="off" placeholder="${p === 'gemini' ? 'AIza…' : 'sk-ant-…'}" value="${key}"></label>
          <label class="field"><span>Model</span><select id="model">${state.models.length ? state.models.map(m => html`<option value="${m.id}" ${m.id === cur ? raw('selected') : ''}>${m.name} · ${m.id}</option>`) : html`<option value="${cur}">${cur || 'Save a key to load models'}</option>`}</select></label>
        </div>
        <div class="row gap wrap"><button class="btn primary" id="save-key" type="button">Save and test</button>
          <label class="check"><input type="checkbox" id="remember-key" checked> Remember on this device</label></div>
        <p class="hint">${p === 'gemini' ? 'A Flash model is fast and free; a Pro model writes better but has tighter free limits.' : 'Use a Sonnet or Opus model for tailoring and letters.'}</p>`);
      $('#save-key', root).addEventListener('click', async () => {
        const v = $('#api-key', root).value.trim();
        const k = p === 'gemini' ? 'cvt.geminiKey' : 'cvt.key';
        S.local.del(k);
        if (v) S.local.set(k, v, !$('#remember-key', root).checked);
        if (p === 'gemini') state.geminiKey = v; else state.anthropicKey = v;
        $('#key-status', root).textContent = v ? 'Checking…' : 'Key removed.';
        const ok = v ? await window.CVT.app.loadModels() : (window.CVT.app.refreshKey(), false);
        $('#key-status', root).textContent = ok ? `Connected. ${state.models.length} models available.` : v ? state.lastError : '';
        drawEngine();
      });
      $('#model', root).addEventListener('change', e => {
        if (p === 'gemini') { state.geminiModel = e.target.value; S.local.set('cvt.geminiModel', state.geminiModel); }
        else { state.anthropicModel = e.target.value; S.local.set('cvt.model', state.anthropicModel); }
        window.CVT.app.refreshKey();
      });
    };
    $$('input[name="provider"]', root).forEach(r => r.addEventListener('change', async () => {
      state.provider = r.value; state.models = [];
      S.local.set('cvt.provider', state.provider);
      $$('.engine-opt', root).forEach(o => o.classList.toggle('on', o.querySelector('input').checked));
      window.CVT.app.refreshKey();
      $('#key-status', root).textContent = '';
      if ((r.value === 'gemini' && state.geminiKey) || (r.value === 'anthropic' && state.anthropicKey)) { $('#key-status', root).textContent = 'Checking…'; const ok = await window.CVT.app.loadModels(); $('#key-status', root).textContent = ok ? 'Connected.' : state.lastError; }
      drawEngine();
    }));
    drawEngine();
    if (state.provider !== 'claude-plan' && !state.models.length && (state.provider === 'gemini' ? state.geminiKey : state.anthropicKey)) window.CVT.app.loadModels().then(drawEngine);

    $('#export', root).addEventListener('click', async () => {
      const data = await S.exportAll();
      download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `cv-tailor-backup_${today()}.json`);
      $('#backup-status', root).textContent = `Exported ${data.masters.length} CV(s) and ${data.apps.length} application(s).`;
    });
    $('#import', root).addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      try { const r = await S.importAll(JSON.parse(await f.text())); state.masterCache.clear(); $('#backup-status', root).textContent = `Imported ${r.masters} CV(s) and ${r.apps} application(s).`; }
      catch (x) { $('#backup-status', root).textContent = x.message; }
    });
    $('#clear', root).addEventListener('click', async e => {
      const b = e.currentTarget;
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Click again to delete everything'; return; }
      await S.clearAll(); state.key = ''; state.model = ''; state.masterCache.clear();
      toast('All data cleared'); location.hash = '#/dashboard'; location.reload();
    });
  }

  window.CVT.views = Object.assign(window.CVT.views || {}, { dashboard, pipeline, profile, settings, helpers: { fitChip, verdictChip, dueChip, appTitle } });
})();
