/*
 * thinkmap.js — "Thinking maps" in the Solution Atlas tab (ideas taken from FunBlocks: AI mind maps from a topic,
 * a thinking framework or your own material; expand any branch with AI; turn the map into prep, a cheat sheet or slides).
 * Runs on the free AI engine chosen in Settings. Cheat sheet, Markdown, image and slides are made in the browser, no AI.
 * Stored on the application: a.thinkMaps = [{ id, title, frame, from, tree, collapsed, created }], a.thinkSel.
 */
(function () {
  const { html, raw, toast, download, copy, esc } = window.CVT.ui;
  const S = window.CVT.store;
  const A = () => window.CVT.agent;

  const FRAMES = [
    ['map', 'Mind map (explain the topic)'],
    ['brainstorm', 'Brainstorm ideas'],
    ['swot', 'SWOT: me vs this role'],
    ['gap', 'Gap-closing plan'],
    ['questions', 'Interview question map'],
    ['hats', 'Six Thinking Hats'],
    ['whys', '5 Whys (root cause)'],
    ['first', 'First principles']
  ];
  const FROM = [
    ['topic', 'A topic'],
    ['advert', 'The job advert'],
    ['cv', 'My CV and this job'],
    ['docs', 'Files in this job’s Documents tab'],
    ['paste', 'Text I paste'],
    ['file', 'A file (PDF, Word, text)']
  ];
  const NEEDS_CV = ['swot', 'gap'];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();

  /** Keep only well-formed nodes, at most 4 levels, short labels. */
  function tidy(nodes, depth) {
    return (Array.isArray(nodes) ? nodes : []).filter(n => n && clean(n.label)).slice(0, 9).map(n => ({
      label: clean(n.label).slice(0, 80), detail: clean(n.detail).slice(0, 600),
      children: depth < 4 ? tidy(n.children, depth + 1) : []
    }));
  }
  const at = (tree, id) => { const p = String(id).split('.').map(Number); let n = tree.branches[p[0]], path = [tree.center, n && n.label]; for (const i of p.slice(1)) { n = n && n.children[i]; path.push(n && n.label); } return { node: n, path: path.filter(Boolean), depth: p.length }; };
  const parentOf = (tree, id) => { const p = String(id).split('.').map(Number); if (p.length === 1) return { list: tree.branches, i: p[0] }; const up = at(tree, p.slice(0, -1).join('.')).node; return { list: up.children, i: p[p.length - 1] }; };

  function outlineMd(m) {
    const out = [`# ${m.tree.center}`, ''];
    const walk = (n, d) => { out.push(`${'  '.repeat(d)}- **${n.label}**${n.detail ? ': ' + n.detail : ''}`); (n.children || []).forEach(c => walk(c, d + 1)); };
    m.tree.branches.forEach(b => walk(b, 0));
    return out.join('\n');
  }
  function cheatSheet(m, a) {
    const out = [`# Cheat sheet: ${m.tree.center}`, `${a.role || ''}${a.company ? ' · ' + a.company : ''}`, ''];
    m.tree.branches.forEach(b => {
      out.push(`## ${b.label}`); if (b.detail) out.push(b.detail);
      (b.children || []).forEach(c => out.push(`- **${c.label}**${c.detail ? ' — ' + c.detail : ''}${(c.children || []).length ? ' (' + c.children.map(x => x.label).join('; ') + ')' : ''}`));
      out.push('');
    });
    return out.join('\n');
  }
  function slidesHtml(m, a) {
    const slide = (h, body) => `<section><h2>${esc(h)}</h2>${body}</section>`;
    const li = n => `<li><strong>${esc(n.label)}</strong>${n.detail ? `<span> — ${esc(n.detail)}</span>` : ''}${(n.children || []).length ? `<ul>${n.children.map(li).join('')}</ul>` : ''}</li>`;
    const slides = [`<section class="title"><h1>${esc(m.tree.center)}</h1><p>${esc((a.role || '') + (a.company ? ' · ' + a.company : ''))}</p></section>`,
      slide('Overview', `<ul>${m.tree.branches.map(b => `<li>${esc(b.label)}</li>`).join('')}</ul>`)]
      .concat(m.tree.branches.map(b => slide(b.label, (b.detail ? `<p>${esc(b.detail)}</p>` : '') + `<ul>${(b.children || []).map(li).join('')}</ul>`)));
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.tree.center)}</title>
<style>body{margin:0;font:18px/1.5 Segoe UI,Arial,sans-serif;background:#0f172a}section{display:none;box-sizing:border-box;width:100vw;height:100vh;padding:6vh 8vw;background:#fff;color:#1b2230;overflow:auto}section.on{display:block}h1{font-size:2.6em;color:#2447D6;margin-top:28vh}h2{color:#2447D6;border-bottom:3px solid #2447D6;padding-bottom:6px}li{margin:6px 0}li span{color:#475569}ul ul{font-size:.92em}.nav{position:fixed;bottom:12px;right:16px;font:13px Arial;color:#64748b}@media print{section{display:block;page-break-after:always;height:auto;min-height:100vh}.nav{display:none}}</style></head>
<body>${slides.join('\n')}<div class="nav">← → to move · Print to save as PDF</div>
<script>var s=document.querySelectorAll('section'),i=0;function g(n){s[i].classList.remove('on');i=Math.max(0,Math.min(s.length-1,n));s[i].classList.add('on');}s[0].classList.add('on');document.onkeydown=function(e){if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown')g(i+1);if(e.key==='ArrowLeft'||e.key==='PageUp')g(i-1);};document.onclick=function(e){g(e.clientX>innerWidth/2?i+1:i-1);};</script></body></html>`;
  }

  function render(host, a, save, opts = {}) {
    a.thinkMaps = a.thinkMaps || [];
    let from = opts.from || a.thinkFrom || 'topic', frame = a.thinkFrame || 'map', busy = '', out = null, sel = null;
    let fileText = '', fileName = '', mmApi = null, renaming = null, delAsk = null, typed = null;
    const cur = () => a.thinkMaps.find(m => m.id === a.thinkSel) || a.thinkMaps[0] || null;
    const topicNow = () => (typed != null ? typed : clean(a.atlasQ) || a.role || '');

    const draw = () => {
      const m = cur();
      host.innerHTML = String(html`
        <div class="panel-head"><div><h2>🧠 Thinking maps</h2><p class="hint" style="margin:2px 0 0">Build a mind map from a topic, a thinking method or your own material, expand any branch with AI, then turn it into prep. Uses your free AI engine (Settings → AI engine).</p></div></div>
        <div class="tm-build">
          <label class="small">Build from <select id="tm-from">${FROM.map(([k, l]) => html`<option value="${k}" ${k === from ? raw('selected') : ''}>${l}</option>`)}</select></label>
          <label class="small">Method <select id="tm-frame">${FRAMES.map(([k, l]) => html`<option value="${k}" ${k === frame ? raw('selected') : ''}>${l}</option>`)}</select></label>
          ${from === 'topic' ? html`<label class="small tm-grow">Topic <input id="tm-topic" type="text" value="${topicNow()}" placeholder="e.g. SAP Ariba Guided Buying"></label>` : ''}
          <button type="button" class="btn primary small" id="tm-go" ${busy ? raw('disabled') : ''}>${busy === 'build' ? 'Building…' : 'Build map'}</button>
        </div>
        ${from === 'paste' ? html`<textarea id="tm-paste" rows="5" placeholder="Paste notes, a web page, a client brief or a transcript">${a.thinkPaste || ''}</textarea>` : ''}
        ${from === 'file' ? html`<div class="row gap wrap"><input type="file" id="tm-file" accept=".pdf,.docx,.txt,.md,.csv"><span class="muted small">${fileName ? '✓ ' + fileName + ' read' : 'The file is read in your browser; only its text goes to your AI engine.'}</span></div>` : ''}
        ${from === 'docs' ? html`<p class="muted small">${(a.docs || []).filter(d => (d.text || d.note || '').trim()).length} readable file(s) in the Documents tab.</p>` : ''}
        ${NEEDS_CV.includes(frame) ? html`<p class="muted small">This method compares your CV with the advert and only counts experience your CV shows.</p>` : ''}
        ${a.thinkMaps.length ? html`<div class="tm-saved">${a.thinkMaps.map(x => html`<span class="tm-chip${m && x.id === m.id ? ' on' : ''}"><button type="button" class="linkish" data-tm-open="${x.id}">${x.title}</button>${delAsk === x.id ? html`<button type="button" class="linkish danger" data-tm-del-yes="${x.id}">Delete?</button>` : html`<button type="button" class="linkish" data-tm-del="${x.id}" title="Delete this map" aria-label="Delete map ${x.title}">×</button>`}</span>`)}</div>` : ''}
        ${m ? html`
          <div id="tm-map"></div>
          <div class="tm-out row gap wrap">
            <button type="button" class="btn ghost small" data-tm-out="talk" ${busy ? raw('disabled') : ''}>${busy === 'talk' ? 'Writing…' : '🎯 Talking points (STAR)'}</button>
            <button type="button" class="btn ghost small" data-tm-out="cards">🃏 Add drill cards to Prep</button>
            <button type="button" class="btn ghost small" data-tm-out="sheet">📄 Cheat sheet</button>
            <button type="button" class="btn ghost small" data-tm-out="slides">🖥 Slides (.html)</button>
            <button type="button" class="btn ghost small" data-tm-out="md">⬇ Markdown</button>
            <button type="button" class="btn ghost small" data-tm-out="svg">⬇ Image (.svg)</button>
          </div>
          ${out ? html`<div class="tm-result"><div class="row gap"><strong>${out.title}</strong><span class="grow-s"></span><button type="button" class="btn ghost small" data-tm-copy>Copy</button><button type="button" class="btn ghost small" data-tm-save>Download .md</button><button type="button" class="linkish small" data-tm-close>Close</button></div><pre class="tm-pre">${out.text}</pre></div>` : ''}` : html`<p class="muted small">No maps yet. Pick what to build from and a method, then press Build map.</p>`}`);
      if (m) mountMap(m);
    };

    const actions = (n, id) => n && renaming === id ? `<div class="tm-acts"><input type="text" id="tm-rename" value="${esc(n.label)}" maxlength="80" aria-label="New name"><button type="button" class="btn primary small" data-mm-act="rename-save">Save</button><button type="button" class="linkish small" data-mm-act="rename-cancel">Cancel</button></div>` : n ? `<div class="tm-acts"><button type="button" class="btn ghost small" data-mm-act="expand">➕ Expand with AI</button><button type="button" class="btn ghost small" data-mm-act="explain">💡 Explain simply</button><button type="button" class="btn ghost small" data-mm-act="questions">❓ Interview questions</button><button type="button" class="btn ghost small" data-mm-act="atlas" title="Opens Solution Atlas in a new tab">🗺 Official sources ↗</button><button type="button" class="btn ghost small" data-mm-act="rename">✎ Rename</button><button type="button" class="btn ghost small danger" data-mm-act="remove">🗑 Remove</button></div>${busy === 'node' ? '<p class="muted small">Working…</p>' : ''}` : '';
    const mountMap = m => {
      const el = host.querySelector('#tm-map'); if (!el) return;
      mmApi = window.CVT.mindmap.mount(el, JSON.parse(JSON.stringify(m.tree)), {
        collapsed: m.collapsed || [], selected: sel, emptyHint: 'Select a topic to expand it, explain it or get interview questions about it.',
        onChange: c => { m.collapsed = c; save(); },
        extra: (n, id) => { sel = id; return actions(n, id); },
        onAction: (act, n, id) => nodeAction(m, act, id)
      });
    };

    async function material() {
      const job = a.jd || '';
      const needCv = from === 'cv' || NEEDS_CV.includes(frame);
      let cv = '';
      if (needCv) { try { cv = await window.CVT.engine.cvText(a); } catch (_) { cv = ''; } if (!cv) throw new Error('Add your CV to this application first (Fit tab), then try again.'); }
      if (from === 'topic') { const t = clean((host.querySelector('#tm-topic') || {}).value); if (!t) throw new Error('Type a topic first.'); return { topic: t, job, cv }; }
      if (from === 'advert') { if (!job.trim()) throw new Error('This application has no advert text yet (Job tab).'); return { topic: a.role || 'This job', job, cv }; }
      if (from === 'cv') return { topic: (a.role || 'This job') + ': my fit', job, cv };
      if (from === 'docs') { const t = (a.docs || []).filter(d => d.use !== false).map(d => `[${d.name}]\n${d.text || ''}\n${d.note || ''}`).join('\n\n').trim(); if (t.length < 40) throw new Error('No readable files in the Documents tab yet.'); return { topic: '', material: t, job, cv }; }
      if (from === 'paste') { const t = (host.querySelector('#tm-paste') || {}).value || ''; a.thinkPaste = t; if (t.trim().length < 40) throw new Error('Paste some text first (at least a few lines).'); return { topic: '', material: t, job, cv }; }
      if (from === 'file') { if (!fileText) throw new Error('Choose a file first.'); return { topic: fileName, material: fileText, job, cv }; }
      return { topic: topicNow(), job, cv };
    }
    const blocked = t => window.CVT.assistant && window.CVT.assistant.abusive && window.CVT.assistant.abusive(t);
    const needAi = async () => { if (!window.CVT.ai || await window.CVT.ai.ensure()) return true; toast('Choose one of the free AI engines in Settings to use this', 'warn'); return false; };

    async function build() {
      let src; try { src = await material(); } catch (e) { return toast(e.message, 'warn'); }
      if (blocked([src.topic, src.material].join(' '))) return toast('Please keep it professional: that text was not sent.', 'warn');
      if (!(await needAi())) return;
      busy = 'build'; draw();
      try {
        const r = await A().thinkMap({ frame, ...src, job: from === 'docs' || from === 'paste' || from === 'file' ? (src.job || '').slice(0, 3000) : src.job });
        const tree = { center: clean(r.center) || src.topic || 'Map', branches: tidy(r.branches, 1) };
        if (!tree.branches.length) throw new Error('The AI returned an empty map. Try again or pick another engine.');
        const label = (FRAMES.find(f => f[0] === frame) || [, ''])[1].replace(/\s*\(.*\)/, '');
        const m = { id: uid(), title: `${tree.center}`.slice(0, 40) + (frame === 'map' ? '' : ' · ' + label.split(':')[0]), frame, from, tree, collapsed: [], created: new Date().toISOString() };
        a.thinkMaps.unshift(m); a.thinkMaps = a.thinkMaps.slice(0, 12); a.thinkSel = m.id; sel = null; out = null;
        await save(); toast('Map ready');
      } catch (e) { toast(e.message, 'bad'); }
      busy = ''; draw();
    }

    async function nodeAction(m, act, id) {
      const { node, path, depth } = at(m.tree, id); if (!node) return;
      if (act === 'atlas') { a.atlasQ = node.label; await save(); if (opts.onAtlas) opts.onAtlas(node.label); return; }
      if (act === 'rename') { renaming = id; draw(); const i = host.querySelector('#tm-rename'); if (i) { i.focus(); i.select(); } return; }
      if (act === 'rename-cancel') { renaming = null; return draw(); }
      if (act === 'rename-save') { const v = clean((host.querySelector('#tm-rename') || {}).value); if (!v) return; if (blocked(v)) return toast('Please keep it professional.', 'warn'); node.label = v.slice(0, 80); renaming = null; await save(); draw(); return; }
      if (act === 'remove') { const p = parentOf(m.tree, id); if (m.tree.branches.length === 1 && depth === 1) return toast('A map needs at least one branch.', 'warn'); p.list.splice(p.i, 1); sel = null; m.collapsed = []; await save(); draw(); return; }
      if (depth >= 4 && act !== 'explain') return toast('This is as deep as the map goes. Expand a higher topic instead.', 'warn');
      if (!(await needAi())) return;
      busy = 'node'; draw();
      try {
        const r = await A().thinkExpand({ path: path.slice(0, -1), node, how: act, job: a.jd || '' });
        if (act === 'explain' && clean(r.explain)) node.detail = clean(r.explain).slice(0, 600);
        const kids = depth < 4 ? tidy(r.children, depth + 1).map(k => ({ ...k, children: [] })) : [];
        const have = new Set((node.children || []).map(c => c.label.toLowerCase()));
        node.children = (node.children || []).concat(kids.filter(k => !have.has(k.label.toLowerCase()))).slice(0, 12);
        m.collapsed = (m.collapsed || []).filter(c => c !== id);
        await save(); toast(act === 'explain' ? 'Explained' : `${kids.length} added`);
      } catch (e) { toast(e.message, 'bad'); }
      busy = ''; draw();
    }

    async function output(kind) {
      const m = cur(); if (!m) return;
      const name = `${(m.tree.center || 'map').replace(/[^\w-]+/g, '_').slice(0, 40)}`;
      if (kind === 'md') return download(new Blob([outlineMd(m)], { type: 'text/markdown' }), name + '.md');
      if (kind === 'svg') return mmApi && download(new Blob([mmApi.svgText()], { type: 'image/svg+xml' }), name + '.svg');
      if (kind === 'slides') return download(new Blob([slidesHtml(m, a)], { type: 'text/html' }), name + '_slides.html');
      if (kind === 'sheet') { out = { title: 'Cheat sheet', text: cheatSheet(m, a) }; return draw(); }
      if (kind === 'cards') {
        const cards = [];
        const walk = n => { if (n.detail && n.label) cards.push({ q: /\?$/.test(n.label) ? n.label : `Explain "${n.label}" in the context of ${m.tree.center}.`, a: n.detail }); (n.children || []).forEach(walk); };
        m.tree.branches.forEach(walk);
        if (!cards.length) return toast('Explain a few topics first so the cards have answers.', 'warn');
        const d = Object.assign({ p: {}, custom: [] }, (await S.getKV('drills', null)) || {});
        const seen = new Set((d.custom || []).map(c => c.q.toLowerCase()));
        const add = cards.filter(c => !seen.has(c.q.toLowerCase())).slice(0, 30).map(c => ({ id: 'c' + uid(), deck: 'custom', q: c.q, a: c.a, topic: m.tree.center }));
        d.custom = (d.custom || []).concat(add); await S.setKV('drills', d);
        return toast(add.length ? `${add.length} cards added to Prep → Drill cards → My cards` : 'Those cards are already in Prep');
      }
      if (kind === 'talk') {
        if (!(await needAi())) return;
        busy = 'talk'; draw();
        try {
          let cv = ''; try { cv = await window.CVT.engine.cvText(a); } catch (_) {}
          const r = await A().thinkTalk({ outline: outlineMd(m), job: a.jd || '', cv });
          out = { title: 'Talking points', text: String(r.text || '').trim() || '(no text returned)' };
          m.talk = out.text; await save();
        } catch (e) { toast(e.message, 'bad'); }
        busy = ''; draw();
      }
    }

    host.addEventListener('change', async e => {
      if (e.target.id === 'tm-from') { from = e.target.value; a.thinkFrom = from; save(); draw(); }
      else if (e.target.id === 'tm-frame') { frame = e.target.value; a.thinkFrame = frame; save(); draw(); }
      else if (e.target.id === 'tm-file') {
        const f = e.target.files && e.target.files[0]; if (!f) return;
        try {
          const D = window.CVT.docs, kind = D.kindOf(f);
          if (!['pdf', 'word', 'text'].includes(kind) && !/\.(txt|md|csv)$/i.test(f.name)) throw new Error('Use a PDF, Word (.docx) or text file.');
          const r = await D.extract({ kind: kind === 'pdf' || kind === 'word' ? kind : 'text', name: f.name }, f);
          fileText = (r.text || '').trim(); fileName = f.name;
          if (fileText.length < 40) throw new Error('No readable text found in that file.');
        } catch (err) { fileText = ''; fileName = ''; toast(err.message, 'bad'); }
        draw();
      }
    });
    host.addEventListener('input', e => { if (e.target.id === 'tm-topic') typed = e.target.value; if (e.target.id === 'tm-paste') a.thinkPaste = e.target.value; });
    host.addEventListener('keydown', e => { if (e.target.id === 'tm-rename' && e.key === 'Enter') { e.preventDefault(); host.querySelector('[data-mm-act="rename-save"]').click(); } if (e.target.id === 'tm-topic' && e.key === 'Enter') { e.preventDefault(); build(); } });
    host.addEventListener('click', async e => {
      if (!e.target.closest('[data-tm-del]') && !e.target.closest('[data-tm-del-yes]') && delAsk) { delAsk = null; }
      if (e.target.closest('#tm-go')) return build();
      const o = e.target.closest('[data-tm-open]'); if (o) { a.thinkSel = o.dataset.tmOpen; sel = null; out = null; save(); return draw(); }
      const d = e.target.closest('[data-tm-del]'); if (d) { delAsk = d.dataset.tmDel; return draw(); }
      const dy = e.target.closest('[data-tm-del-yes]'); if (dy) { const id = dy.dataset.tmDelYes; a.thinkMaps = a.thinkMaps.filter(m => m.id !== id); if (a.thinkSel === id) a.thinkSel = null; delAsk = null; out = null; await save(); return draw(); }
      const k = e.target.closest('[data-tm-out]'); if (k) return output(k.dataset.tmOut);
      if (e.target.closest('[data-tm-copy]') && out) return copy(out.text, e.target);
      if (e.target.closest('[data-tm-save]') && out) return download(new Blob([out.text], { type: 'text/markdown' }), out.title.replace(/\s+/g, '_') + '.md');
      if (e.target.closest('[data-tm-close]')) { out = null; draw(); }
    });
    draw();
    return { refresh: () => { typed = null; draw(); }, buildTopic: q => { from = 'topic'; frame = 'map'; typed = q; draw(); host.scrollIntoView({ behavior: 'smooth', block: 'start' }); build(); } };
  }

  window.CVT = window.CVT || {};
  window.CVT.thinkmap = { render, tidy, outlineMd, cheatSheet, slidesHtml };
})();
