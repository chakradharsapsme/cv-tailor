/*
 * engine.js — "Switch on free AI" in one step, right where it's needed.
 * Any AI action without an engine opens this dialog instead of an error. The options are all free:
 *   Chrome's built-in AI (runs on this computer, no sign-in), Puter (free sign-in in a pop-up window),
 *   or a free Google Gemini key. When one is ready, the action carries on by itself.
 */
(function () {
  const S = window.CVT.store;
  const st = () => window.CVT.ui.state;
  const inClaude = () => !!(window.claude && window.claude.use);
  const ready = () => !!st().key;
  let pending = null;

  function use(provider) {
    st().provider = provider; st().models = [];
    S.local.set('cvt.provider', provider);
    window.CVT.app.refreshKey();
  }

  /** Resolves true once an AI engine is ready (at once if it already is), false if the person closes the dialog. */
  function ensure(reason) {
    if (ready()) return Promise.resolve(true);
    if (inClaude()) { use('claude-plan'); if (ready()) return Promise.resolve(true); }
    if (pending) return pending;
    pending = new Promise(resolve => {
      const hasChrome = typeof window.LanguageModel !== 'undefined';
      const d = document.createElement('dialog');
      d.className = 'modal engine-modal'; d.setAttribute('aria-labelledby', 'eng-title');
      d.innerHTML = `<div class="modal-body">
        <h2 id="eng-title">Switch on the free AI</h2>
        <p class="hint">${reason ? reason + ' ' : ''}This needs an AI engine. ${hasChrome ? 'All three options' : 'Both options'} below are free; pick one once and Applywise remembers it on this device.</p>
        <div class="eng-opts">
          ${hasChrome ? `<button class="eng-opt" type="button" data-e="chrome"><strong>Chrome's built-in AI</strong><span>Runs on this computer. No sign-in, nothing leaves your device. The first use downloads the model.</span></button>` : ''}
          ${S.local.get('cvt.claudeLink', '') ? `<button class="eng-opt eng-claude" type="button" data-e="claude"><strong>My Claude subscription</strong><span>Opens your own Claude version of Applywise, where the AI runs on your monthly plan with nothing billed on top. Your data there is separate: move it with Settings → Backup.</span></button>` : ''}
          <button class="eng-opt" type="button" data-e="puter"><strong>Puter AI</strong><span>Free. A Puter window opens once to sign in or create a free account.</span></button>
          <div class="eng-opt eng-gemini"><strong>Google Gemini key</strong><span>Free key from Google AI Studio (about a minute, needs a Google account).
            <a class="link" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">Get a free key</a>, then paste it here.</span>
            <div class="row gap mt"><input id="eng-key" type="password" placeholder="Paste your Gemini key" autocomplete="off" aria-label="Gemini key"><button class="btn small" type="button" data-e="gemini">Save</button></div></div>
        </div>
        <p class="small" id="eng-status" aria-live="polite"></p>
        <div class="row gap"><span class="grow-s"></span><button class="btn ghost" type="button" data-e="close">Not now</button></div>
      </div>`;
      document.body.append(d);
      const status = t => { d.querySelector('#eng-status').textContent = t; };
      const done = ok => { try { d.close(); } catch (_) {} d.remove(); pending = null; resolve(ok); };
      d.addEventListener('cancel', e => { e.preventDefault(); done(false); });
      d.addEventListener('click', async e => {
        const b = e.target.closest('[data-e]'); if (!b) return;
        const k = b.dataset.e;
        if (k === 'close') return done(false);
        if (k === 'claude') { window.open(S.local.get('cvt.claudeLink', ''), '_blank', 'noopener'); return done(false); }
        b.disabled = true;
        try {
          if (k === 'chrome') {
            status('Getting Chrome\'s built-in AI ready… the first time this downloads the model, keep this tab open.');
            const sess = await window.LanguageModel.create({ monitor(m) { m.addEventListener('downloadprogress', ev => status(`Downloading the model… ${Math.round((ev.loaded || 0) * 100)}%`)); } });
            sess.destroy(); use('chrome-ai');
          }
          if (k === 'puter') {
            status('Opening Puter… sign in or create a free account in the pop-up window.');
            const pz = await window.CVT.agent.loadPuter();
            if (pz.auth && !pz.auth.isSignedIn()) await pz.auth.signIn();
            use('puter');
          }
          if (k === 'gemini') {
            const v = d.querySelector('#eng-key').value.trim();
            if (!v) { status('Paste your key first.'); b.disabled = false; return; }
            status('Checking the key…');
            S.local.set('cvt.geminiKey', v); st().geminiKey = v; st().provider = 'gemini'; S.local.set('cvt.provider', 'gemini');
            const ok = await window.CVT.app.loadModels();
            if (!ok) throw new Error(st().lastError || 'That key did not work.');
          }
          if (ready()) { window.CVT.ui.toast('AI switched on'); return done(true); }
          throw new Error('Not ready yet. Try another option.');
        } catch (x) { status((x && x.message) || 'That did not work. Try another option.'); b.disabled = false; }
      });
      d.showModal ? d.showModal() : d.setAttribute('open', '');
    });
    return pending;
  }

  window.CVT = window.CVT || {};
  window.CVT.ai = { ensure, ready };
})();
