/* app.js — boot, navigation and API key state. */
(function () {
  const { $, $$, state, toast } = window.CVT.ui;
  const S = window.CVT.store, A = window.CVT.agent, V = window.CVT.views;

  const inClaude = () => !!(window.claude && window.claude.use);
  const LABEL = { 'claude-plan': 'Claude plan', gemini: 'Gemini', anthropic: 'Anthropic API' };

  /** state.key is "ready" when the chosen engine can run; the real keys live in their own fields. */
  function refreshKey() {
    const s = state;
    const ready = s.provider === 'claude-plan' ? inClaude()
      : s.provider === 'gemini' ? !!(s.geminiKey && s.geminiModel)
      : !!(s.anthropicKey && s.anthropicModel);
    s.key = ready ? 'ready' : '';
    s.model = s.provider === 'gemini' ? s.geminiModel : s.provider === 'anthropic' ? s.anthropicModel : 'claude-plan';
    const pill = $('#key-pill');
    pill.dataset.state = ready ? 'ready' : 'missing';
    pill.textContent = ready ? LABEL[s.provider] + (s.provider === 'claude-plan' ? '' : ' · ' + String(s.model || '').replace(/^claude-|^gemini-/, '')) : 'Set up the AI engine';
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
      } else if (s.provider === 'anthropic') {
        s.models = await A.listModels(s.anthropicKey);
        if (!s.anthropicModel || !s.models.some(m => m.id === s.anthropicModel)) {
          const pick = s.models.find(m => /sonnet/i.test(m.id)) || s.models.find(m => /opus/i.test(m.id)) || s.models[0];
          s.anthropicModel = pick ? pick.id : '';
          S.local.set('cvt.model', s.anthropicModel);
        }
      } else { s.models = []; }
      refreshKey();
      return true;
    } catch (e) { s.lastError = e.message; refreshKey(); return false; }
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
    state.anthropicKey = S.local.get('cvt.key', '');
    state.anthropicModel = S.local.get('cvt.model', '');
    state.geminiKey = S.local.get('cvt.geminiKey', '');
    state.geminiModel = S.local.get('cvt.geminiModel', '');
    state.provider = S.local.get('cvt.provider', '') || (inClaude() ? 'claude-plan' : state.geminiKey ? 'gemini' : state.anthropicKey ? 'anthropic' : 'gemini');
    if (state.provider === 'claude-plan' && !inClaude()) state.provider = state.geminiKey ? 'gemini' : 'anthropic';
    refreshKey();
    try { await S.migrateV1(); } catch (e) { console.warn('Migration skipped', e); }
    if (state.provider !== 'claude-plan' && (state.geminiKey || state.anthropicKey)) loadModels();
    window.addEventListener('hashchange', route);
    await route();
    // Keep the pipeline badge fresh.
    const n = (await S.listApps()).filter(a => a.next && a.next.due && a.next.due <= new Date().toISOString().slice(0, 10)).length;
    const badge = $('#due-badge'); if (badge) { badge.textContent = n; badge.hidden = !n; }
  }

  window.CVT.app = { route, rerender, refreshKey, loadModels, inClaude };
  if (!window.indexedDB) { $('#main').innerHTML = '<section class="panel"><h1>Storage unavailable</h1><p>This browser blocks local storage (private window?). Open CV Tailor in a normal window.</p></section>'; return; }
  boot().catch(e => { console.error(e); toast(e.message, 'bad'); });
})();
