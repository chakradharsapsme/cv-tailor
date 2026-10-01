/* app.js — boot, navigation and API key state. */
(function () {
  const { $, $$, state, toast } = window.CVT.ui;
  const S = window.CVT.store, A = window.CVT.agent, V = window.CVT.views;

  const inClaude = () => !!(window.claude && window.claude.use);
  const LABEL = { 'claude-plan': 'Built-in AI', gemini: 'Gemini (free)', puter: 'Puter AI (free)', 'chrome-ai': 'Chrome built-in AI' };

  /** state.key is "ready" when the chosen engine can run; the real keys live in their own fields. */
  function refreshKey() {
    const s = state;
    const ready = s.provider === 'claude-plan' ? inClaude() : s.provider === 'puter' ? true : s.provider === 'chrome-ai' ? typeof window.LanguageModel !== 'undefined' : !!(s.geminiKey && s.geminiModel);
    s.key = ready ? 'ready' : '';
    s.model = s.provider === 'gemini' ? s.geminiModel : 'claude-plan';
    const pill = $('#key-pill');
    pill.dataset.state = ready ? 'ready' : 'missing';
    pill.textContent = ready ? LABEL[s.provider] + (s.provider !== 'gemini' ? '' : ' · ' + String(s.model || '').replace(/^claude-|^gemini-/, '')) : 'Set up the AI engine';
    pill.title = ready ? 'Agent connected' : 'Choose an AI engine in Settings';
  }

  async function loadModels() {
    const s = state;
    try {
      if (s.provider === 'gemini') {
        s.models = await A.listGemini(s.geminiKey);
        if (!s.geminiModel || !s.models.some(m => m.id === s.geminiModel)) {
          const pick = s.models.find(m => /flash/i.test(m.id) && !/lite|preview|exp/i.test(m.id)) || s.models.find(m => /flash/i.test(m.id)) || s.models[0];
          s.geminiModel = pick ? pick.id : '';
          S.local.set('cvt.geminiModel', s.geminiModel);
        }
      } else { s.models = []; }
      refreshKey();
      return true;
    } catch (e) { s.lastError = e.message; refreshKey(); return false; }
  }

  // In-page routing. Inside claude.ai the page runs in a frame where hash links can't be relied on,
  // so links are intercepted and the current view is kept here.
  let current = location.hash || '#/dashboard';
  // Never touch history or location.hash inside claude.ai: changing the frame's URL makes the host page hang.
  const canUseHistory = () => !inClaude();
  function go(h) {
    current = h;
    if (canUseHistory()) { try { history.pushState(null, '', h); } catch (_) {} }
    return route();
  }
  // Internal links carry data-go instead of a live href, so the host frame can't swallow the click.
  const wire = node => {
    const list = node.matches && node.matches('a[href^="#/"]') ? [node] : node.querySelectorAll ? node.querySelectorAll('a[href^="#/"]') : [];
    list.forEach(a => { a.dataset.go = a.getAttribute('href'); a.removeAttribute('href'); a.setAttribute('role', 'link'); a.tabIndex = 0; });
  };
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && wire(n)))).observe(document.body, { childList: true, subtree: true });
  wire(document.body);
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('[data-go]');
    if (!a || e.button !== 0) return;
    e.preventDefault();
    go(a.dataset.go);
  });
  document.addEventListener('keydown', e => {
    const a = e.target.closest && e.target.closest('[data-go]');
    if (a && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(a.dataset.go); }
  });
  window.addEventListener('popstate', () => { current = location.hash || '#/dashboard'; route(); });

  let routing = Promise.resolve();
  function route() {
    routing = routing.then(render, render);
    return routing;
  }
  async function render() {
    const hash = current || '#/dashboard';
    const slow = setTimeout(() => toast('Still loading ' + hash + '…', 'warn'), 5000);
    try { await renderInner(hash); } finally { clearTimeout(slow); }
    refreshBadges();
  }
  async function renderInner(hash) {
    const [, view, id, tab] = hash.split('/');
    const main = $('#main');
    const root = document.createElement('div');
    root.className = 'view';
    main.replaceChildren(root);
    const navKey = view === 'app' ? 'pipeline' : view === 'autopilot' ? 'dashboard' : (view || 'dashboard');
    $$('.nav a').forEach(a => { if (a.dataset.nav === navKey) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    try {
      if (view === 'new') {
        const masters = await S.listMasters();
        const a = S.newApp((masters.find(m => m.isDefault) || masters[0] || {}).id);
        await S.saveApp(a);
        current = `#/app/${a.id}/job`;
        if (canUseHistory()) { try { history.replaceState(null, '', current); } catch (_) {} }
        return render();
      }
      if (view === 'app') await V.workspace(root, id, tab);
      else if (view === 'pipeline') await V.pipeline(root);
      else if (view === 'jobs') await window.CVT.jobs.view(root);
      else if (view === 'autopilot') await window.CVT.autopilot.view(root);
      else if (view === 'prep') await window.CVT.prep.view(root, id, tab);
      else if (view === 'help') await V.help(root);
      else if (view === 'pricing') await window.CVT.shell.pricing(root);
      else if (view === 'profile') await V.profile(root);
      else if (view === 'settings') await V.settings(root);
      else await V.dashboard(root);
      const T = ({ app: 'Application', pipeline: 'Pipeline', jobs: 'Jobs', prep: 'Interview prep', autopilot: 'Autopilot', help: 'Help and privacy', profile: 'Career profile', settings: 'Settings', pricing: 'Plans and pricing' }[view] || 'Dashboard');
      document.title = T + ' · Applywise';
      if (window.CVT.shell) window.CVT.shell.refresh(T);
    } catch (e) {
      console.error(e);
      root.innerHTML = `<section class="panel"><h1>Something went wrong</h1><p class="error">${window.CVT.ui.esc(e.message)}</p><p><a class="link" href="#/dashboard">Back to dashboard</a></p></section>`;
    }
    if (window.CVT.pwa) window.CVT.pwa.refresh();
    if (!window.CVT._keepScroll) window.scrollTo(0, 0);
    window.CVT._keepScroll = false;
  }
  function rerender() { window.CVT._keepScroll = true; return route(); }

  async function boot() {
    // The paid Anthropic API option was removed: forget any key saved by older versions.
    S.local.del('cvt.key'); S.local.del('cvt.model');
    state.geminiKey = S.local.get('cvt.geminiKey', '');
    state.geminiModel = S.local.get('cvt.geminiModel', '');
    state.provider = S.local.get('cvt.provider', '') || (inClaude() ? 'claude-plan' : 'gemini');
    if (!['claude-plan', 'gemini', 'puter', 'chrome-ai'].includes(state.provider)) state.provider = inClaude() ? 'claude-plan' : 'gemini';
    if (state.provider === 'claude-plan' && !inClaude()) state.provider = 'gemini';
    refreshKey();
    try { await S.migrateV1(); } catch (e) { console.warn('Migration skipped', e); }
    try { window.CVT.fields.use(await S.getProfile()); } catch (_) {}
    if (state.provider === 'gemini' && state.geminiKey) loadModels();
    window.addEventListener('hashchange', () => { if (location.hash && location.hash !== current) { current = location.hash; route(); } });
    if (window.CVT.shell) window.CVT.shell.initTopbar();
    if (window.CVT.pwa) window.CVT.pwa.init();
    if (window.CVT.quotes) window.CVT.quotes.init();
    await route();
    refreshBadges();
    // First visit: the 3-step welcome; otherwise the short tour (each only once).
    setTimeout(async () => { let shown = false; try { shown = window.CVT.welcome ? await window.CVT.welcome.open(false) : false; } catch (_) {} if (!shown && window.CVT.shell) window.CVT.shell.tour(false); }, 400);
    window.CVT.sync.onChange(st => { const n = $('#data-note'); if (n && st.state === 'on') n.textContent = 'Private to you and synced to your own account. Nothing is submitted without you.'; });
    // Pull newer data from your other devices (inside claude.ai), then redraw if anything changed.
    try {
      const r = await window.CVT.sync.pull();
      if (r.changed) { toast(`Updated from your other device (${r.changed} change${r.changed > 1 ? 's' : ''})`); rerender(); }
    } catch (_) {}
  }
  /** Sidebar counts: follow-ups due, and strong new job matches. */
  async function refreshBadges() {
    try {
      const n = (await S.listApps()).filter(a => a.next && a.next.due && a.next.due <= new Date().toISOString().slice(0, 10)).length;
      const badge = $('#due-badge'); if (badge) { badge.textContent = n; badge.hidden = !n; }
      const t = await window.CVT.jobs.top(0);
      const jb = $('#jobs-badge'); if (jb) { jb.textContent = t.newCount; jb.hidden = !t.newCount; }
      const d = await S.getKV('drills', null);
      const t0 = new Date().toISOString().slice(0, 10);
      const due = d ? Object.values(d.p || {}).filter(x => x.due <= t0).length : 0;
      const pb = $('#prep-badge'); if (pb) { pb.textContent = due; pb.hidden = !due; }
    } catch (_) {}
  }

  window.addEventListener('error', e => toast('Error: ' + (e.message || e.error), 'bad'));
  window.addEventListener('unhandledrejection', e => toast('Error: ' + ((e.reason && e.reason.message) || e.reason), 'bad'));
  window.CVT.app = { route, rerender, refreshKey, loadModels, inClaude, go, refreshBadges };
  if (!window.indexedDB) { $('#main').innerHTML = '<section class="panel"><h1>Storage unavailable</h1><p>This browser blocks local storage (private window?). Open Applywise in a normal window.</p></section>'; return; }
  boot().catch(e => { console.error(e); toast(e.message, 'bad'); });
})();
