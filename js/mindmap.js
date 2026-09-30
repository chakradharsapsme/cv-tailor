/*
 * mindmap.js — draws a mind map (centre + branches left and right) as inline SVG, plus an outline view.
 * tree = { center, branches: [{ label, detail, source, children: [...] }] }
 */
(function () {
  const COLORS = ['#2447D6', '#127A4A', '#C2410C', '#7C3AED', '#0E7490', '#BE185D', '#9A5B05'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  /** Give every node a stable id ("2.1.0") and a colour from its branch. */
  function index(tree) {
    const nodes = {};
    (tree.branches || []).forEach((b, i) => {
      const walk = (n, id, depth) => {
        n._id = id; n._depth = depth; n._color = COLORS[i % COLORS.length]; nodes[id] = n;
        (n.children || []).forEach((c, j) => walk(c, id + '.' + j, depth + 1));
      };
      walk(b, String(i), 1);
    });
    return nodes;
  }

  function svg(tree, collapsed) {
    const ROW = 30, GAP = 14, X = [0, 180, 420, 615], LABEL = [0, 26, 24, 22];
    const branches = tree.branches || [];
    const sides = [[], []];
    branches.forEach((b, i) => sides[i % 2].push(b));
    const leaves = n => (collapsed.has(n._id) || !(n.children || []).length) ? 1 : n.children.reduce((a, c) => a + leaves(c), 0);
    const sideH = side => side.reduce((a, b) => a + leaves(b) * ROW, 0) + Math.max(0, side.length - 1) * GAP;
    const H = Math.max(sideH(sides[0]), sideH(sides[1]), 120) + 40;
    const W = 1600, cx = W / 2, cy = H / 2;
    const parts = [];
    const place = (n, dir, top) => {
      const h = leaves(n) * ROW;
      const y = top + h / 2, x = cx + dir * X[n._depth];
      n._x = x; n._y = y;
      let t = top;
      if (!collapsed.has(n._id)) (n.children || []).forEach(c => { place(c, dir, t); t += leaves(c) * ROW; });
      return y;
    };
    const lines = [], labels = [];
    const draw = (n, dir, px, py) => {
      const w = n._depth === 1 ? 2.6 : n._depth === 2 ? 1.8 : 1.2;
      const mx = (px + n._x) / 2;
      lines.push(`<path d="M${px},${py} C${mx},${py} ${mx},${n._y} ${n._x},${n._y}" fill="none" stroke="${n._color}" stroke-width="${w}" stroke-opacity="${n._depth === 1 ? 0.9 : 0.6}"/>`);
      const kids = (n.children || []).length, isCol = collapsed.has(n._id);
      const anchor = dir > 0 ? 'start' : 'end', tx = n._x + dir * 8;
      const cls = 'mm-node d' + n._depth;
      labels.push(`<g class="${cls}" data-mm="${n._id}" tabindex="0" role="button" aria-label="${esc(n.label)}">
        <circle cx="${n._x}" cy="${n._y}" r="${n._depth === 1 ? 5.5 : 4}" fill="${kids && isCol ? n._color : 'var(--surface)'}" stroke="${n._color}" stroke-width="2"/>
        <text x="${tx}" y="${n._y + 4}" text-anchor="${anchor}" class="mm-t" ${n._depth === 1 ? `fill="${n._color}"` : ''}>${esc(clip(n.label, LABEL[n._depth]))}${kids && isCol ? ` (+${kids})` : ''}</text>
        <title>${esc(n.label)}${n.detail ? ' — ' + esc(n.detail) : ''}</title></g>`);
      const tw = clip(n.label, LABEL[n._depth]).length * (n._depth === 1 ? 7.8 : 7) + 14;
      if (!isCol) (n.children || []).forEach(c => draw(c, dir, n._x + dir * tw, n._y));
    };
    sides.forEach((side, s) => {
      const dir = s === 0 ? 1 : -1;
      let top = cy - sideH(side) / 2;
      side.forEach(b => { place(b, dir, top); top += leaves(b) * ROW + GAP; });
      side.forEach(b => draw(b, dir, cx + dir * 70, cy));
    });
    const title = clip(tree.center || 'This job', 34);
    parts.push(`<svg class="mm-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Mind map: ${esc(tree.center)}" xmlns="http://www.w3.org/2000/svg">`);
    parts.push(lines.join(''));
    parts.push(`<g class="mm-center"><rect x="${cx - 110}" y="${cy - 26}" width="220" height="52" rx="26" fill="var(--accent)"/><text x="${cx}" y="${cy + 5}" text-anchor="middle" class="mm-ct">${esc(title)}</text><title>${esc(tree.center)}</title></g>`);
    parts.push(labels.join(''));
    parts.push('</svg>');
    return parts.join('');
  }

  function outline(tree) {
    const li = n => `<li><button type="button" class="linkish mm-ol" data-mm="${n._id}" style="color:${n._depth === 1 ? n._color : 'inherit'}">${esc(n.label)}</button>${n.detail ? `<span class="muted small"> · ${esc(n.detail)}</span>` : ''}${(n.children || []).length ? `<ul>${n.children.map(li).join('')}</ul>` : ''}</li>`;
    return `<ul class="mm-outline"><li><strong>${esc(tree.center)}</strong><ul>${(tree.branches || []).map(li).join('')}</ul></li></ul>`;
  }

  /** Mount into el. Returns { svgText } for export. */
  function mount(el, tree, opts = {}) {
    const nodes = index(tree);
    const collapsed = new Set(opts.collapsed || []);
    let mode = opts.mode || 'map', selected = null;
    const detail = id => {
      const n = nodes[id]; if (!n) return '';
      return `<div class="mm-detail" style="border-left-color:${n._color}"><strong>${esc(n.label)}</strong>${n.detail ? `<p class="small">${esc(n.detail)}</p>` : ''}${(n.children || []).length ? `<button type="button" class="btn ghost small" data-mm-toggle="${n._id}">${collapsed.has(n._id) ? 'Expand' : 'Collapse'} this branch</button>` : ''}</div>`;
    };
    const render = () => {
      el.innerHTML = `<div class="mm-bar"><div class="seg-mini" role="tablist"><button type="button" data-mm-mode="map" aria-selected="${mode === 'map'}">Map</button><button type="button" data-mm-mode="outline" aria-selected="${mode === 'outline'}">Outline</button></div>
        <span class="muted small">Click a topic for details${mode === 'map' ? '; double-click to fold or unfold it' : ''}.</span>
        <span class="grow-s"></span>${mode === 'map' ? '<button type="button" class="linkish small" data-mm-all="open">Expand all</button> <button type="button" class="linkish small" data-mm-all="close">Collapse all</button>' : ''}</div>
        <div class="mm-wrap">${mode === 'map' ? svg(tree, collapsed) : outline(tree)}</div>
        <div class="mm-detail-slot">${selected ? detail(selected) : '<p class="muted small">Select a topic to see what the documents say about it.</p>'}</div>`;
      if (selected) el.querySelectorAll(`[data-mm="${selected}"]`).forEach(g => g.classList.add('sel'));
    };
    const toggle = id => { if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id); opts.onChange && opts.onChange([...collapsed]); render(); };
    el.onclick = e => {
      const m = e.target.closest('[data-mm-mode]'); if (m) { mode = m.dataset.mmMode; render(); return; }
      const all = e.target.closest('[data-mm-all]');
      if (all) { collapsed.clear(); if (all.dataset.mmAll === 'close') Object.values(nodes).forEach(n => { if (n._depth === 1 && (n.children || []).length) collapsed.add(n._id); }); opts.onChange && opts.onChange([...collapsed]); render(); return; }
      const t = e.target.closest('[data-mm-toggle]'); if (t) { toggle(t.dataset.mmToggle); return; }
      const n = e.target.closest('[data-mm]'); if (n) { selected = n.dataset.mm; render(); }
    };
    el.ondblclick = e => { const n = e.target.closest('[data-mm]'); if (n && (nodes[n.dataset.mm].children || []).length) toggle(n.dataset.mm); };
    el.onkeydown = e => { const n = e.target.closest && e.target.closest('[data-mm]'); if (n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selected = n.dataset.mm; render(); const again = el.querySelector(`[data-mm="${selected}"]`); again && again.focus(); } };
    render();
    return {
      svgText: () => {
        const css = '<style>.mm-t{font:13px Segoe UI,Arial,sans-serif;fill:#1b2230}.d1 .mm-t{font-weight:600;font-size:14px}.mm-ct{font:600 14px Segoe UI,Arial,sans-serif;fill:#fff}</style><rect width="100%" height="100%" fill="#fff"/>';
        return '<?xml version="1.0" encoding="UTF-8"?>\n' + svg(tree, new Set()).replace(/var\(--surface\)/g, '#fff').replace(/var\(--accent\)/g, '#2447D6').replace(/(<svg [^>]*>)/, '$1' + css);
      }
    };
  }

  window.CVT = window.CVT || {};
  window.CVT.mindmap = { mount };
})();
