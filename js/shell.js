/*
 * shell.js — top bar (page title, global search, account), pricing page and the first-run tour.
 */
(function () {
  const { html, raw, $, toast } = window.CVT.ui;
  const S = window.CVT.store;
  const go = h => window.CVT.app.go(h);

  // ---------------- top bar ----------------
  const PAGES = [
    ['Dashboard', '#/dashboard'], ['Jobs', '#/jobs'], ['Pipeline', '#/pipeline'], ['Interview prep', '#/prep'], ['Drill cards', '#/prep/drills'],
    ['Story bank', '#/prep/stories'], ['Career profile', '#/profile'], ['Settings', '#/settings'], ['Help and privacy', '#/help'], ['Plans and pricing', '#/pricing'], ['New application', '#/new']
  ];
  let jobsCache = null, sel = -1, results = [];

  async function search(q) {
    q = q.trim().toLowerCase(); if (q.length < 2) return [];
    const words = q.split(/\s+/);
    const hit = t => words.every(w => String(t || '').toLowerCase().includes(w));
    const out = PAGES.filter(p => hit(p[0])).map(p => ({ kind: 'Page', title: p[0], sub: '', go: p[1] }));
    const apps = await S.listApps();
    apps.filter(a => hit([a.role, a.company, a.status].join(' '))).slice(0, 6).forEach(a => out.push({ kind: 'Application', title: a.role || 'Untitled role', sub: [a.company, a.status].filter(Boolean).join(' · '), go: `#/app/${a.id}/job` }));
    try {
      if (!jobsCache) jobsCache = (await window.CVT.jobs.top(300)).items.map(r => r.j);
      jobsCache.filter(j => hit([j.title, j.company, j.location].join(' '))).slice(0, 6).forEach(j => out.push({ kind: 'Job', title: j.title, sub: [j.company, j.location].filter(Boolean).join(' · '), go: '#/jobs', q: j.title }));
    } catch (_) {}
    return out.slice(0, 14);
  }
  function paint() {
    const box = $('#tb-results'); if (!box) return;
    if (!results.length) { box.hidden = !$('#tb-q').value.trim(); box.innerHTML = box.hidden ? '' : '<p class="tb-empty">No matches</p>'; return; }
    box.hidden = false;
    box.innerHTML = results.map((r, i) => `<button type="button" class="tb-hit ${i === sel ? 'on' : ''}" data-i="${i}"><span class="tb-kind">${r.kind}</span><span class="tb-t">${window.CVT.ui.esc(r.title)}</span><span class="tb-s">${window.CVT.ui.esc(r.sub)}</span></button>`).join('');
  }
  function open(r) {
    const q = $('#tb-q'); q.value = ''; results = []; paint(); q.blur();
    if (r.q) window.CVT._jobQuery = r.q;
    go(r.go);
  }
  function initTopbar() {
    const q = $('#tb-q'), box = $('#tb-results'); if (!q) return;
    let t = null;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(async () => { results = await search(q.value); sel = results.length ? 0 : -1; paint(); }, 150); });
    q.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(results.length - 1, sel + 1); paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); paint(); }
      else if (e.key === 'Enter' && results[sel]) { e.preventDefault(); open(results[sel]); }
      else if (e.key === 'Escape') { q.value = ''; results = []; paint(); q.blur(); }
    });
    box.addEventListener('mousedown', e => { const b = e.target.closest('[data-i]'); if (b) { e.preventDefault(); open(results[+b.dataset.i]); } });
    q.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 120));
    q.addEventListener('focus', () => { if (results.length) box.hidden = false; });
    document.addEventListener('keydown', e => { if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) { e.preventDefault(); q.focus(); } });
    $('#tb-tour').addEventListener('click', () => tour(true));
    [$('#tb-theme'), $('#sf-theme')].forEach(b => b && b.addEventListener('click', toggleTheme));
    const onScroll = () => document.body.classList.toggle('scrolled', window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    refresh();
  }
  /** Page title and the account initials. */
  // ---------------- theme and motion ----------------
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function applyTheme(t) { if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
  function toggleTheme() {
    const cur = document.documentElement.dataset.theme || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next); S.local.set('cvt.theme', next);
  }
  applyTheme(S.local.get('cvt.theme', ''));
  /** Numbers on the page count up from zero when a page opens. */
  function countUp(root) {
    if (reduced()) return;
    (root || document).querySelectorAll('.kpi-num').forEach(el => {
      const node = [...el.childNodes].find(n => n.nodeType === 3 && /\d/.test(n.textContent)); if (!node) return;
      const m = node.textContent.match(/^(\D*)(\d+)(.*)$/s); if (!m) return;
      const target = +m[2]; if (!target || target > 100000) return;
      const t0 = performance.now(), dur = 700;
      const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); node.textContent = m[1] + Math.round(target * e) + m[3]; if (k < 1) requestAnimationFrame(step); };
      node.textContent = m[1] + '0' + m[3]; requestAnimationFrame(step);
    });
  }

  async function refresh(title) {
    setTimeout(() => countUp($('#main')), 30);
    const tt = $('#tb-title'); if (tt && title) tt.textContent = title;
    try {
      const p = await S.getProfile();
      const name = (p && p.name || '').trim();
      const av = $('#tb-avatar'); if (av) { av.textContent = name ? name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() : 'Me'; av.title = name ? name + ' · Career profile' : 'Career profile'; }
    } catch (_) {}
    jobsCache = null;
  }

  // ---------------- pricing ----------------
  const PLANS = [
    { id: 'free', name: 'Free', price: '£0', per: 'forever', tag: 'Available now', cta: 'Current plan', current: true,
      blurb: 'Everything in Applywise today, running on a free AI engine of your choice.',
      feats: ['Unlimited applications and pipeline', 'CV tailoring in your own Word template', 'Cover letters, outreach and form autofill', 'Documents, mind map, Studio and Ask', 'Interview prep, drill cards and story bank', 'Data kept private in your browser'] },
    { id: 'pro', name: 'Pro', price: '£9', per: 'per month', tag: 'Planned', cta: 'Notify me', featured: true,
      blurb: 'For active job seekers who want Applywise to do more of the legwork.',
      feats: ['Everything in Free', 'Built-in AI: no key or setup needed', 'Daily job alerts across more boards', 'Encrypted cloud backup and sync', 'Unlimited Studio audio overviews', 'Priority support'] },
    { id: 'team', name: 'Team', price: '£29', per: 'per coach per month', tag: 'Planned', cta: 'Talk to us',
      blurb: 'For career coaches, outplacement firms and bootcamps supporting many candidates.',
      feats: ['Everything in Pro', 'Coach dashboard across candidates', 'Shared templates and question banks', 'Branded exports and reports', 'Admin controls and audit log', 'Onboarding session'] }
  ];
  const ROWS = [
    ['Applications & pipeline', '✓', '✓', '✓'], ['CV tailoring & cover letters', '✓', '✓', '✓'], ['Documents, mind map & Studio', '✓', '✓', '✓'],
    ['AI engine', 'Free engine of your choice', 'Built in', 'Built in'], ['Job sources', 'Indeed + on request', 'Daily alerts, more boards', 'Daily alerts, more boards'],
    ['Backup & sync', 'Browser + your account', 'Encrypted cloud', 'Encrypted cloud'], ['Multiple candidates', '–', '–', '✓'], ['Support', 'Help centre', 'Priority', 'Dedicated']
  ];
  async function pricing(root) {
    const wants = (await S.getKV('planInterest', null)) || {};
    root.innerHTML = String(html`
      <header class="page-head"><div><p class="eyebrow">Plans</p><h1>Plans and pricing</h1><p class="hint mt">Start free with everything you use today. Paid plans are planned and not on sale yet: nothing here takes payment.</p></div></header>
      <div class="plans">${PLANS.map(p => html`<section class="plan-card ${p.featured ? 'featured' : ''}">
        <div class="plan-top"><h2>${p.name}</h2><span class="chip ${p.current ? 'ok' : 'muted'}">${p.tag}</span></div>
        <p class="plan-price"><strong>${p.price}</strong> <span>${p.per}</span></p>
        <p class="small muted">${p.blurb}</p>
        <ul class="plan-feats">${p.feats.map(f => html`<li>${f}</li>`)}</ul>
        ${p.current ? html`<button class="btn ghost" type="button" disabled>Current plan</button>` : html`<button class="btn ${p.featured ? 'primary' : 'ghost'}" type="button" data-plan="${p.id}">${wants[p.id] ? '✓ We’ll let you know' : p.cta}</button>`}
      </section>`)}</div>
      <section class="panel">
        <div class="panel-head"><h2>Compare plans</h2></div>
        <div class="table-wrap"><table class="compare-plans"><thead><tr><th></th>${PLANS.map(p => html`<th>${p.name}</th>`)}</tr></thead>
          <tbody>${ROWS.map(r => html`<tr><th scope="row">${r[0]}</th>${r.slice(1).map(c => html`<td>${c}</td>`)}</tr>`)}</tbody></table></div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Questions</h2></div>
        <div class="st-qa">
          <details><summary>Is Applywise really free today?</summary><p>Yes. Every feature runs on a free AI engine you choose in Settings: a Google Gemini key, a Puter sign-in or Chrome's built-in AI. Applywise itself charges nothing.</p></details>
          <details><summary>Where is my data kept?</summary><p>In your browser on this device. It can also sync privately to your own account, visible only to you. Nothing is submitted to an employer without you pressing Submit.</p></details>
          <details><summary>When will Pro and Team be available?</summary><p>They are planned. Press Notify me and Applywise will remember your interest on this device.</p></details>
          <details><summary>Will the Free plan lose features later?</summary><p>No. The Free plan keeps everything listed on it.</p></details>
        </div>
      </section>`);
    root.addEventListener('click', async e => {
      const b = e.target.closest('[data-plan]'); if (!b) return;
      wants[b.dataset.plan] = new Date().toISOString(); await S.setKV('planInterest', wants);
      b.textContent = '✓ We’ll let you know'; toast('Noted. You’ll see it here first.');
    });
  }

  // ---------------- first-run tour ----------------
  const STEPS = [
    { sel: '.brand', title: 'Welcome to Applywise', text: 'Your job-search workspace: find roles, tailor your CV, prepare for interviews and track every application in one place.' },
    { sel: '[data-nav="jobs"]', title: 'Find roles', text: 'Jobs gathers IT and business-analyst roles that match your profile, scored for fit. Import one to start an application.' },
    { sel: '.new-btn', title: 'Start an application', text: 'Paste a job description. Applywise analyses the fit, tailors your CV in your own Word template and drafts the cover letter.' },
    { sel: '[data-nav="pipeline"]', title: 'Track everything', text: 'Each application has Documents, Studio, interview questions and follow-ups. The pipeline shows what needs doing next.' },
    { sel: '[data-nav="prep"]', title: 'Practise', text: 'Mock interviews, drill cards and your story bank, ready for the day.' },
    { sel: '#tb-q', title: 'Jump anywhere', text: 'Search applications, jobs and pages from here. Press / to focus it.' }
  ];
  function tour(force) {
    if (!force && S.local.get('cvt.tourDone', '')) return;
    let i = 0;
    const wrap = document.createElement('div');
    wrap.className = 'tour'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
    document.body.appendChild(wrap);
    const end = () => { S.local.set('cvt.tourDone', '1'); wrap.remove(); document.removeEventListener('keydown', key); window.removeEventListener('resize', draw); };
    const key = e => { if (e.key === 'Escape') end(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') back(); };
    const next = () => { if (i < STEPS.length - 1) { i++; draw(); } else end(); };
    const back = () => { if (i > 0) { i--; draw(); } };
    function draw() {
      const s = STEPS[i];
      const el = [...document.querySelectorAll(s.sel)].find(x => { const r = x.getBoundingClientRect(); return r.width && r.height && getComputedStyle(x).visibility !== 'hidden'; });
      const r = el ? el.getBoundingClientRect() : null;
      const pad = 6;
      const hole = r ? `<div class="tour-hole" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px"></div>` : '<div class="tour-dim"></div>';
      wrap.innerHTML = `${hole}<div class="tour-card" tabindex="-1">
        <p class="tour-step">Step ${i + 1} of ${STEPS.length}</p><h2>${s.title}</h2><p>${s.text}</p>
        <div class="tour-dots">${STEPS.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('')}</div>
        <div class="tour-acts"><button type="button" class="linkish" data-t="skip">Skip tour</button><span class="grow-s"></span>${i ? '<button type="button" class="btn ghost small" data-t="back">Back</button>' : ''}<button type="button" class="btn primary small" data-t="next">${i === STEPS.length - 1 ? 'Finish' : 'Next'}</button></div></div>`;
      const card = wrap.querySelector('.tour-card');
      const cw = Math.min(340, window.innerWidth - 32), ch = card.offsetHeight || 200;
      let left, top;
      if (!r) { left = (window.innerWidth - cw) / 2; top = (window.innerHeight - ch) / 2; }
      else if (r.right + 16 + cw < window.innerWidth) { left = r.right + 16; top = Math.min(Math.max(16, r.top - 10), window.innerHeight - ch - 16); }
      else if (r.bottom + 16 + ch < window.innerHeight) { left = Math.min(Math.max(16, r.left), window.innerWidth - cw - 16); top = r.bottom + 16; }
      else { left = Math.min(Math.max(16, r.left), window.innerWidth - cw - 16); top = Math.max(16, r.top - ch - 16); }
      Object.assign(card.style, { left: left + 'px', top: top + 'px', width: cw + 'px' });
      card.focus({ preventScroll: true });
    }
    wrap.addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; ({ skip: end, next, back })[b.dataset.t](); });
    document.addEventListener('keydown', key); window.addEventListener('resize', draw);
    draw();
  }

  window.CVT.shell = { initTopbar, refresh, pricing, tour, toggleTheme, countUp };
})();
