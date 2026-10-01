/*
 * layout.js — personalise the dashboard, like "Edit home page" in SAP Fiori:
 * move sections between the three columns (drag, or arrow buttons), reorder, hide/show,
 * and "Reset to default" if the page gets messed up. Saved per person (and synced where available).
 */
(function () {
  const { toast } = window.CVT.ui;
  const S = window.CVT.store;
  const KEY = 'dashLayout';
  const COLS = ['left', 'mid', 'right'];
  const COL_LABEL = { left: 'left column', mid: 'middle column', right: 'right column' };
  const NAMES = { start: 'Your next step', cvs: 'Your CVs', profile: 'Profile card', numbers: 'Your numbers', setup: 'Get set up', jobs: 'New jobs for you', actions: 'Next actions', recent: 'Recent applications', coach: 'Coach notes', prep: 'Interview prep' };
  const DEFAULT = () => ({ left: ['profile', 'cvs', 'numbers'], mid: ['start', 'setup', 'jobs', 'actions', 'recent'], right: ['coach', 'prep'], hidden: [] });

  /** Make sure every known section appears exactly once (new sections land in their default column). */
  function normalise(l) {
    const d = DEFAULT(), out = { left: [], mid: [], right: [], hidden: [] }, seen = new Set();
    COLS.forEach(c => ((l && l[c]) || []).forEach(id => { if (NAMES[id] && !seen.has(id)) { out[c].push(id); seen.add(id); } }));
    // Sections added in a newer version go where the default layout puts them.
    COLS.forEach(c => d[c].forEach((id, i) => { if (!seen.has(id)) { out[c].splice(Math.min(i, out[c].length), 0, id); seen.add(id); } }));
    out.hidden = ((l && l.hidden) || []).filter(id => NAMES[id]);
    return out;
  }
  const load = async () => normalise(await S.getKV(KEY, null));
  const save = l => S.setKV(KEY, l);

  async function dashboard(root) {
    const cols = { left: root.querySelector('.d-left'), mid: root.querySelector('.d-mid'), right: root.querySelector('.d-right') };
    if (!cols.left || !cols.mid || !cols.right) return;
    const secs = {}; root.querySelectorAll('[data-sec]').forEach(el => { secs[el.dataset.sec] = el; });
    let layout = await load(), editing = false, before = null;

    const apply = () => {
      COLS.forEach(c => layout[c].forEach(id => { const el = secs[id]; if (el) cols[c].appendChild(el); }));
      Object.entries(secs).forEach(([id, el]) => {
        const hide = layout.hidden.includes(id);
        el.classList.toggle('sec-hidden', hide);
        el.hidden = hide && !editing;
      });
      COLS.forEach(c => cols[c].classList.toggle('col-empty', !layout[c].some(id => secs[id] && (editing || !layout.hidden.includes(id)))));
      root.querySelector('.dash3').classList.toggle('no-right', !editing && !layout.right.some(id => secs[id] && !layout.hidden.includes(id)));
      root.querySelector('.dash3').classList.toggle('no-left', !editing && !layout.left.some(id => secs[id] && !layout.hidden.includes(id)));
    };
    const where = id => { const c = COLS.find(k => layout[k].includes(id)); return { c, i: layout[c].indexOf(id) }; };
    const move = (id, dc, di) => {
      const { c, i } = where(id);
      if (dc) { const nc = COLS[COLS.indexOf(c) + dc]; if (!nc) return; layout[c].splice(i, 1); layout[nc].push(id); }
      else { const j = i + di; if (j < 0 || j >= layout[c].length) return; [layout[c][i], layout[c][j]] = [layout[c][j], layout[c][i]]; }
      apply(); controls(); secs[id].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };

    // ---- edit-mode chrome ----
    const bar = document.createElement('div');
    bar.className = 'cust-bar'; bar.hidden = true; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Customise dashboard');
    bar.innerHTML = `<div><strong>Customise your dashboard</strong><span class="muted small"> Drag a section by its ⠿ handle, or use the arrows. The eye hides or shows a section.</span></div>
      <div class="row gap wrap"><button class="btn ghost small" type="button" data-cu="reset">↺ Reset to default</button><button class="btn ghost small" type="button" data-cu="cancel">Cancel</button><button class="btn primary small" type="button" data-cu="done">Save layout</button></div>`;
    root.querySelector('.dash3').before(bar);

    function controls() {
      root.querySelectorAll('.sec-tools').forEach(x => x.remove());
      if (!editing) return;
      Object.entries(secs).forEach(([id, el]) => {
        const { c, i } = where(id), hid = layout.hidden.includes(id);
        const t = document.createElement('div');
        t.className = 'sec-tools';
        t.innerHTML = `<span class="sec-grip" draggable="true" title="Drag to move" aria-hidden="true">⠿</span><span class="sec-name">${NAMES[id]}${hid ? ' · hidden' : ''}</span>
          <button type="button" data-mv="up" title="Move up" aria-label="Move ${NAMES[id]} up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" data-mv="down" title="Move down" aria-label="Move ${NAMES[id]} down" ${i === layout[c].length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" data-mv="left" title="Move to the ${COL_LABEL[COLS[COLS.indexOf(c) - 1]] || ''}" aria-label="Move ${NAMES[id]} one column left" ${c === 'left' ? 'disabled' : ''}>←</button>
          <button type="button" data-mv="right" title="Move to the ${COL_LABEL[COLS[COLS.indexOf(c) + 1]] || ''}" aria-label="Move ${NAMES[id]} one column right" ${c === 'right' ? 'disabled' : ''}>→</button>
          <button type="button" data-mv="eye" title="${hid ? 'Show' : 'Hide'}" aria-label="${hid ? 'Show' : 'Hide'} ${NAMES[id]}">${hid ? '🙈' : '👁'}</button>`;
        t.dataset.for = id;
        el.prepend(t);
      });
    }

    function setEditing(on) {
      editing = on; bar.hidden = !on;
      root.classList.toggle('customising', on);
      const btn = root.querySelector('#dash-custom'); if (btn) btn.hidden = on;
      Object.values(secs).forEach(el => el.classList.toggle('sec-edit', on));
      apply(); controls();
    }

    root.addEventListener('click', async e => {
      if (e.target.closest('#dash-custom')) { before = JSON.parse(JSON.stringify(layout)); setEditing(true); bar.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
      const cu = e.target.closest('[data-cu]');
      if (cu) {
        if (cu.dataset.cu === 'done') { await save(layout); setEditing(false); toast('Dashboard layout saved'); }
        if (cu.dataset.cu === 'cancel') { layout = before || layout; setEditing(false); }
        if (cu.dataset.cu === 'reset') { layout = DEFAULT(); apply(); controls(); toast('Back to the default layout. Press Save layout to keep it.'); }
        return;
      }
      const mv = e.target.closest('[data-mv]'); if (!mv) return;
      e.preventDefault(); e.stopPropagation();
      const id = mv.closest('.sec-tools').dataset.for;
      if (mv.dataset.mv === 'up') move(id, 0, -1);
      if (mv.dataset.mv === 'down') move(id, 0, 1);
      if (mv.dataset.mv === 'left') move(id, -1, 0);
      if (mv.dataset.mv === 'right') move(id, 1, 0);
      if (mv.dataset.mv === 'eye') { const h = layout.hidden; const k = h.indexOf(id); if (k >= 0) h.splice(k, 1); else h.push(id); apply(); controls(); }
    }, true);

    // ---- drag and drop ----
    let dragId = null;
    root.addEventListener('dragstart', e => { const g = e.target.closest && e.target.closest('.sec-grip'); if (!g) return; dragId = g.closest('.sec-tools').dataset.for; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (_) {} secs[dragId].classList.add('dragging'); });
    root.addEventListener('dragend', () => { if (dragId && secs[dragId]) secs[dragId].classList.remove('dragging'); root.querySelectorAll('.drop-before,.drop-col').forEach(x => x.classList.remove('drop-before', 'drop-col')); dragId = null; });
    const target = e => {
      const col = COLS.find(c => cols[c].contains(e.target) || cols[c] === e.target); if (!col) return null;
      const list = layout[col].filter(id => id !== dragId);
      let idx = list.length;
      for (let k = 0; k < list.length; k++) { const r = secs[list[k]].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { idx = k; break; } }
      return { col, list, idx };
    };
    root.addEventListener('dragover', e => {
      if (!dragId) return; const t = target(e); if (!t) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      root.querySelectorAll('.drop-before,.drop-col').forEach(x => x.classList.remove('drop-before', 'drop-col'));
      if (t.idx < t.list.length) secs[t.list[t.idx]].classList.add('drop-before'); else cols[t.col].classList.add('drop-col');
    });
    root.addEventListener('drop', e => {
      if (!dragId) return; const t = target(e); if (!t) return; e.preventDefault();
      COLS.forEach(c => { layout[c] = layout[c].filter(id => id !== dragId); });
      t.list.splice(t.idx, 0, dragId); layout[t.col] = t.list;
      apply(); controls();
    });

    apply();
  }

  window.CVT.layout = { dashboard, DEFAULT, normalise };
})();
