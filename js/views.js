/* views.js — Dashboard, Pipeline, Career profile, Settings. */
(function () {
  const { html, raw, esc, $, $$, toast, download, copy, today, ukDate, longDate, daysBetween, VERDICT, scoreCls, state, masterModel } = window.CVT.ui;
  const S = window.CVT.store, A = window.CVT.agent, D = window.CVT.docx;
  const FL = window.CVT.fields;
  const VERSION = 'v5.2';
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

  // =====================================================================
  // DASHBOARD
  // =====================================================================
  async function drawPrep(root) {
    const box = $('#dash-prep', root); if (!box) return;
    const P = window.CVT.prep;
    const [ups, due, stories] = await Promise.all([P.upcoming(), P.dueCount(), S.getKV('stories', [])]);
    const when = iso => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    box.innerHTML = String(html`
      <div class="panel-head"><h2>Interview prep</h2><a class="link" href="#/prep">Open Prep</a></div>
      <div class="prep-strip">
        <div class="prep-tile">
          <span class="kpi-label">Upcoming interviews</span>
          ${ups.length ? html`<ul class="tight small">${ups.slice(0, 3).map(a => html`<li><a class="link" href="#/app/${a.id}/interview">${a.company || a.role}</a> · ${when(a.interviewAt)}</li>`)}</ul>` : html`<p class="muted small">None booked. Add the slot on an application's Interview tab to get calendar reminders.</p>`}
        </div>
        <div class="prep-tile"><span class="kpi-label">Mock interview</span><p class="small">Practise with an AI interviewer, then get scored.</p><a class="btn small primary" href="#/prep/mock${ups[0] ? '/' + ups[0].id : ''}">${ups[0] ? 'Practise for ' + (ups[0].company || 'next interview') : 'Start practising'}</a></div>
        <div class="prep-tile"><span class="kpi-label">Drill cards</span><p class="kpi-num small-num">${due}<small> due</small></p><a class="btn small ghost" href="#/prep/drills">Review now</a></div>
        <div class="prep-tile"><span class="kpi-label">Story bank</span><p class="kpi-num small-num">${(stories || []).length}<small> stories</small></p><a class="btn small ghost" href="#/prep/stories">${(stories || []).length ? 'Review stories' : 'Build your stories'}</a></div>
      </div>`);
  }

  async function drawJobs(root, profile) {
    const J = window.CVT.jobs, box = $('#dash-jobs', root);
    if (!box) return;
    const avail = await J.available();
    let t = await J.top(6);
    // Keep the feed fresh without asking: only after the viewer has run it once, and at most every 6 hours.
    const stale = t.feed.lastRun && (Date.now() - new Date(t.feed.lastRun)) > 6 * 3600e3;
    const head = (extra = '') => html`<div class="panel-head"><h2>New jobs for you</h2><div class="row gap">${raw(extra)}<a class="link" href="#/jobs">All jobs</a></div></div>`;
    const paint = (note = '') => {
      box.removeAttribute('aria-busy');
      const roles = (profile.targetRoles || []).length ? profile.targetRoles : window.CVT.fields.current().titles.slice(0, 3);
      if (!t.items.length) {
        box.innerHTML = String(html`${head()}
          <div class="empty-state slim"><p class="hint">Find roles that match your target job titles and the skills on your CV, from company career portals and job boards, scored against your CV.</p>
          <button class="btn primary" id="dj-run" type="button">Find jobs now</button></div>
          <p class="small muted mt">Or search the big boards in one click:</p>
          <div class="search-rows">${roles.slice(0, 4).map(r => html`<div class="search-row"><span class="search-role">${r}</span><span class="search-links">${J.boards(r, '', window.CVT.countries.current()).slice(0, 6).map(l => html`<a class="pill-link" href="${l.href}" target="_blank" rel="noopener">${l.name}</a>`)}</span></div>`)}</div>`);
      } else {
        box.innerHTML = String(html`${head(`<span class="muted small">${note || 'Updated ' + J.relTime(t.feed.lastRun)}</span>`)}
          <div class="job-list compact">${t.items.map(r => J.jobCard(r.j, r.sc, r.dups, true))}</div>
          ${t.total > t.items.length ? html`<p class="small mt"><a class="link" href="#/jobs">See all ${t.total} jobs, market pulse and rate calculator</a></p>` : ''}`);
      }
      const run = $('#dj-run', box);
      if (run) run.addEventListener('click', async () => { run.disabled = true; run.textContent = 'Searching job sites…'; await go(); });
    };
    const go = async () => {
      try { const r = await J.refresh(); if (r.errors.length && !r.found) toast(r.errors[0].text, 'bad'); await J.checkTop(3); }
      catch (e) { toast(J.errText(e), 'bad'); }
      t = await J.top(6); paint();
      window.CVT.app.refreshBadges && window.CVT.app.refreshBadges();
    };
    paint(stale ? 'Refreshing…' : '');
    box.addEventListener('click', async e => {
      const b = e.target.closest('[data-j="import"]'); if (!b) return;
      const key = b.closest('[data-key]').dataset.key;
      b.disabled = true; b.textContent = 'Adding…';
      try { await J.details(key).catch(() => null); const id = await J.importJob(key); window.CVT.app.go(`#/app/${id}/job`); }
      catch (err) { toast(err.message, 'bad'); b.disabled = false; b.textContent = 'Tailor'; }
    });
    if (stale) go();
  }

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
    if (!state.key) notes.push({ cls: 'bad', text: 'Switch the AI on: a free Gemini key, a free Puter sign-in or Chrome\'s built-in AI.', href: '#/settings', cta: 'Settings' });
    if (overdue.length) notes.push({ cls: 'warn', text: `${overdue.length} follow-up${overdue.length > 1 ? 's are' : ' is'} overdue. A short chase doubles the chance of a reply.`, href: '#/pipeline', cta: 'Pipeline' });
    if ((profile.achievements || []).filter(Boolean).length < 5) notes.push({ cls: 'accent', text: 'Add at least 5 achievements with numbers. The agent may quote them, which makes tailoring stronger without inventing anything.', href: '#/profile', cta: 'Achievements' });
    if (week.length < goal) notes.push({ cls: 'muted', text: `${goal - week.length} more application${goal - week.length > 1 ? 's' : ''} to reach this week's goal of ${goal}. Quality beats volume: aim for roles that score 70+.` });
    if (applied.length >= 10 && rate !== null && rate < 10) notes.push({ cls: 'warn', text: `Response rate is ${rate}%. Tighten targeting to 70+ fits and message the recruiter or hiring manager the same day you apply.` });
    const stale = apps.filter(a => ['Saved', 'Tailored'].includes(a.status) && daysBetween(a.updated) > 5);
    if (stale.length) notes.push({ cls: 'muted', text: `${stale.length} prepared application${stale.length > 1 ? 's have' : ' has'} sat for over 5 days. Roles often close within two weeks.`, href: '#/pipeline', cta: 'Review' });
    const needPrep = apps.filter(a => ['Screening', 'Interview'].includes(a.status) && !a.interview);
    needPrep.slice(0, 2).forEach(a => notes.push({ cls: 'accent', text: `Prepare for ${a.company || 'your'} ${a.status.toLowerCase()}: questions, STAR answers and a 90-day plan.`, href: `#/app/${a.id}/interview`, cta: 'Interview prep' }));
    if (!(profile.targetRoles || []).length) notes.push({ cls: 'muted', text: 'Add your target job titles so the job feed searches for them.', href: '#/profile', cta: 'Targets' });

    const feedRun = !!((await S.getKV('feed', null)) || {}).lastRun;
    const setup = [
      { done: masters.length > 0, title: 'Add your master CV', text: 'Upload the Word CV you use today. Its layout is never changed.', href: '#/profile', cta: 'Upload CV' },
      { done: !!state.key, title: 'Switch on the AI agent', text: 'Free options: a Gemini key, a Puter sign-in or Chrome\'s built-in AI.', href: '#/settings', cta: 'Choose engine' },
      { done: (profile.targetRoles || []).length > 0 || feedRun, title: 'Tell it what you want', text: 'Target roles, locations and skills not on your CV. Jobs are matched against these.', href: '#/profile', cta: 'Set targets' },
      { done: apps.length > 0, title: 'Tailor your first application', text: 'Pick a job from the feed or paste any advert.', href: '#/jobs', cta: 'Find a job' }
    ];

    const initials = ((profile.name || '').trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('') || 'Me').toUpperCase();
    root.innerHTML = html`
      <header class="page-head">
        <div><p class="eyebrow">${longDate()}</p><h1>${hello}</h1></div>
        <div class="row gap wrap"><button class="btn ghost" id="dash-custom" type="button" title="Move, hide or reset the sections on this page">⚙ Customise</button><a class="btn primary" href="#/autopilot">Run autopilot</a><a class="btn ghost" href="#/new">New application</a></div>
      </header>

      <div class="dash3">
        <aside class="d-left">
          <section class="panel pcard" data-sec="profile">
            <div class="pcard-cover" aria-hidden="true"></div>
            <a class="pcard-avatar" href="#/profile" aria-label="Career profile">${initials}</a>
            <div class="pcard-body">
              <strong class="pcard-name">${profile.name || 'Your profile'}</strong>
              <span class="pcard-head">${profile.currentTitle || (profile.targetRoles || [])[0] || 'Add your headline'}</span>
              <span class="muted small">${(profile.targetLocations || [])[0] || 'United Kingdom'}</span>
            </div>
            <div class="pcard-strength"><div class="row gap"><span class="small">Profile strength</span><span class="grow-s"></span><strong class="small">${setup.filter(x => x.done).length}/${setup.length}</strong></div><div class="meter" aria-hidden="true"><span style="width:${Math.round(100 * setup.filter(x => x.done).length / setup.length)}%"></span></div></div>
            <nav class="pcard-links"><a href="#/pipeline"><span>My applications</span><strong>${apps.length}</strong></a><a href="#/jobs"><span>Jobs for you</span><strong>›</strong></a><a href="#/prep"><span>Interview prep</span><strong>›</strong></a><a href="#/profile"><span>Career profile</span><strong>›</strong></a></nav>
          </section>
          <section class="kpis kpis-v" data-sec="numbers" aria-label="Your numbers">
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
        </aside>
        <div class="d-mid">
      ${setup.every(x => x.done) ? '' : html`<section class="panel onboard" data-sec="setup" aria-label="Get started">
        <div class="panel-head"><h2>Get set up in four steps</h2><span class="row gap"><a class="link small" href="#/help">▶ Watch the 3-minute guide</a><span class="muted small">${setup.filter(x => x.done).length} of ${setup.length} done</span></span></div>
        <ol class="onboard-steps">${setup.map((x, i) => html`<li class="${x.done ? 'done' : ''}">
          <span class="step-num" aria-hidden="true">${x.done ? '✓' : i + 1}</span>
          <div><strong>${x.title}</strong><p class="muted small">${x.text}</p></div>
          ${x.done ? html`<span class="chip ok">Done</span>` : html`<a class="btn small" href="${x.href}">${x.cta}</a>`}
        </li>`)}</ol>
      </section>`}
          <section class="panel wide" id="dash-jobs" data-sec="jobs" aria-busy="true">
          <div class="panel-head"><h2>New jobs for you</h2><a class="link" href="#/jobs">All jobs</a></div>
          <p class="muted small">Loading…</p>
        </section>
          <section class="panel" data-sec="actions">
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
          <section class="panel wide" data-sec="recent">
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
        </div>
        <aside class="d-right">
          <section class="panel" data-sec="coach">
          <div class="panel-head"><h2>Coach notes</h2></div>
          ${notes.length ? html`<ul class="notes">${notes.slice(0, 5).map(n => html`
            <li class="note ${n.cls}"><span>${n.text}</span>${n.href ? html`<a class="link" href="${n.href}">${n.cta}</a>` : ''}</li>`)}</ul>`
            : html`<p class="empty-note">You're on track. Keep going.</p>`}
        </section>
          <section class="panel wide" id="dash-prep" data-sec="prep"></section>
        </aside>
      </div>`;

    drawJobs(root, profile);
    drawPrep(root);
    await window.CVT.layout.dashboard(root);

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
            </article>`) : html`<p class="col-empty">None yet</p>`}</div>
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
        <p class="hint">Keep one Word CV per positioning, for example “team leader” and “specialist”. Each application picks one. Files stay on this device.</p>
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
        <p class="row gap wrap small"><button class="btn ghost small" id="m-demo" type="button">Try with a demo CV</button><span class="muted">A fictional CV for your field, handy for a first test run.</span></p>
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
            <label class="field span-2"><span>Your field</span><select data-p="field">${Object.values(FL.list).map(f => html`<option value="${f.id}" ${f.id === FL.idOf(p) ? raw('selected') : ''}>${f.name}</option>`)}</select></label>
            <label class="field span-2"><span>Target job titles (one per line)</span><textarea data-p="targetRoles" data-list rows="4" placeholder="${FL.get(FL.idOf(p)).example}">${lines(p.targetRoles)}</textarea></label>
            <label class="field span-2"><span>Preferred locations (one per line)</span><textarea data-p="targetLocations" data-list rows="2">${lines(p.targetLocations)}</textarea></label>
            <label class="field"><span>Work preference</span><select data-p="workPreference">${['Both', 'Permanent', 'Contract'].map(o => html`<option ${o === p.workPreference ? raw('selected') : ''}>${o}</option>`)}</select></label>
            ${field('weeklyGoal', 'Weekly application goal', { type: 'number' })}
            ${field('salary', 'Salary expectation', { ph: 'e.g. your expected range + bonus' })}
            ${field('dayRate', 'Day or hourly rate (contract work)', { ph: 'Leave blank if not relevant' })}
            ${field('notice', 'Notice / availability', { ph: 'e.g. 1 month' })}
            ${field('eligibility', 'Work eligibility (for forms)', { ph: 'As you would answer on a form' })}
          </div>
        </section>
      </div>

      <section class="panel">
        <div class="panel-head"><h2>Achievements bank</h2><button class="btn ghost small" id="ach-add" type="button">Add achievement</button></div>
        <p class="hint">True, specific results the agent may quote. Format: what you did, scale, result. Example: “Led a team of 8 through a system change for 2,000 customers; cut complaints by 30%.”</p>
        <ol class="ach" id="ach">${(p.achievements || []).map((x, i) => html`<li><textarea data-ach="${i}" rows="2" aria-label="Achievement ${i + 1}">${x}</textarea><button class="icon-btn" data-achdel="${i}" type="button" aria-label="Remove achievement">×</button></li>`)}</ol>
        <label class="field"><span>Skills and experience not on my CV (true; the agent may add these where a job needs them)</span><textarea data-p="extraSkills" rows="3" placeholder="e.g. Excel pivot tables, trained 5 new starters, first-aid certificate, fluent Hindi">${p.extraSkills || ''}</textarea></label>
        <label class="field"><span>Never claim (the agent will not write or imply these)</span><textarea data-p="neverClaim" rows="2" placeholder="e.g. a qualification you don't hold, a tool you've never used">${p.neverClaim || ''}</textarea></label>
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
      timer = setTimeout(async () => { await S.saveProfile(p); state.profile = p; FL.use(p); window.CVT.jobs.resetEvidence(); $('#p-saved', root).textContent = 'Saved'; setTimeout(() => { const s = $('#p-saved', root); if (s) s.textContent = ''; }, 1500); }, 350);
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
    $('#m-demo', root).addEventListener('click', async () => {
      try { const buf = await window.CVT.demoCv(); await S.addMaster('Demo CV (fictional)', 'demo-cv.docx', buf); toast('Demo CV added. Now press New application.'); window.CVT.app.rerender(); }
      catch (err) { toast(err.message, 'bad'); }
    });
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
      <header class="page-head"><div><p class="eyebrow">Engine, sync and backup</p><h1>Settings</h1></div></header>
      <div class="two-col">
        <section class="panel span-2 engine">
          <div class="panel-head"><h2>AI engine</h2><span class="muted small" id="key-status" aria-live="polite"></span></div>
          <p class="hint">Every engine is free: Applywise never uses paid APIs, and nobody else's account is used.</p>
          <div class="engines">
            ${inClaude ? html`<label class="engine-opt ${state.provider === 'claude-plan' ? 'on' : ''}">
              <input type="radio" name="provider" value="claude-plan" ${state.provider === 'claude-plan' ? raw('checked') : ''} ${inClaude ? '' : raw('disabled')}>
              <span class="engine-name">Built-in AI <span class="chip ok">No extra cost</span></span>
              <span class="engine-sub">Runs on the AI plan of the person using Applywise (via claude.ai), so each user pays nothing extra and never uses anyone else's account. No key needed.</span>
            </label>` : ''}
            <label class="engine-opt ${state.provider === 'gemini' ? 'on' : ''}">
              <input type="radio" name="provider" value="gemini" ${state.provider === 'gemini' ? raw('checked') : ''}>
              <span class="engine-name">Google Gemini <span class="chip ok">Free tier</span></span>
              <span class="engine-sub">Best quality. Free key from <a class="link" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">aistudio.google.com</a>, no card needed. Daily limits apply; free-tier prompts may be used by Google to improve its models.</span>
            </label>
            <label class="engine-opt ${state.provider === 'puter' ? 'on' : ''}">
              <input type="radio" name="provider" value="puter" ${state.provider === 'puter' ? raw('checked') : ''}>
              <span class="engine-name">Puter AI <span class="chip ok">No key</span></span>
              <span class="engine-sub">Sign in once with a free <a class="link" href="https://puter.com" target="_blank" rel="noopener">Puter</a> account when asked. Your usage counts against your own Puter allowance, never the site's. A third-party service: its free allowance can change.</span>
            </label>
            <label class="engine-opt ${state.provider === 'chrome-ai' ? 'on' : ''}">
              <input type="radio" name="provider" value="chrome-ai" ${state.provider === 'chrome-ai' ? raw('checked') : ''}>
              <span class="engine-name">Chrome built-in AI <span class="chip muted">On this computer</span></span>
              <span class="engine-sub">Runs privately on your computer in desktop Chrome, no account or key. Smaller model: fine for questions and summaries, weaker for CV tailoring. First use downloads the model.</span>
            </label>
          </div>
          <div class="engine-form" id="engine-form"></div>
        </section>

        <section class="panel span-2">
          <div class="panel-head"><h2>Sync across devices</h2><span class="chip" id="sy-chip">…</span></div>
          <p class="hint" id="sy-text"></p>
          <div class="row gap wrap"><button class="btn ghost small" id="sy-now" type="button">Sync now</button></div>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Autofill bookmarklet</h2></div>
          <p class="hint">Drag this button to your bookmarks bar once. On a job application form, click it to fill the fields it recognises. It never submits.</p>
          <p class="row gap wrap"><a class="bookmarklet" id="bm" href="#">⤓ Applywise autofill</a><button class="btn ghost small" id="bm-copy" type="button">Copy bookmark code</button></p>
          <ol class="tight small">
            <li>Show the bookmarks bar (Ctrl+Shift+B).</li>
            <li>Drag the button above onto it. If dragging doesn't work, press <strong>Copy bookmark code</strong>, add a new bookmark named “Applywise autofill” and paste the code as its URL.</li>
            <li>In an application, go to <strong>Apply</strong>, press <strong>Copy autofill pack</strong>, open the employer's form and click the bookmark.</li>
          </ol>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Backup and move to another device</h2></div>
          <p class="hint">One file holds everything: profile, CVs, applications, documents, notes, interview prep and settings (never your AI key). Use it to move between your phone, tablet and computer: export here, open Applywise on the other device, then Import backup. Keep a copy now and then, as clearing browser data erases the app's storage.</p>
          <div class="row gap wrap">
            <button class="btn ghost" id="export" type="button">Export backup (.json)</button>
            <label class="btn ghost">Import backup<input type="file" id="import" accept=".json,application/json" hidden></label>
          </div>
          <p class="muted small" id="backup-status" aria-live="polite"></p>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Install the app</h2></div>
          <p class="hint">Add Applywise to your phone, tablet or computer. It opens full screen like any other app and your saved work is available offline.</p>
          <button class="btn primary" id="st-install" type="button" hidden>Install app</button>
          <p class="muted small">${window.CVT.pwa && window.CVT.pwa.standalone() ? 'You are using the installed app.' : 'No button? Use your browser menu → “Install app” or “Add to Home screen”. On iPhone: Safari → Share → Add to Home Screen.'}</p>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Delete all my data</h2></div>
          <p class="hint">Permanently erases your CVs, documents, profile, applications, notes and settings from this device. Export a backup first if you might want them later.${window.claude && window.claude.use ? ' Copies synced to your account are kept.' : ''} Read the <a class="link" href="privacy.html" target="_blank" rel="noopener">privacy policy</a>.</p>
          <button class="btn ghost danger" id="clear" type="button">Delete all my data</button>
        </section>
      </div>`;

    const drawSync = st => {
      const chip = $('#sy-chip', root), txt = $('#sy-text', root); if (!chip) return;
      const on = st.state === 'on' || st.state === 'syncing';
      chip.className = 'chip ' + (st.state === 'on' ? 'ok' : st.state === 'error' ? 'bad' : 'muted');
      chip.textContent = { on: 'On', syncing: 'Syncing…', error: 'Problem', unavailable: 'Not available here', off: 'Starting…' }[st.state] || st.state;
      txt.textContent = st.state === 'unavailable'
        ? 'Your data is kept privately in this browser on this device and is never sent to a server. To move it to another device, use Export backup here and Import backup there.'
        : (on ? 'Your profile, CVs, applications, stories, offers and practice progress are saved to your own private area, visible only to you (not to anyone else who opens the same link), and appear on every device where you sign in.' : '') + (st.last ? ` Last synced ${new Date(st.last).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.` : '') + (st.error ? ' ' + st.error : '');
      const b = $('#sy-now', root); if (b) b.hidden = st.state === 'unavailable';
    };
    drawSync(window.CVT.sync.status());
    const offSync = window.CVT.sync.onChange(drawSync);
    new MutationObserver((_, o) => { if (!root.isConnected) { offSync(); o.disconnect(); } }).observe(document.body, { childList: true, subtree: true });
    $('#sy-now', root).addEventListener('click', async e => { const btn = e.currentTarget; btn.disabled = true; const r = await window.CVT.sync.pull(); toast(r.changed ? `Synced: ${r.changed} update${r.changed > 1 ? 's' : ''} pulled in` : 'Everything is in sync'); if (r.changed) window.CVT.app.rerender(); else btn.disabled = false; });

    $('#bm', root).href = window.CVT.bookmarklet();
    $('#bm', root).addEventListener('click', e => { e.preventDefault(); toast('Drag this button to your bookmarks bar instead of clicking it.', 'warn'); });
    $('#bm-copy', root).addEventListener('click', e => copy(window.CVT.bookmarklet(), e.currentTarget));

    const drawEngine = () => {
      const f = $('#engine-form', root), p = state.provider;
      if (p === 'claude-plan') { f.innerHTML = String(html`<p class="small">Ready. The first time you run the agent, you are asked to allow this page to use the built-in AI. Choose <strong>Allow</strong>.</p>`); return; }
      if (p === 'puter') {
        f.innerHTML = String(html`<p class="small">Ready. The first time the agent runs, a Puter window asks you to sign in or create a free account.</p><div class="row gap wrap"><button class="btn ghost" id="puter-test" type="button">Sign in and test now</button></div>`);
        $('#puter-test', root).addEventListener('click', async e => { const b = e.currentTarget; b.disabled = true; $('#key-status', root).textContent = 'Checking…'; try { const pz = await A.loadPuter(); if (pz.auth && !pz.auth.isSignedIn()) await pz.auth.signIn(); const r = await pz.ai.chat('Reply with the word ready.'); $('#key-status', root).textContent = 'Connected: ' + String((r && r.message && r.message.content) || r).slice(0, 40); } catch (err) { $('#key-status', root).textContent = err.message || 'Puter sign-in was cancelled.'; } b.disabled = false; });
        return;
      }
      if (p === 'chrome-ai') {
        f.innerHTML = String(html`<p class="small" id="cai-state">Checking this browser…</p><div class="row gap wrap"><button class="btn ghost" id="cai-get" type="button" hidden>Download the model</button></div>`);
        A.chromeAIStatus().then(st => {
          const el = $('#cai-state', root); if (!el) return;
          el.textContent = { available: 'Ready on this computer.', downloadable: 'Supported. The model needs a one-time download (a few GB).', downloading: 'Downloading the model…', unavailable: 'Not available in this browser. Use desktop Chrome, or choose Gemini or Puter.' }[st] || st;
          const g = $('#cai-get', root); if (g) g.hidden = st !== 'downloadable';
        });
        $('#cai-get', root).addEventListener('click', async e => { e.currentTarget.disabled = true; $('#cai-state', root).textContent = 'Downloading the model… keep this tab open.'; try { const sess = await window.LanguageModel.create({ monitor(m) { m.addEventListener('downloadprogress', ev => { const el = $('#cai-state', root); if (el) el.textContent = `Downloading the model… ${Math.round((ev.loaded || 0) * 100)}%`; }); } }); sess.destroy(); $('#cai-state', root).textContent = 'Ready on this computer.'; window.CVT.app.refreshKey(); } catch (err) { $('#cai-state', root).textContent = err.message; } });
        return;
      }
      const key = state.geminiKey, cur = state.geminiModel;
      f.innerHTML = String(html`<div class="grid-2">
          <label class="field"><span>Gemini API key (free)</span><input id="api-key" type="password" autocomplete="off" placeholder="AIza…" value="${key}"></label>
          <label class="field"><span>Model</span><select id="model">${state.models.length ? state.models.map(m => html`<option value="${m.id}" ${m.id === cur ? raw('selected') : ''}>${m.name} · ${m.id}</option>`) : html`<option value="${cur}">${cur || 'Save a key to load models'}</option>`}</select></label>
        </div>
        <div class="row gap wrap"><button class="btn primary" id="save-key" type="button">Save and test</button>
          <label class="check"><input type="checkbox" id="remember-key" checked> Remember on this device</label></div>
        <p class="hint">A Flash model is fast and free; a Pro model writes better but has tighter free limits.</p>`);
      $('#save-key', root).addEventListener('click', async () => {
        const v = $('#api-key', root).value.trim();
        const k = 'cvt.geminiKey';
        S.local.del(k);
        if (v) S.local.set(k, v, !$('#remember-key', root).checked);
        state.geminiKey = v;
        $('#key-status', root).textContent = v ? 'Checking…' : 'Key removed.';
        const ok = v ? await window.CVT.app.loadModels() : (window.CVT.app.refreshKey(), false);
        $('#key-status', root).textContent = ok ? `Connected. ${state.models.length} models available.` : v ? state.lastError : '';
        drawEngine();
      });
      $('#model', root).addEventListener('change', e => {
        state.geminiModel = e.target.value; S.local.set('cvt.geminiModel', state.geminiModel);
        window.CVT.app.refreshKey();
      });
    };
    $$('input[name="provider"]', root).forEach(r => r.addEventListener('change', async () => {
      state.provider = r.value; state.models = [];
      S.local.set('cvt.provider', state.provider);
      $$('.engine-opt', root).forEach(o => o.classList.toggle('on', o.querySelector('input').checked));
      window.CVT.app.refreshKey();
      $('#key-status', root).textContent = '';
      if (r.value === 'gemini' && state.geminiKey) { $('#key-status', root).textContent = 'Checking…'; const ok = await window.CVT.app.loadModels(); $('#key-status', root).textContent = ok ? 'Connected.' : state.lastError; }
      drawEngine();
    }));
    drawEngine();
    if (state.provider === 'gemini' && !state.models.length && state.geminiKey) window.CVT.app.loadModels().then(drawEngine);

    $('#export', root).addEventListener('click', async () => {
      const data = await S.exportAll();
      download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `applywise-backup_${today()}.json`);
      $('#backup-status', root).textContent = `Exported ${data.masters.length} CV(s), ${data.apps.length} application(s) and ${data.files.length} document(s).`;
    });
    $('#import', root).addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      try { const r = await S.importAll(JSON.parse(await f.text())); state.masterCache.clear(); FL.use(await S.getProfile()); window.CVT.jobs.resetEvidence();
        toast(`Restored ${r.masters} CV(s), ${r.apps} application(s) and ${r.docs || 0} document(s)`); window.CVT.app.rerender(); }
      catch (x) { $('#backup-status', root).textContent = x.message; }
    });
    $('#clear', root).addEventListener('click', async e => {
      const b = e.currentTarget;
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Click again to delete everything'; return; }
      await S.clearAll(); state.key = ''; state.model = ''; state.geminiKey = ''; state.masterCache.clear();
      toast('All your data has been deleted from this device'); window.CVT.app.go('#/dashboard');
    });
  }


  // =====================================================================
  // HELP AND PRIVACY
  // =====================================================================
  async function help(root) {
    const inClaude = window.CVT.app.inClaude();
    root.addEventListener('click', e => { if (e.target.closest('#help-tour')) window.CVT.shell.tour(true); if (e.target.closest('#help-setup')) window.CVT.welcome.open(true); });
    root.innerHTML = String(html`
      <header class="page-head"><div><p class="eyebrow">Applywise ${VERSION}</p><h1>Help and privacy</h1></div><div class="row gap"><button class="btn ghost" type="button" id="help-setup">Run setup again</button><button class="btn ghost" type="button" id="help-tour">Take the tour</button><a class="btn ghost" href="#/pricing">Plans and pricing</a><a class="btn ghost" href="privacy.html" target="_blank" rel="noopener">Privacy policy</a><a class="btn ghost" href="terms.html" target="_blank" rel="noopener">Terms</a></div></header>
      ${inClaude ? html`<section class="panel mb">
        <div class="panel-head"><h2>Watch the 3-minute guide</h2><span class="muted small">AI voice · captions on</span></div>
        <video class="help-video" controls preload="none" playsinline poster="/_blob/f007580ce716ede25ce4271f3ee9c15e" src="/_blob/dbb74236c941ca767f19c6e9ddb2e69f"></video>
        <p class="muted small mt">The demo uses a fictional CV and fictional jobs.</p>
      </section>` : ''}
      <div class="help-grid">
        <section class="panel">
          <h2>How it works</h2>
          <ol class="how">
            <li><strong>Add your CV.</strong> Upload the Word (.docx) CV you already use. Applywise edits text inside it and never moves your layout, fonts, tables or images.</li>
            <li><strong>Find a job.</strong> The Jobs page pulls live roles and scores each against your CV. You can also paste any advert.</li>
            <li><strong>Analyse and tailor.</strong> The agent reads the advert, gives a fit score and an apply/skip view, and proposes additions to your CV. It keeps every word you wrote and only inserts the job's requirements where they belong. You tick what goes in.</li>
            <li><strong>Apply.</strong> Download the tailored CV and cover letter, copy recruiter messages, and use the autofill bookmark to fill application forms. You always press Submit yourself.</li>
            <li><strong>Track.</strong> The pipeline schedules follow-ups and interview prep so nothing goes quiet.</li>
          </ol>
        </section>
        <section class="panel">
          <h2>Where jobs come from</h2>
          <p class="hint">${inClaude ? 'Live jobs come from Indeed through your own Indeed connector, at no extra cost.' : 'Live jobs come from Indeed when Applywise is opened from its app link with the Indeed connector.'} When the owner asks their assistant to “run my job robot”, it also searches SimplyHired, Reed, ContractorUK, Jooble and consultancy career pages, removes duplicates and adds new matches here. LinkedIn, Totaljobs, CWJobs and Glassdoor don't allow automated reading, so they open as one-click searches; their free job-alert emails are another way in.</p>
          <p class="hint mt">The match score is worked out in your browser: it compares the skills named in each advert with your CV and career profile. A “~” means only the job title was checked so far.</p>
        </section>
        <section class="panel">
          <h2>Your data</h2>
          <ul class="tight">
            <li>Your CVs, profile and applications are stored only in this browser (IndexedDB). There is no Applywise server and no account.</li>
            <li>When you run the agent, the advert and your CV text go to the AI engine you chose: the built-in AI or Google Gemini. Applywise only uses free engines and never a paid API.</li>
            <li>A Gemini key stays in this browser's storage and is sent only to Google.</li>
            <li>Back up or move your data from Settings → Backup. Clearing browser data deletes it.</li>
          </ul>
        </section>
        <section class="panel">
          <h2>Honesty rules the agent follows</h2>
          <ul class="tight">
            <li>It never invents employers, dates, certifications or numbers.</li>
            <li>Skills that your CV and profile don't show are marked “Not in your CV” and left unticked.</li>
            <li>Rewrites of your own wording are flagged and off by default.</li>
            <li>Form autofill never presses Submit and never overwrites what you typed.</li>
          </ul>
        </section>
        <section class="panel">
          <h2>Good to know</h2>
          <ul class="tight">
            <li>The day-rate calculator and pay benchmarks are rough guides, not tax or financial advice.</li>
            <li>“Possible duplicate” warns when a job looks like one already in your pipeline, often the same role through two agencies. Being submitted twice can rule you out, so check before applying.</li>
            <li>Job adverts and company data belong to their publishers. Always read the original advert before applying.</li>
          </ul>
        </section>
      </div>`);
  }

  window.CVT.views = Object.assign(window.CVT.views || {}, { dashboard, pipeline, profile, settings, help, helpers: { fitChip, verdictChip, dueChip, appTitle } });
})();
