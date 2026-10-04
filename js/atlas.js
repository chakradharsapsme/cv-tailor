/*
 * atlas.js — "Solution Atlas" tab of every application: mind maps from official sources (SAP Help Portal,
 * SAP Learning, SAP Community, Wikipedia…) for the technologies and requirements this job asks for.
 * It shows N's own Solution Atlas app (free, no AI) inside Applywise, opened on the term you pick.
 * Pick a chip, or come here from the 🗺 button on any row of the Fit tab's "Job vs your CV" map.
 */
(function () {
  const { html, raw } = window.CVT.ui;
  const S = window.CVT.store;
  const BASE = () => (S.local.get('cvt.atlasUrl', '') || 'https://solution-atlas.onrender.com/').replace(/\/?$/, '/');
  const link = (q, mode, embed) => `${BASE()}?q=${encodeURIComponent(q)}&mode=${mode === 'general' ? 'general' : 'sap'}${embed ? '&embed=1' : ''}`;

  /** Short map-able terms for this job: the advert's technologies first, then ATS keywords and skills. */
  function terms(a) {
    const an = a.analysis && !a.analysis.legacy ? a.analysis : null;
    const out = [], seen = new Set();
    const add = t => { t = String(t || '').replace(/\s+/g, ' ').trim(); const k = t.toLowerCase(); if (t.length < 2 || t.length > 40 || seen.has(k)) return; seen.add(k); out.push(t); };
    if (an) { (an.job_technologies || []).forEach(add); (an.keywords || []).forEach(add); }
    try { window.CVT.jobs.termsIn((a.role || '') + '\n' + (a.jd || '')).forEach(add); } catch (_) {}
    return out.slice(0, 18);
  }

  /** Turn a long requirement or duty into something worth mapping: a technology it names, or its first words. */
  function termFor(text, a) {
    const t = String(text || '').trim();
    if (t.length <= 40) return t;
    const hit = terms(a).filter(x => new RegExp('\\b' + x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(t)).sort((x, y) => y.length - x.length)[0];
    return hit || t.split(/\s+/).slice(0, 6).join(' ').replace(/[,;:.]+$/, '');
  }

  function render(host, a, save, onPick, onThink) {
    const list = terms(a);
    let q = a.atlasQ || list[0] || a.role || '';
    let mode = a.atlasMode || 'sap';
    // Some hosts (the Claude artifact link, strict company browsers) refuse to show other sites inside a page.
    let blocked = !!(window.claude && window.claude.use);
    const fallback = () => html`<div class="atl-blocked"><strong>The map can't be shown inside this page here.</strong>
      <p class="small">This copy of Applywise runs inside a page that doesn't allow other websites to be embedded. Open the map in its own tab, or build an AI thinking map of the same topic right here.</p>
      <div class="row gap wrap"><a class="btn primary small" href="${link(q, mode, false)}" target="_blank" rel="noopener">Open “${q}” in Solution Atlas ↗</a><button type="button" class="btn ghost small" data-atl-think>🧠 Build a thinking map of “${q}”</button></div>
      <p class="muted small">The embedded map works on chakradharsapsme.github.io/cv-tailor and applywise-1bt.pages.dev.</p></div>`;
    const draw = () => {
      host.innerHTML = String(html`
        <div class="panel-head"><div><h2>🗺 Solution Atlas</h2><p class="hint" style="margin:2px 0 0">Mind maps from official sources for what this job asks for, with a glossary and source list. Pick a topic, or press 🗺 on any row of the Fit tab. Build your own AI thinking maps below.</p></div>
          <div class="row gap"><a class="btn ghost small" href="#tm-app" data-atl-jump>🧠 Thinking maps ↓</a><a class="btn ghost small" href="${link(q, mode, false)}" target="_blank" rel="noopener">Open in a new tab ↗</a></div></div>
        ${list.length ? html`<div class="atl-chips">${list.map(t => html`<button type="button" class="chip-btn${t.toLowerCase() === q.toLowerCase() ? ' on' : ''}" data-atl="${t}">${t}</button>`)}</div>` : html`<p class="muted small">Paste the advert and analyse the job to get its technologies here.</p>`}
        <div class="row gap wrap atl-bar"><label class="small">Source <select id="atl-mode" aria-label="Where to gather from"><option value="sap" ${mode === 'sap' ? raw('selected') : ''}>Knowledge repository (official SAP)</option><option value="general" ${mode === 'general' ? raw('selected') : ''}>General (Wikipedia)</option></select></label><span class="muted small">You can also type any other topic in the map's own search box below.</span></div>
        <p class="muted small">Runs on your free Solution Atlas server: if it has been idle, the first map can take up to a minute while it wakes up.</p>
        ${q && blocked ? fallback() : ''}
        ${q && !blocked ? html`<div class="atl-frame"><iframe title="Solution Atlas: ${q}" src="${link(q, mode, true)}" loading="lazy" referrerpolicy="no-referrer"></iframe></div>` : ''}`);
    };
    draw();
    const set = async (nq, nm) => { q = nq; if (nm) mode = nm; a.atlasQ = q; a.atlasMode = mode; await save(); draw(); if (onPick) onPick(q); };
    // A refused frame reports a security-policy violation on this page: swap the empty frame for the fallback.
    const onViolation = e => { if (blocked || !/frame-src|child-src|default-src/.test(e.effectiveDirective || e.violatedDirective || '') || !String(e.blockedURI || '').startsWith(BASE().replace(/\/$/, ''))) return; blocked = true; if (host.isConnected) draw(); else document.removeEventListener('securitypolicyviolation', onViolation); };
    document.addEventListener('securitypolicyviolation', onViolation);
    host.addEventListener('click', e => { if (e.target.closest('[data-atl-think]')) { if (onThink) onThink(q); return; } const j = e.target.closest('[data-atl-jump]'); if (j) { e.preventDefault(); const t = document.getElementById('tm-app'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; } const b = e.target.closest('[data-atl]'); if (b) set(b.dataset.atl); });
    host.addEventListener('change', e => { if (e.target.id === 'atl-mode') set(q, e.target.value); });
    return { show: nq => { q = nq; draw(); host.scrollIntoView({ behavior: 'smooth', block: 'start' }); } };
  }

  window.CVT = window.CVT || {};
  window.CVT.atlas = { render, terms, termFor, link };
})();
