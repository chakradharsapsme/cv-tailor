/*
 * tasks.js — long AI steps (fit analysis, tailoring, cover letter) run in the background.
 * You can leave the page, open other applications or search jobs while they run.
 * A small "Working…" tray in the corner shows progress; when a step finishes you get a notice with a link.
 */
(function () {
  const { esc } = window.CVT.ui;
  const tasks = new Map(); // id -> { id, title, steps, at, ctl, href, status, error }
  let tray = null;

  function ensureTray() {
    if (tray && document.body.contains(tray)) return tray;
    tray = document.createElement('div');
    tray.className = 'bg-tray'; tray.setAttribute('role', 'status'); tray.setAttribute('aria-live', 'polite');
    document.body.append(tray);
    tray.addEventListener('click', e => {
      const s = e.target.closest('[data-stop]'); if (s) { const t = tasks.get(s.dataset.stop); if (t) t.ctl.abort(); return; }
      const x = e.target.closest('[data-dismiss]'); if (x) { tasks.delete(x.dataset.dismiss); draw(); }
    });
    return tray;
  }
  function draw() {
    const list = [...tasks.values()];
    const box = ensureTray();
    box.hidden = !list.length;
    box.innerHTML = list.map(t => {
      const pct = t.status === 'done' ? 100 : Math.round(((t.at + 0.5) / t.steps.length) * 100);
      const label = t.status === 'done' ? 'Ready' : t.status === 'failed' ? (t.error || 'Did not finish') : t.steps[t.at] || 'Working…';
      return `<div class="bg-task ${t.status}">
        <div class="bg-row"><span class="bg-dot" aria-hidden="true"></span><a class="bg-title" href="${esc(t.href)}">${esc(t.title)}</a>
          ${t.status === 'running' ? `<button class="linkish small" type="button" data-stop="${esc(t.id)}">Stop</button>` : `<button class="icon-btn sm" type="button" data-dismiss="${esc(t.id)}" aria-label="Dismiss">×</button>`}</div>
        <div class="bg-step">${esc(label)}</div>
        <div class="bg-bar"><i style="width:${pct}%"></i></div></div>`;
    }).join('');
    document.dispatchEvent(new CustomEvent('cvt-tasks'));
  }

  /**
   * Start a background task. `work(t)` gets { signal, step(i) } and does the job.
   * Returns false when one is already running for this id.
   */
  function start({ id, title, steps, href, work, doneText }) {
    const cur = tasks.get(id);
    if (cur && cur.status === 'running') return false;
    const t = { id, title, steps, at: 0, ctl: new AbortController(), href, status: 'running', error: '' };
    tasks.set(id, t); draw();
    const api = { signal: t.ctl.signal, step(i) { t.at = Math.min(i, steps.length - 1); draw(); }, title(x) { if (x) { t.title = x; draw(); } } };
    Promise.resolve().then(() => work(api)).then(msg => {
      t.status = 'done'; t.at = steps.length - 1; draw();
      notify(msg || doneText || 'Finished', t);
      setTimeout(() => { if (tasks.get(id) === t && t.status === 'done') { tasks.delete(id); draw(); } }, 12000);
      document.dispatchEvent(new CustomEvent('cvt-task-done', { detail: { id, ok: true } }));
    }).catch(e => {
      t.status = 'failed'; t.error = e && e.name === 'AbortError' ? 'Stopped' : ((e && e.message) || 'Something went wrong'); draw();
      if (!(e && e.name === 'AbortError')) notify(t.title + ': ' + t.error, t, 'warn');
      document.dispatchEvent(new CustomEvent('cvt-task-done', { detail: { id, ok: false, error: t.error } }));
    });
    return true;
  }

  // A notice with a link that stays a little longer than an ordinary toast.
  function notify(msg, t, kind = 'ok') {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); document.body.append(box); }
    const el = document.createElement('div');
    el.className = 'toast ' + kind + ' with-link';
    el.innerHTML = `<span>${esc(msg)}</span>${location.hash.startsWith(t.href) ? '' : ` <a class="toast-link" href="${esc(t.href)}">Open</a>`}`;
    box.append(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 7000);
    try { if (document.hidden && window.Notification && Notification.permission === 'granted') new Notification('Applywise', { body: msg }); } catch (_) {}
  }

  window.CVT = window.CVT || {};
  window.CVT.tasks = { start, get: id => tasks.get(id), running: id => { const t = tasks.get(id); return !!(t && t.status === 'running'); }, stop: id => { const t = tasks.get(id); if (t) t.ctl.abort(); } };
})();
