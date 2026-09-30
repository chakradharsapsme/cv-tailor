/*
 * pwa.js — installable app: offline support (sw.js), an "Install app" button, iPhone/iPad
 * instructions, a notice when a new version is ready, and an offline banner.
 */
(function () {
  const $ = s => document.querySelector(s);
  const inClaude = () => !!(window.claude && window.claude.use);
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let deferred = null;

  function buttons() { return [$('#tb-install'), $('#sf-install'), $('#st-install')].filter(Boolean); }
  function showInstall(on) { buttons().forEach(b => { b.hidden = !on; }); }
  const canInstall = () => !standalone() && !inClaude() && (!!deferred || ios());

  async function install() {
    if (deferred) {
      deferred.prompt();
      const r = await deferred.userChoice.catch(() => null);
      deferred = null; showInstall(false);
      if (r && r.outcome === 'accepted') window.CVT.ui.toast('Applywise is installed. Find it with your other apps.');
      return;
    }
    if (ios()) return iosHelp();
    window.CVT.ui.toast('Use your browser menu → "Install app" or "Add to Home screen".');
  }
  function iosHelp() {
    let d = $('#ios-help');
    if (!d) {
      d = document.createElement('dialog'); d.id = 'ios-help'; d.className = 'modal';
      d.innerHTML = `<div class="modal-body"><h2>Add Applywise to your Home Screen</h2>
        <ol class="tight"><li>Open this page in <strong>Safari</strong>.</li><li>Tap the <strong>Share</strong> button (the square with an arrow).</li>
        <li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li></ol>
        <p class="hint">It then opens full screen like any other app, and works offline.</p>
        <div class="row gap"><button class="btn primary" type="button" data-close>Got it</button></div></div>`;
      document.body.append(d);
      d.addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target === d) d.close(); });
    }
    d.showModal ? d.showModal() : d.setAttribute('open', '');
  }

  function updateBar(reg) {
    if ($('#upd-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'upd-bar'; bar.className = 'upd-bar'; bar.setAttribute('role', 'status');
    bar.innerHTML = '<span>A new version of Applywise is ready.</span><button class="btn primary small" type="button">Update now</button>';
    bar.querySelector('button').addEventListener('click', () => { if (reg.waiting) reg.waiting.postMessage('skipWaiting'); });
    document.body.append(bar);
  }
  function offline() {
    let b = $('#offline-bar');
    if (navigator.onLine) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.id = 'offline-bar'; b.className = 'offline-bar'; b.setAttribute('role', 'status'); b.textContent = 'You are offline. Your saved work is here; job searches and AI need a connection.'; document.body.append(b); }
  }

  async function init() {
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; showInstall(true); });
    window.addEventListener('appinstalled', () => { deferred = null; showInstall(false); });
    document.addEventListener('click', e => { if (e.target.closest('#tb-install, #sf-install, #st-install')) { e.preventDefault(); install(); } });
    window.addEventListener('online', offline); window.addEventListener('offline', offline); offline();
    showInstall(canInstall());
    if (standalone()) document.documentElement.classList.add('is-app');
    // Offline support only on the public site (the claude.ai page runs in its own sandbox).
    if (inClaude() || !('serviceWorker' in navigator) || !(location.protocol === 'https:' || location.hostname === 'localhost')) return;
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      const had = !!navigator.serviceWorker.controller;
      if (reg.waiting && had) updateBar(reg);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing; if (!w) return;
        w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) updateBar(reg); });
      });
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !reloaded) { reloaded = true; location.reload(); } });
      setInterval(() => reg.update().catch(() => {}), 60 * 60e3);
    } catch (e) { console.warn('Offline support unavailable', e); }
  }

  window.CVT = window.CVT || {};
  window.CVT.pwa = { init, install, canInstall, standalone, refresh: () => showInstall(canInstall()) };
})();
