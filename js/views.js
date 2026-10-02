/* views.js — Dashboard, Pipeline, Career profile, Settings. */
(function () {
  const { html, raw, esc, $, $$, toast, download, copy, today, ukDate, longDate, daysBetween, VERDICT, scoreCls, state, masterModel } = window.CVT.ui;
  const S = window.CVT.store, A = window.CVT.agent, D = window.CVT.docx;
  const FL = window.CVT.fields;
  const VERSION = 'v5.5';
  const ACTIVE = ['Applied', 'Screening', 'Interview', 'Offer'];
  const REACHED = s => ['Screening', 'Interview', 'Offer', 'Accepted'].includes(s);

  // ---------- shared bits ----------
  /** A notice with an Undo button (stays 6 seconds). */
  function undoToast(msg, undo) {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); document.body.append(box); }
    const el = document.createElement('div'); el.className = 'toast ok with-link';
    el.innerHTML = `<span>${esc(msg)}</span> <button type="button" class="toast-link linkish">Undo</button>`;
    el.querySelector('button').addEventListener('click', async () => { el.remove(); await undo(); toast('Restored'); });
    box.append(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 6000);
  }
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
          <div class="search-rows">${roles.slice(0, 4).map(r => html`<div class="search-row"><span class="search-role">${r}</span><span class="search-links">${J.boards(r, (profile.targetLocations || [])[0] || '', window.CVT.countries.current()).slice(0, 6).map(l => html`<a class="pill-link" href="${l.href}" target="_blank" rel="noopener">${l.name}</a>`)}</span></div>`)}</div>`);
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

    const feedRun = !!((await S.getKV('feed', null)) || {}).lastRun;
    const setup = [
      { done: masters.length > 0, art: 'cv', title: 'Add your CV', text: 'Upload the Word CV you use today (one per skill set if you have several). Its layout is never changed.', href: '#/profile', cta: 'Upload CV' },
      { done: (profile.targetRoles || []).length > 0 || feedRun || (masters.length > 0 && apps.length > 0), art: 'search', title: 'Tell us the jobs you want', text: 'Job titles, your town or city and country. Jobs near you come first.', href: '#/profile', cta: 'Set targets' },
      { done: !!state.key, art: 'ask', title: 'Switch on a free AI', text: 'Pick one free option. It writes your tailored CV and cover letters.', href: '#/settings', cta: 'Choose a free AI' },
      { done: apps.length > 0, art: 'handshake', title: 'Tailor your first application', text: 'Pick a job from the list or paste any advert, even a short one.', href: '#/jobs', cta: 'Find a job' }
    ];
    const setupDone = setup.every(x => x.done), firstTodo = setup.find(x => !x.done);

    const initials = ((profile.name || '').trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('') || 'Me').toUpperCase();
    // The one thing most worth doing next, with a picture.
    const ready = apps.filter(a => ['Tailored'].includes(a.status)).sort((x, y) => (y.updated || '').localeCompare(x.updated || ''));
    const upcoming = apps.filter(a => a.interviewAt && a.interviewAt.slice(0, 10) >= t).sort((x, y) => x.interviewAt.localeCompare(y.interviewAt));
    const nextStep = !masters.length ? { art: 'cv', title: 'Start with your CV', text: 'Upload one or more Word CVs. Jobs are matched to your real skills and each application starts from the best CV.', href: '#/profile', cta: 'Upload your CVs' }
      : upcoming.length ? { art: 'interview', title: `Interview at ${upcoming[0].company || 'your next company'} on ${ukDate(upcoming[0].interviewAt)}`, text: 'Practise likely questions, polish your STAR stories and ask the AI anything about the role.', href: `#/app/${upcoming[0].id}/interview`, cta: 'Prepare now' }
      : overdue.length ? { art: 'calendar', title: `${overdue.length} follow-up${overdue.length > 1 ? 's' : ''} overdue`, text: 'A short, friendly chase often gets the reply. The message is drafted for you.', href: `#/app/${overdue[0].id}/outreach`, cta: 'Send a follow-up' }
      : ready.length ? { art: 'handshake', title: `Ready to apply: ${ready[0].role || 'your tailored application'}${ready[0].company ? ' at ' + ready[0].company : ''}`, text: 'Your CV is tailored. Check the cover letter, then apply and mark it as applied.', href: `#/app/${ready[0].id}/apply`, cta: 'Review and apply' }
      : { art: 'search', title: 'Find your next role', text: 'New jobs matched to your titles, skills and country, scored against your CVs.', href: '#/jobs', cta: 'See jobs for you' };
    const art = n => raw(window.CVT.art ? window.CVT.art.scene(n) : '');
    const latest = apps.slice().sort((x, y) => (y.updated || '').localeCompare(x.updated || ''))[0];
    // Shortcuts that aren't already the next step or a panel on this page.
    const tiles = [
      { href: '#/new', art: 'cv', title: 'Tailor for an advert', sub: 'CV and cover letter' },
      latest ? { ask: latest.id, art: 'ask', title: 'Ask AI', sub: 'About ' + (latest.company || latest.role || 'your latest application') } : { href: '#/prep', art: 'interview', title: 'Interview prep', sub: 'Questions and mock interviews' },
      { href: '#/pipeline', art: 'growth', title: 'Track applications', sub: apps.length ? apps.length + ' so far' : 'Every application' }
    ].filter(q => q && q.href !== nextStep.href);
    // Picture tiles with their names on the photo. Shown before and after setup.
    const quick = html`<div class="quick-tiles">${tiles.map(q => q.ask ? html`<button class="q-tile" type="button" data-ask="${q.ask}"><span class="q-art">${art(q.art)}</span><strong>${q.title}</strong><span class="muted small">${q.sub}</span></button>`
      : html`<a class="q-tile" href="${q.href}"><span class="q-art">${art(q.art)}</span><strong>${q.title}</strong><span class="muted small">${q.sub}</span></a>`)}</div>`;
    root.innerHTML = html`
      <header class="page-head">
        <div><p class="eyebrow">${longDate()}</p><h1>${hello}</h1></div>
        <div class="row gap wrap"><button class="btn ghost small" id="dash-custom" type="button" title="Move, hide or reset the sections on this page">⚙ Customise</button></div>
      </header>

      <div class="dash3">
        <aside class="d-left">
          <section class="panel pcard" data-sec="profile">
            <div class="pcard-cover" aria-hidden="true"></div>
            <a class="pcard-avatar" href="#/profile" aria-label="Career profile">${initials}</a>
            <div class="pcard-body">
              <strong class="pcard-name">${profile.name || 'Your profile'}</strong>
              <span class="pcard-head">${profile.currentTitle || (profile.targetRoles || [])[0] || 'Add your headline'}</span>
              <span class="muted small">${[(profile.targetLocations || [])[0], window.CVT.countries.get(window.CVT.countries.current()).name].filter((x, i, l) => x && l.indexOf(x) === i).join(', ')}</span>
            </div>
            <a class="btn ghost small pcard-edit" href="#/profile">Edit profile</a>
          </section>
          <section class="panel cvs-card" data-sec="cvs" aria-label="Your CVs">
            <div class="panel-head"><h2>Your CVs</h2><a class="link small" href="#/profile">${masters.length ? 'Add or manage' : 'Add'}</a></div>
            ${masters.length ? html`<ul class="cv-list" id="cv-list">${masters.map(m => html`<li data-cv="${m.id}"><span class="file-ext">DOCX</span><div class="cv-meta"><div class="cv-name"><strong title="${m.name}">${m.name}</strong>${m.isDefault ? html`<span class="chip muted">Default</span>` : ''}</div><span class="cv-skills muted small">Reading skills…</span></div></li>`)}</ul>
              <p class="muted small">${masters.length > 1 ? 'Jobs are matched against all of these; each application starts with the best fit.' : 'Have CVs for different skill sets? Add them all.'}</p>`
              : html`<p class="hint">Upload one CV per skill set. Jobs are matched against all of them.</p>`}
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
          <section class="panel start-panel" data-sec="start" aria-label="${setupDone ? 'Your next step' : 'Get started'}">
            ${setupDone ? html`<div class="next-hero"><div class="nh-text"><p class="eyebrow">Your next step</p><h2>${nextStep.title}</h2><p class="muted">${nextStep.text}</p>
              <a class="btn primary" href="${nextStep.href}">${nextStep.cta}</a></div><div class="nh-art">${art(nextStep.art)}</div></div>
            ${quick}`
            : html`<div class="next-hero"><div class="nh-text"><p class="eyebrow">Get started · ${setup.filter(x => x.done).length} of ${setup.length} done</p><h2>${setup.some(x => x.done) ? 'Nearly there' : 'Welcome to Applywise'}</h2><p class="muted">Four quick steps to your first tailored CV and cover letter. Do them in any order.</p></div><div class="nh-art">${art('welcome')}</div></div>
            <ol class="onboard-steps">${setup.map((x, i) => html`<li class="${x.done ? 'done' : x === firstTodo ? 'now' : ''}">
              <span class="step-num" aria-hidden="true">${x.done ? '✓' : i + 1}</span>
              <div><strong>${x.title}</strong><p class="muted small">${x.text}</p></div>
              ${x.done ? html`<span class="chip ok">Done</span>` : html`<a class="btn small ${x === firstTodo ? 'primary' : 'ghost'}" href="${x.href}">${x.cta}</a>`}
            </li>`)}</ol>
            ${quick}
            <p class="small muted mt"><a class="link" href="#/help">▶ Watch the 3-minute guide</a></p>`}
          </section>
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
          <section class="panel wide" id="dash-prep" data-sec="prep"></section>
        </aside>
      </div>`;

    drawJobs(root, profile);
    drawPrep(root);
    await window.CVT.layout.dashboard(root);
    const sp = root.querySelector('.start-panel'); if (sp) sp.addEventListener('click', e => { const b = e.target.closest('[data-ask]'); if (b) window.CVT.assistant.open(b.dataset.ask); });
    // Top skills found on each CV.
    window.CVT.jobs.evidence().then(ev => (ev.perCv || []).forEach(c => {
      const el = root.querySelector(`[data-cv="${c.id}"] .cv-skills`); if (!el) return;
      const top = [...c.terms].filter(t => !/^(Communication skills|Microsoft Office|Problem solving|Team leadership|Stakeholder management)$/.test(t)).slice(0, 5);
      el.textContent = top.length ? top.join(' · ') : 'No skills recognised yet';
    })).catch(() => {});

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
      ${apps.length ? '' : html`<section class="panel empty-hero"><div class="empty-art">${raw(window.CVT.art ? window.CVT.art.scene('growth') : '')}</div><div><h2>Your pipeline is empty</h2><p class="hint">Start an application from a job you like, or paste any advert. Every step from tailoring to offer is tracked here.</p><div class="row gap wrap"><a class="btn primary" href="#/jobs">Find jobs</a><a class="btn ghost" href="#/new">Paste an advert</a></div></div></section>`}
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
            <article class="card-app" data-card="${a.id}">
              <button class="card-del" type="button" data-del="${a.id}" aria-label="Delete this application" title="Delete (stop tracking)">×</button>
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
    // Delete a tile you no longer want to track: click ×, then confirm. Undo is offered for a few seconds.
    root.addEventListener('click', async e => {
      const b = e.target.closest('[data-del]'); if (!b) return;
      const card = b.closest('.card-app');
      if (!card.classList.contains('confirm-del')) {
        $$('.card-app.confirm-del', root).forEach(c => c.classList.remove('confirm-del'));
        card.classList.add('confirm-del'); b.textContent = 'Delete?'; b.setAttribute('aria-label', 'Click again to delete');
        setTimeout(() => { if (card.isConnected && card.classList.contains('confirm-del')) { card.classList.remove('confirm-del'); b.textContent = '×'; } }, 4000);
        return;
      }
      const i = apps.findIndex(x => x.id === b.dataset.del); if (i < 0) return;
      const [gone] = apps.splice(i, 1);
      card.classList.add('leaving');
      await S.removeApp(gone.id);
      setTimeout(draw, 220);
      const eb = $('.page-head .eyebrow', root); if (eb) eb.textContent = `${apps.length} application${apps.length === 1 ? '' : 's'}`;
      undoToast(`Deleted “${gone.role || 'application'}${gone.company ? ' · ' + gone.company : ''}”`, async () => {
        await S.saveApp(gone); apps.splice(Math.min(i, apps.length), 0, gone); draw();
        if (eb) eb.textContent = `${apps.length} application${apps.length === 1 ? '' : 's'}`;
      });
      if (window.CVT.app.refreshBadges) window.CVT.app.refreshBadges();
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
    // The very first time a CV is added, copy the details and every job from it into the empty fields
    // (no AI). This happens ONCE only: after that, your application details stay exactly as they are,
    // whatever CVs you add, change or remove, until you edit them yourself (or press "Fill from my CV").
    const defM = masters.find(m => m.isDefault) || masters[0];
    let autoFilled = [];
    if (defM && !p.cvAutoFilled && window.CVT.cvparse) {
      try {
        const mm = await masterModel(defM.id);
        autoFilled = window.CVT.cvparse.fillProfile(p, window.CVT.cvparse.parse(D.plainText(mm.model)));
        p.cvAutoFilled = defM.id; await S.saveProfile(p); state.profile = p;
      } catch (_) {}
    }
    if (autoFilled.length) setTimeout(() => toast(`Filled ${autoFilled.includes('experience') ? 'your work experience and ' : ''}${autoFilled.filter(k => k !== 'experience').length} details from your CV. Change anything you like.`), 400);
    const lines = arr => (arr || []).join('\n');
    const field = (key, label, attrs = {}) => html`<label class="field"><span>${label}</span><input data-p="${key}" type="${attrs.type || 'text'}" value="${p[key] ?? ''}" placeholder="${attrs.ph || ''}" autocomplete="off"></label>`;
    const sel = (key, label, opts) => html`<label class="field"><span>${label}</span><select data-p="${key}">${opts.map(o => html`<option value="${o}" ${String(p[key] ?? '') === o ? raw('selected') : ''}>${o || 'Choose…'}</option>`)}</select></label>`;

    root.innerHTML = html`
      <header class="page-head">
        <div><p class="eyebrow">Used by every tailoring, letter and form answer</p><h1>Career profile</h1></div>
        <span class="muted small" id="p-saved" aria-live="polite"></span>
      </header>

      <section class="panel">
        <div class="panel-head"><h2>Master CVs</h2></div>
        <p class="hint">Upload one Word CV per skill set or positioning (for example “SAP consultant” and “business analyst”). Jobs are searched and scored against all of them, and each application starts with the CV that fits the advert best. Files stay on this device.</p>
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
          <input type="file" id="m-file" accept=".docx" multiple>
          <span class="drop-title">${masters.length ? 'Add more CVs (.docx), one per skill set' : 'Drop your CVs (.docx) here or choose files'}</span>
          <span class="drop-sub">Word .docx only; you can add several at once. Each job is matched against all of them and the best one is picked.</span>
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

      <section class="panel" id="wd-panel">
        <div class="panel-head"><h2>Application forms (Workday and similar)</h2><span class="row gap wrap"><span class="chip" id="wd-state" hidden></span><button class="btn ghost small" id="wd-copy" type="button">Copy all for pasting</button><button class="btn primary small" data-wd-save type="button">Save</button></span></div>
        <p class="hint">Many employers ask you to fill in your details on Workday (or Taleo, SuccessFactors, iCIMS) before they can send an interview invitation. Fill these in once: the autofill bookmark uses them, and <strong>Copy all for pasting</strong> gives you a tidy list to copy from section by section. Workday asks you to create an account on each employer's site: use the same email every time. Your password stays with you and is never stored here.</p>
        <h3 class="wd-h">Legal name and contact</h3>
        <div class="grid-3">
          ${field('legalFirst', 'Legal first name', { ph: 'As on your passport' })}
          ${field('middleName', 'Middle name(s)')}
          ${field('legalLast', 'Legal last name')}
          ${field('preferredName', 'Preferred name', { ph: 'If different' })}
          ${sel('phoneType', 'Phone device type', ['Mobile', 'Home', 'Work'])}
          ${field('phoneCode', 'Country phone code', { ph: 'e.g. +44' })}
        </div>
        <h3 class="wd-h">Address</h3>
        <div class="grid-3">
          ${field('address1', 'Address line 1')}
          ${field('address2', 'Address line 2')}
          ${field('county', 'County / region')}
          ${field('country', 'Country')}
          ${field('website', 'Website or portfolio', { type: 'url' })}
        </div>
        <h3 class="wd-h">Questions most forms ask</h3>
        <div class="grid-3">
          ${field('hearAbout', 'How did you hear about us?', { ph: 'e.g. LinkedIn, job board, recruiter' })}
          ${sel('rightToWork', 'Right to work in this country?', ['', 'Yes', 'No'])}
          ${sel('sponsorship', 'Need visa sponsorship (now or future)?', ['', 'No', 'Yes'])}
          ${sel('relocate', 'Willing to relocate?', ['', 'Yes', 'No', 'Open to discuss'])}
          ${field('travel', 'Willing to travel', { ph: 'e.g. Up to 50%' })}
          ${field('startDate', 'Earliest start date', { ph: 'e.g. 1 December 2026' })}
          ${field('currentSalary', 'Current salary / rate (if asked)', { ph: 'Leave blank to answer case by case' })}
          ${sel('previouslyWorked', 'Default: worked for this employer before?', ['No', 'Yes – I will check each time'])}
          ${sel('drivingLicence', 'Driving licence', ['', 'Full UK licence', 'Provisional', 'None', 'Other country licence'])}
        </div>
        <h3 class="wd-h">Education, languages and certifications</h3>
        <div class="grid-3">
          ${field('school', 'University / school')}
          ${field('degree', 'Degree / qualification', { ph: 'e.g. MTech' })}
          ${field('fieldOfStudy', 'Field of study', { ph: 'e.g. CAD/CAM' })}
          ${field('eduFrom', 'Education from (year)')}
          ${field('eduTo', 'Education to (year)')}
          ${field('grade', 'Grade (if asked)')}
        </div>
        <div class="grid-2">
          <label class="field"><span>Languages (one per line, with level)</span><textarea data-p="languages" rows="3" placeholder="English – Fluent&#10;Hindi – Native">${p.languages || ''}</textarea></label>
          <label class="field"><span>Certifications (one per line, with year)</span><textarea data-p="certifications" rows="3" placeholder="PMP – 2015">${p.certifications || ''}</textarea></label>
        </div>
        <div class="panel-head mt"><h3 class="wd-h" style="margin:0">Work experience</h3><span class="row gap wrap"><button class="btn ghost small" id="xp-cv" type="button">Fill from my CV</button><button class="btn primary small" id="xp-add" type="button">+ Add experience</button></span></div>
        <p class="hint">Add each job as Workday asks for it: newest first. Your jobs were copied from your CV once, newest first. They now stay exactly as they are, even if you change or replace your CV, until you edit them. <strong>Fill from my CV</strong> adds a missing job only when you press it.</p>
        <p class="error" id="xp-err" hidden></p>
        <div class="xp-list" id="xp-list">${(p.experience || []).length ? (p.experience || []).map((x, i) => html`
          <div class="xp-card">
            <div class="xp-head"><strong>${x.title || 'New role'}${x.company ? ' · ' + x.company : ''}</strong><span class="row gap">
              <button class="icon-btn sm" type="button" data-xpup="${i}" aria-label="Move up" title="Move up" ${i === 0 ? raw('disabled') : ''}>↑</button>
              <button class="icon-btn sm" type="button" data-xpdel="${i}" aria-label="Remove this job" title="Remove">×</button></span></div>
            <div class="grid-3">
              <label class="field"><span>Job title</span><input type="text" data-xp="${i}" data-k="title" value="${x.title || ''}" autocomplete="off"></label>
              <label class="field"><span>Company</span><input type="text" data-xp="${i}" data-k="company" value="${x.company || ''}" autocomplete="off"></label>
              <label class="field"><span>Location</span><input type="text" data-xp="${i}" data-k="location" value="${x.location || ''}" autocomplete="off"></label>
              <label class="field"><span>From</span><input type="month" data-xp="${i}" data-k="from" value="${x.from || ''}"></label>
              <label class="field"><span>To</span><input type="month" data-xp="${i}" data-k="to" value="${x.to || ''}" ${x.current ? raw('disabled') : ''}></label>
              <label class="check-line xp-cur"><input type="checkbox" data-xp="${i}" data-k="current" ${x.current ? raw('checked') : ''}> I currently work here</label>
            </div>
            <label class="field"><span>Role description</span><textarea data-xp="${i}" data-k="desc" rows="3" placeholder="What you did and achieved (Workday allows about 2,000 characters)">${x.desc || ''}</textarea></label>
          </div>`) : html`<p class="muted small" id="xp-empty">No jobs added yet. Press <strong>+ Add experience</strong> or <strong>Fill from my CV</strong>.</p>`}</div>
        <p class="muted small">Equal-opportunity questions (gender, ethnicity, disability, veteran status) are optional on these forms: answer them yourself on each site, or choose “Prefer not to say”. Workday's “Autofill with resume” can also read your work history when you upload the tailored CV; check it against the list above.</p>
        <div class="wd-save-row"><span class="muted small" id="wd-saved-note">Changes also save as you type. Press Save to be sure.</span><button class="btn primary" data-wd-save type="button">Save application form details</button></div>
      </section>

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
    // Application forms: explicit Save (fields still autosave), with an "Unsaved changes" chip while you edit.
    const wdState = (txt, cls) => { const c = $('#wd-state', root); if (!c) return; c.hidden = !txt; c.textContent = txt || ''; c.className = 'chip ' + (cls || ''); };
    root.addEventListener('input', e => { if (e.target.closest('#wd-panel')) wdState('Unsaved changes', 'warn'); });
    root.addEventListener('change', e => { if (e.target.closest('#wd-panel')) wdState('Unsaved changes', 'warn'); });
    root.addEventListener('click', async e => {
      const b = e.target.closest('[data-wd-save]'); if (!b) return;
      clearTimeout(timer);
      $$('#wd-panel [data-p]', root).forEach(t => { p[t.dataset.p] = t.hasAttribute('data-list') ? t.value.split('\n').map(x => x.trim()).filter(Boolean) : t.type === 'checkbox' ? t.checked : t.value; });
      $$('#wd-panel [data-xp]', root).forEach(t => { const x = (p.experience || [])[Number(t.dataset.xp)]; if (x && t.dataset.k) x[t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value; });
      await S.saveProfile(p); state.profile = p;
      const at = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      wdState('✓ Saved ' + at, 'ok'); const n = $('#wd-saved-note', root); if (n) n.textContent = 'All application form details saved at ' + at + '.';
      toast('Application form details saved');
    });
    root.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && e.target.closest('#wd-panel')) { e.preventDefault(); const b = $('[data-wd-save]', root); if (b) b.click(); } });
    $('#wd-copy', root).addEventListener('click', e => {
      const parts = (p.name || '').trim().split(/\s+/);
      const rows = [
        ['LEGAL NAME AND CONTACT'], ['First name', p.legalFirst || parts[0]], ['Middle name', p.middleName], ['Last name', p.legalLast || (parts.length > 1 ? parts[parts.length - 1] : '')], ['Preferred name', p.preferredName],
        ['Email', p.email], ['Phone device type', p.phoneType || 'Mobile'], ['Country phone code', p.phoneCode], ['Phone number', p.phone], ['LinkedIn', p.linkedin], ['Website', p.website],
        ['ADDRESS'], ['Address line 1', p.address1], ['Address line 2', p.address2], ['Town / city', p.city], ['County / region', p.county], ['Postcode', p.postcode], ['Country', p.country],
        ['APPLICATION QUESTIONS'], ['How did you hear about us', p.hearAbout], ['Previously worked here', p.previouslyWorked || 'No'], ['Right to work', p.rightToWork], ['Visa sponsorship needed', p.sponsorship], ['Work eligibility', p.eligibility],
        ['Willing to relocate', p.relocate], ['Willing to travel', p.travel], ['Earliest start date', p.startDate], ['Notice period', p.notice], ['Current salary / rate', p.currentSalary], ['Salary expectation', p.salary], ['Day rate', p.dayRate], ['Driving licence', p.drivingLicence],
        ['CURRENT JOB'], ['Job title', p.currentTitle], ['Employer', p.currentCompany],
        ['EDUCATION'], ['University / school', p.school], ['Degree', p.degree], ['Field of study', p.fieldOfStudy], ['From', p.eduFrom], ['To', p.eduTo], ['Grade', p.grade],
        ['LANGUAGES'], ['', p.languages], ['CERTIFICATIONS'], ['', p.certifications]
      ];
      const mY = v => { const m = String(v || '').match(/^(\d{4})-(\d{2})$/); return m ? `${m[2]}/${m[1]}` : String(v || ''); };
      (p.experience || []).filter(x => x.title || x.company).forEach((x, i) => {
        rows.push([`WORK EXPERIENCE ${i + 1}`], ['Job title', x.title], ['Company', x.company], ['Location', x.location], ['From', mY(x.from)], ['To', x.current ? 'Current – I currently work here' : mY(x.to)], ['Role description', x.desc]);
      });
      const out = []; let head = '';
      rows.forEach(r => { if (r.length === 1) { head = r[0]; return; } const v = String(r[1] || '').trim(); if (!v) return; if (head) { out.push((out.length ? '\n' : '') + head); head = ''; } out.push(r[0] ? `${r[0]}: ${v}` : v); });
      if (!out.length) { toast('Fill in a few fields first', 'warn'); return; }
      copy(out.join('\n'), e.currentTarget);
    });
    // ---- work experience (repeatable, like Workday) ----
    const xpSave = async () => { await S.saveProfile(p); state.profile = p; };
    root.addEventListener('input', e => {
      const t = e.target; if (!t.dataset || t.dataset.xp == null) return;
      const x = (p.experience || [])[Number(t.dataset.xp)]; if (!x) return;
      x[t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value;
      if (t.dataset.k === 'current') { const to = t.closest('.xp-card').querySelector('[data-k="to"]'); if (to) to.disabled = t.checked; }
      if (t.dataset.k === 'title' || t.dataset.k === 'company') { const h = t.closest('.xp-card').querySelector('.xp-head strong'); if (h) h.textContent = (x.title || 'New role') + (x.company ? ' · ' + x.company : ''); }
      save();
    });
    $('#xp-add', root).addEventListener('click', async () => {
      p.experience = [{ title: '', company: '', location: '', from: '', to: '', current: false, desc: '' }].concat(p.experience || []);
      await xpSave(); await window.CVT.app.rerender(); const f = $('[data-xp="0"][data-k="title"]'); if (f) f.focus();
    });
    root.addEventListener('click', async e => {
      const d = e.target.closest('[data-xpdel]'), u = e.target.closest('[data-xpup]');
      if (d) {
        if (d.dataset.armed !== '1') { d.dataset.armed = '1'; d.textContent = '✓?'; d.title = 'Click again to remove'; return; }
        p.experience.splice(Number(d.dataset.xpdel), 1); await xpSave(); return window.CVT.app.rerender();
      }
      if (u) { const i = Number(u.dataset.xpup); if (i > 0) { const l = p.experience; [l[i - 1], l[i]] = [l[i], l[i - 1]]; await xpSave(); window.CVT.app.rerender(); } }
    });
    $('#xp-cv', root).addEventListener('click', async e => {
      const btn = e.currentTarget, err = $('#xp-err', root); err.hidden = true;
      const mm = await masterModel();
      if (!mm) { err.textContent = 'Upload a master CV first.'; err.hidden = false; return; }
      btn.disabled = true; btn.textContent = 'Reading your CV…';
      // Free and instant: read the CV directly. The AI is only asked if no jobs could be found this way.
      try {
        const d = window.CVT.cvparse ? window.CVT.cvparse.parse(D.plainText(mm.model)) : { experience: [] };
        if (d.experience.length) {
          const before = (p.experience || []).filter(x => x && (x.title || x.company)).length;
          const filled = window.CVT.cvparse.fillProfile(p, d, { mergeJobs: true });
          const added = (p.experience || []).length - before;
          await xpSave();
          toast(added ? `Added ${added} job${added > 1 ? 's' : ''} from your CV${filled.length > 1 ? ' and filled ' + (filled.length - (added ? 1 : 0)) + ' empty details' : ''}. Check and edit anything.` : 'Your work experience already matches your CV');
          return window.CVT.app.rerender();
        }
      } catch (_) {}
      try {
        const out = await A.cvHistory({ key: state.key, model: state.model, cvText: D.plainText(mm.model) });
        const ym = v => { const m = String(v || '').match(/(\d{4})(?:-(\d{1,2}))?/); return m ? `${m[1]}-${String(m[2] || '01').padStart(2, '0')}` : ''; };
        const have = new Set((p.experience || []).map(x => (x.title + '|' + x.company).toLowerCase()));
        const add = (out.experience || []).filter(x => x && (x.title || x.company)).map(x => ({ title: x.title || '', company: x.company || '', location: x.location || '', from: ym(x.from), to: x.current ? '' : ym(x.to), current: !!x.current, desc: String(x.description || '').slice(0, 2000) }))
          .filter(x => !have.has((x.title + '|' + x.company).toLowerCase()));
        p.experience = (p.experience || []).concat(add);
        const ed = (out.education || [])[0];
        if (ed && !p.school && !p.degree) Object.assign(p, { school: ed.school || '', degree: ed.degree || '', fieldOfStudy: ed.field || '', eduFrom: ed.from || '', eduTo: ed.to || '' });
        await xpSave(); toast(add.length ? `Added ${add.length} job${add.length > 1 ? 's' : ''} from your CV. Check the dates and wording.` : 'No new jobs found in your CV'); window.CVT.app.rerender();
      } catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; btn.textContent = 'Fill from my CV'; }
    });
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

    const addFile = async (file, many) => {
      if (!file || !/\.docx$/i.test(file.name)) return toast('Please choose a Word .docx file.', 'warn');
      try {
        const buf = await file.arrayBuffer();
        const model = await D.load(buf.slice(0));
        await S.addMaster(file.name.replace(/\.docx$/i, ''), file.name, buf);
        const editable = model.paras.filter(x => x.text.trim() && !x.locked).length;
        toast(`Added ${file.name}. ${editable} paragraphs can be tailored.`);
        if (!many) window.CVT.app.rerender();
      } catch (err) { toast(err.message, 'bad'); }
    };
    const addFiles = async list => { for (const f of [...(list || [])]) await addFile(f, true); window.CVT.jobs.resetEvidence(); window.CVT.app.rerender(); };
    $('#m-file', root).addEventListener('change', e => addFiles(e.target.files));
    $('#m-demo', root).addEventListener('click', async () => {
      try { const buf = await window.CVT.demoCv(); await S.addMaster('Demo CV (fictional)', 'demo-cv.docx', buf); toast('Demo CV added. Now press New application.'); window.CVT.app.rerender(); }
      catch (err) { toast(err.message, 'bad'); }
    });
    const drop = $('#m-drop', root);
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));

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
          ${inClaude ? '' : html`<details class="claude-link mt" ${S.local.get('cvt.claudeLink', '') ? raw('open') : ''}><summary>I have a Claude subscription</summary>
            <p class="hint">A website can't use a Claude subscription directly (that would need the paid Claude API, which Applywise never uses). Your subscription works inside your own Claude version of Applywise. Paste its link here and every AI step on this site offers to open it. The link is saved only on this device and works only for your Claude account.</p>
            <div class="row gap"><input id="cl-link" type="url" placeholder="https://claude.ai/artifact/…" value="${S.local.get('cvt.claudeLink', '')}" aria-label="My Claude version link"><button class="btn small" id="cl-save" type="button">Save</button></div></details>`}
          <div class="engines">
            ${inClaude ? html`<label class="engine-opt ${state.provider === 'claude-plan' ? 'on' : ''}">
              <input type="radio" name="provider" value="claude-plan" ${state.provider === 'claude-plan' ? raw('checked') : ''} ${inClaude ? '' : raw('disabled')}>
              <span class="engine-name">Your Claude subscription <span class="chip ok">No extra cost</span></span>
              <span class="engine-sub">Uses the Claude plan you already pay for monthly, with the standard model only. It counts toward your plan's normal usage limits; nothing is billed on top. No key needed.</span>
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
    const cl = $('#cl-save', root);
    if (cl) cl.addEventListener('click', () => {
      const v = $('#cl-link', root).value.trim();
      if (v && !/^https:\/\/claude\.ai\/(code\/)?artifact\//.test(v)) return toast('That is not a Claude artifact link', 'warn');
      if (v) S.local.set('cvt.claudeLink', v); else S.local.del('cvt.claudeLink');
      toast(v ? 'Saved on this device' : 'Removed');
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
    root.addEventListener('click', async e => {
      if (e.target.closest('#help-tour')) window.CVT.shell.tour(true); if (e.target.closest('#help-setup')) window.CVT.welcome.open(true);
      const ck = e.target.closest('#help-check'); if (ck) { ck.disabled = true; ck.textContent = 'Checking…'; try { await window.CVT.selftest.run($('#help-check-out', root)); } finally { ck.disabled = false; ck.textContent = 'Run the check again'; } }
    });
    const lastCheck = await S.getKV('selftest', null);
    root.innerHTML = String(html`
      <header class="page-head"><div><p class="eyebrow">Applywise ${VERSION}</p><h1>Help and privacy</h1></div><div class="row gap"><button class="btn ghost" type="button" id="help-setup">Run setup again</button><button class="btn ghost" type="button" id="help-tour">Take the tour</button><a class="btn ghost" href="#/pricing">Plans and pricing</a><a class="btn ghost" href="privacy.html" target="_blank" rel="noopener">Privacy policy</a><a class="btn ghost" href="terms.html" target="_blank" rel="noopener">Terms</a></div></header>
      ${inClaude ? html`<section class="panel mb">
        <div class="panel-head"><h2>Watch the 3-minute guide</h2><span class="muted small">AI voice · captions on</span></div>
        <video class="help-video" controls preload="none" playsinline poster="/_blob/f007580ce716ede25ce4271f3ee9c15e" src="/_blob/dbb74236c941ca767f19c6e9ddb2e69f"></video>
        <p class="muted small mt">The demo uses a fictional CV and fictional jobs.</p>
      </section>` : ''}
      <section class="panel mb" id="help-check-panel">
        <div class="panel-head"><h2>Check every feature</h2><button class="btn ghost small" type="button" id="help-check">${lastCheck ? 'Run the check again' : 'Run the check'}</button></div>
        <p class="hint">Runs one fictional application through every AI feature with your chosen engine: tailoring, cover letter, messages, interview prep, Ask AI, a short advert, documents, mind map, Studio and interview practice. It uses the AI about 30 times (a few minutes) and removes the fictional data at the end.</p>
        <div id="help-check-out">${lastCheck ? raw(`<p class="small muted">Last run ${esc(new Date(lastCheck.at).toLocaleString('en-GB'))}: ${lastCheck.rows.filter(r => r.ok).length} passed, ${lastCheck.rows.filter(r => r.ok === false).length} failed.</p>`) : ''}</div>
      </section>
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
