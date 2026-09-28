/* app.js — boot, navigation and API key state. */
(function () {
  const { $, $$, state, toast } = window.CVT.ui;
  const S = window.CVT.store, A = window.CVT.agent, V = window.CVT.views;

  function refreshKey() {
    const pill = $('#key-pill');
    pill.dataset.state = state.key ? 'ready' : 'missing';
    pill.textContent = state.key ? (state.model ? state.model.replace(/^claude-/, '') : 'Key saved') : 'No API key';
    pill.title = state.key ? 'Agent connected' : 'Add your API key in Settings';
  }

  async function loadModels() {
    try {
      state.models = await A.listModels(state.key);
      if (!state.model || !state.models.some(m => m.id === state.model)) {
        const pick = state.models.find(m => /sonnet/i.test(m.id)) || state.models.find(m => /opus/i.test(m.id)) || state.models[0];
        state.model = pick ? pick.id : '';
        S.local.set('cvt.model', state.model);
      }
      refreshKey();
      return true;
    } catch (e) { state.lastError = e.message; return false; }
  }

  let routing = Promise.resolve();
  function route() {
    routing = routing.then(render, render);
    return routing;
  }
  async function render() {
    const hash = location.hash || '#/dashboard';
    const [, view, id, tab] = hash.split('/');
    const main = $('#main');
    const root = document.createElement('div');
    root.className = 'view';
    main.replaceChildren(root);
    const current = view === 'app' ? 'pipeline' : (view || 'dashboard');
    $$('.nav a').forEach(a => { if (a.dataset.nav === current) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    try {
      if (view === 'new') {
        const masters = await S.listMasters();
        const a = S.newApp((masters.find(m => m.isDefault) || masters[0] || {}).id);
        await S.saveApp(a);
        location.replace(`#/app/${a.id}/job`);
        return;
      }
      if (view === 'app') await V.workspace(root, id, tab);
      else if (view === 'pipeline') await V.pipeline(root);
      else if (view === 'profile') await V.profile(root);
      else if (view === 'settings') await V.settings(root);
      else await V.dashboard(root);
      document.title = ({ app: 'Application', pipeline: 'Pipeline', profile: 'Career profile', settings: 'Settings' }[view] || 'Dashboard') + ' · CV Tailor';
    } catch (e) {
      console.error(e);
      root.innerHTML = `<section class="panel"><h1>Something went wrong</h1><p class="error">${window.CVT.ui.esc(e.message)}</p><p><a class="link" href="#/dashboard">Back to dashboard</a></p></section>`;
    }
    if (!window.CVT._keepScroll) window.scrollTo(0, 0);
    window.CVT._keepScroll = false;
  }
  function rerender() { window.CVT._keepScroll = true; return route(); }

  async function boot() {
    state.key = S.local.get('cvt.key', '');
    state.model = S.local.get('cvt.model', '');
    refreshKey();
    try { await S.migrateV1(); } catch (e) { console.warn('Migration skipped', e); }
    if (state.key) loadModels();
    window.addEventListener('hashchange', route);
    await route();
    // Keep the pipeline badge fresh.
    const n = (await S.listApps()).filter(a => a.next && a.next.due && a.next.due <= new Date().toISOString().slice(0, 10)).length;
    const badge = $('#due-badge'); if (badge) { badge.textContent = n; badge.hidden = !n; }
  }

  window.CVT.app = { route, rerender, refreshKey, loadModels };
  if (!window.indexedDB) { $('#main').innerHTML = '<section class="panel"><h1>Storage unavailable</h1><p>This browser blocks local storage (private window?). Open CV Tailor in a normal window.</p></section>'; return; }
  boot().catch(e => { console.error(e); toast(e.message, 'bad'); });
})();
