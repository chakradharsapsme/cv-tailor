/* ui.js — small helpers shared by every view. */
(function () {
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
  const raw = s => ({ __raw: String(s) });
  const fmt = v => v == null || v === false ? '' : v.__raw !== undefined ? v.__raw : Array.isArray(v) ? v.map(fmt).join('') : esc(v);
  /** Tagged template: interpolations are escaped unless they are html`` results or raw(). */
  function html(strings, ...vals) {
    let s = '';
    strings.forEach((str, i) => { s += str + (i < vals.length ? fmt(vals[i]) : ''); });
    return { __raw: s, toString() { return s; } };
  }
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function toast(msg, kind = 'ok') {
    let box = $('#toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); document.body.append(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + kind; t.textContent = msg;
    box.append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 2600);
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function copy(text, btn) {
    const label = btn ? btn.textContent : '';
    try { await navigator.clipboard.writeText(text); if (btn) btn.textContent = 'Copied'; toast('Copied to clipboard'); }
    catch (_) { toast('Copy blocked by the browser. Select the text and press Ctrl+C.', 'warn'); }
    if (btn) setTimeout(() => { btn.textContent = label; }, 1500);
  }

  const today = () => new Date().toISOString().slice(0, 10);
  const ukDate = d => new Date(d || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const longDate = () => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const daysBetween = (a, b = new Date()) => Math.floor((new Date(b) - new Date(a)) / 86400000);
  const slug = s => (s || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Role';

  const VERDICT = {
    apply: { label: 'Apply', cls: 'ok' },
    apply_with_angle: { label: 'Apply with an angle', cls: 'accent' },
    stretch: { label: 'Stretch', cls: 'warn' },
    skip: { label: 'Skip', cls: 'bad' }
  };
  const scoreCls = s => s >= 70 ? 'ok' : s >= 50 ? 'warn' : 'bad';

  function gauge(score, size = 104) {
    const s = Math.max(0, Math.min(100, Number(score) || 0));
    const r = 44, c = 2 * Math.PI * r;
    return raw(`<svg class="gauge" width="${size}" height="${size}" viewBox="0 0 104 104" role="img" aria-label="Fit score ${s} out of 100">
      <circle cx="52" cy="52" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="8"/>
      <circle cx="52" cy="52" r="${r}" fill="none" stroke="var(--${scoreCls(s)})" stroke-width="8" stroke-linecap="round"
        stroke-dasharray="${(c * s / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 52 52)"/>
      <text x="52" y="58" text-anchor="middle" class="gauge-num" fill="var(--ink)">${s}</text>
      <text x="52" y="74" text-anchor="middle" font-size="8.5" letter-spacing=".08em" fill="var(--muted)">FIT</text></svg>`);
  }

  /** Progress list for multi-step agent calls. */
  function progress(el, labels) {
    el.innerHTML = labels.map(l => `<li>${esc(l)}</li>`).join('');
    el.hidden = false;
    const items = $$('li', el);
    return {
      at(i) { items.forEach((li, j) => { li.className = j < i ? 'done' : j === i ? 'active' : ''; }); },
      done() { items.forEach(li => { li.className = 'done'; }); },
      fail(i) { if (items[i]) items[i].className = 'fail'; }
    };
  }

  /** Shared app state (loaded once, refreshed by views). */
  const state = {
    key: '', model: '', profile: null, masters: [], models: [],
    masterCache: new Map() // masterId -> loaded docx model
  };
  async function masterModel(id) {
    const S = window.CVT.store;
    let m = id ? await S.getMaster(id) : null;
    if (!m) m = (await S.listMasters())[0];
    if (!m) return null;
    if (!state.masterCache.has(m.id)) state.masterCache.set(m.id, await window.CVT.docx.load(m.data.slice(0)));
    return { master: m, model: state.masterCache.get(m.id) };
  }

  window.CVT = window.CVT || {};
  window.CVT.ui = { esc, raw, html, $, $$, toast, download, copy, today, ukDate, longDate, daysBetween, slug, VERDICT, scoreCls, gauge, progress, state, masterModel };
})();
