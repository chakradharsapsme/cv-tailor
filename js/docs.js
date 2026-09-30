/*
 * docs.js — the Documents tab of an application.
 * Upload PDFs, Word files, images, video, audio or notes for one job. Files stay on this device
 * (any size the browser allows); inside claude.ai, files up to 20 MB are also copied to your Claude
 * account so your other devices can open them. The readable text is pulled out once and kept on the
 * application, then used to prepare likely interview questions and to answer your questions.
 */
(function () {
  const { html, raw, $, $$, toast, copy } = window.CVT.ui;
  const S = window.CVT.store, A = window.CVT.agent;

  const SYNC_MAX = 20 * 1024 * 1024;
  const SYNC_TYPES = /^(image\/(png|jpeg|gif|webp)|video\/(mp4|webm)|application\/pdf)$/;
  const TEXT_CAP = 25000;
  const inClaude = () => !!(window.claude && window.claude.use);
  const uid = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const size = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';

  function kindOf(f) {
    const t = f.type || '', n = (f.name || '').toLowerCase();
    if (t === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
    if (t.startsWith('image/')) return 'image';
    if (t.startsWith('video/')) return 'video';
    if (t.startsWith('audio/')) return 'audio';
    if (n.endsWith('.docx')) return 'word';
    if (/\.(pptx|xlsx)$/.test(n)) return 'office';
    if (t.startsWith('text/') || /\.(txt|md|csv|srt|vtt|json|log)$/.test(n)) return 'text';
    return 'other';
  }
  const ICON = { pdf: 'PDF', image: 'IMG', video: 'VID', audio: 'AUD', word: 'DOC', office: 'OFF', text: 'TXT', other: 'FILE' };

  // ---------------------------------------------------------------------
  // Text extraction (all in the browser)
  // ---------------------------------------------------------------------
  let pdfjsP = null;
  function pdfjs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfjsP) {
      const load = src => new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('Could not load the PDF reader.')); document.head.appendChild(s); });
      const base = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
      // The worker script is loaded on the page as well, so pdf.js runs it in the main thread.
      pdfjsP = load(base + 'pdf.min.js').then(() => load(base + 'pdf.worker.min.js')).then(() => window.pdfjsLib);
    }
    return pdfjsP;
  }
  async function pdfText(blob, onStep) {
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
    const out = []; let chars = 0;
    for (let i = 1; i <= doc.numPages && chars < TEXT_CAP; i++) {
      onStep && onStep(`Reading page ${i} of ${doc.numPages}`);
      const tc = await (await doc.getPage(i)).getTextContent();
      const t = tc.items.map(x => x.str + (x.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+/g, ' ').trim();
      if (t) { out.push(`[Page ${i}]\n${t}`); chars += t.length; }
    }
    return { text: out.join('\n\n'), pages: doc.numPages, doc };
  }
  async function pdfPageImages(doc, max) {
    const blobs = [];
    for (let i = 1; i <= Math.min(doc.numPages, max); i++) {
      const page = await doc.getPage(i); const vp = page.getViewport({ scale: 1.5 });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      blobs.push(await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85)));
    }
    return blobs;
  }
  async function docxText(blob) {
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const f = zip.file('word/document.xml'); if (!f) return '';
    const xml = await f.async('string');
    return xml.replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
  }
  async function videoFrames(blob, count) {
    const url = URL.createObjectURL(blob);
    try {
      const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = url;
      await new Promise((ok, bad) => { v.onloadedmetadata = ok; v.onerror = () => bad(new Error('This video format cannot be read in the browser.')); });
      const dur = v.duration || 0; if (!dur || !isFinite(dur)) return [];
      const w = Math.min(1280, v.videoWidth || 1280), h = Math.round(w * (v.videoHeight || 720) / (v.videoWidth || 1280));
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      const out = [];
      for (let i = 0; i < count; i++) {
        v.currentTime = dur * (i + 0.5) / count;
        await new Promise(ok => { v.onseeked = ok; });
        g.drawImage(v, 0, 0, w, h);
        out.push(await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8)));
      }
      return out;
    } finally { URL.revokeObjectURL(url); }
  }
  async function imageLimits() {
    try { const s = await A.claudeSample(); return s ? (await s.limits()).images || null : null; } catch (_) { return null; }
  }

  /** Pull readable text out of one file. Returns { text, status }. */
  async function extract(d, blob, onStep) {
    const k = d.kind;
    if (k === 'text') return { text: (await blob.text()).slice(0, TEXT_CAP), status: 'ready' };
    if (k === 'word') return { text: (await docxText(blob)).slice(0, TEXT_CAP), status: 'ready' };
    if (k === 'pdf') {
      const r = await pdfText(blob, onStep);
      if (r.text.replace(/\[Page \d+\]/g, '').trim().length > 200) return { text: r.text.slice(0, TEXT_CAP), status: 'ready', pages: r.pages };
      // Scanned PDF: let Claude read the first pages as images.
      const lim = await imageLimits();
      if (!lim) return { text: '', status: 'notes', why: 'This PDF is scanned (no text layer). Add notes, or open Applywise in claude.ai to read it.' };
      onStep && onStep('Scanned PDF: asking Claude to read the pages');
      const imgs = await pdfPageImages(r.doc, lim.maxCount);
      return { text: (await A.describeImages({ blobs: imgs, name: d.name, kind: 'pdf' })).slice(0, TEXT_CAP), status: 'ready', pages: r.pages };
    }
    if (k === 'image') {
      const lim = await imageLimits();
      if (!lim) return { text: '', status: 'notes', why: 'Image reading needs Applywise opened in claude.ai. Add notes describing it instead.' };
      onStep && onStep('Asking Claude to read the image');
      return { text: await A.describeImages({ blobs: [blob], name: d.name, kind: 'image' }), status: 'ready' };
    }
    if (k === 'video') {
      const lim = await imageLimits();
      if (!lim) return { text: '', status: 'notes', why: 'This video can’t be read here (speech can’t be transcribed, and slide reading isn’t available in this view). Paste a transcript or notes below, or upload the transcript file: Teams, Zoom and YouTube can export one (.vtt or .txt).' };
      onStep && onStep('Taking frames from the video');
      const frames = await videoFrames(blob, Math.min(lim.maxCount, 8));
      if (!frames.length) return { text: '', status: 'notes', why: 'Could not read frames from this video. Paste a transcript or notes below.' };
      onStep && onStep('Asking Claude to read the slides and screens');
      return { text: await A.describeImages({ blobs: frames, name: d.name, kind: 'video' }), status: 'ready', why: 'Slides and on-screen text were read from frames. Speech is not transcribed: paste a transcript below for the best questions.' };
    }
    if (k === 'audio') return { text: '', status: 'notes', why: 'Audio can’t be transcribed here. Paste a transcript or your notes below, or upload a transcript file (.vtt or .txt).' };
    return { text: '', status: 'notes', why: 'This file type can’t be read. Add notes describing what matters in it.' };
  }

  // ---------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------
  async function assets() { try { return inClaude() ? await window.claude.use('assets') : null; } catch (_) { return null; } }
  async function blobOf(d) {
    const local = await S.getFile(d.id);
    if (local) return local;
    if (d.assetId) { const r = await fetch('/_blob/' + d.assetId); if (r.ok) return r.blob(); }
    return null;
  }

  // ---------------------------------------------------------------------
  // View
  // ---------------------------------------------------------------------
  // ---------------------------------------------------------------------
  // Grounding: numbered passages in, every mind-map node must quote one
  // ---------------------------------------------------------------------
  const PASSAGE = 700, BUDGET = 42000;
  function passagesOf(docs) {
    const all = [];
    docs.forEach((d, i) => {
      const body = [(d.text || '').trim(), (d.note || '').trim() ? 'Notes: ' + d.note.trim() : ''].filter(Boolean).join('\n\n');
      const parts = []; let cur = '';
      body.split(/(?<=[.!?])\s+|\n{2,}/).forEach(seg => {
        if ((cur + ' ' + seg).length > PASSAGE && cur) { parts.push(cur.trim()); cur = seg; } else cur = cur ? cur + ' ' + seg : seg;
      });
      if (cur.trim()) parts.push(cur.trim());
      parts.forEach((t, j) => all.push({ id: `D${i + 1}-P${j + 1}`, doc: d.name, text: t }));
    });
    const total = all.reduce((n, x) => n + x.text.length, 0);
    if (total <= BUDGET) return { passages: all, coverage: 100 };
    // Too long for one request: keep an even spread from every document.
    const keep = Math.max(1, Math.floor(all.length * BUDGET / total));
    const step = all.length / keep, picked = [];
    for (let k = 0; k < keep; k++) picked.push(all[Math.floor(k * step)]);
    return { passages: picked, coverage: Math.round(100 * picked.reduce((n, x) => n + x.text.length, 0) / total) };
  }
  const norm = t => String(t || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9%£$.' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  function found(quote, text) {
    const q = norm(quote), t = norm(text);
    if (!q || q.split(' ').length < 3) return false;
    if (t.includes(q)) return true;
    const w = q.split(' '), grams = new Set(); const tw = t.split(' ');
    for (let i = 0; i + 3 <= tw.length; i++) grams.add(tw.slice(i, i + 3).join(' '));
    let hit = 0, n = 0;
    for (let i = 0; i + 3 <= w.length; i++) { n++; if (grams.has(w.slice(i, i + 3).join(' '))) hit++; }
    return n > 0 && hit / n >= 0.8;
  }
  /** Keep only nodes whose quote is really in the cited passage (or elsewhere in that document). */
  function verifyTree(raw, passages, docs) {
    const byId = new Map(passages.map(p => [p.id, p]));
    const docText = new Map(docs.map(d => [d.name, (d.text || '') + '\n' + (d.note || '')]));
    let removed = 0, kept = 0;
    const check = n => {
      const p = byId.get(String(n.ref || '').trim());
      const ok = !!(n.quote && ((p && found(n.quote, p.text)) || [...docText.values()].some(t => found(n.quote, t))));
      const src = p ? p.doc : ([...docText.entries()].find(([, t]) => found(n.quote, t)) || [])[0];
      const kids = (n.children || []).map(check).filter(Boolean);
      if (ok) { kept++; return { label: n.label, detail: n.detail, quote: n.quote, ref: p ? p.id : '', source: src || 'your documents', children: kids }; }
      removed++;
      return kids.length ? { label: n.label, detail: 'Heading grouping the topics below (not quoted directly).', grouping: true, source: 'your documents', children: kids } : null;
    };
    const branches = (raw.branches || []).map(check).filter(Boolean);
    return { tree: { center: raw.center || 'Your documents', branches }, removed, kept };
  }

  /** Keep only questions whose quote is really in the uploaded documents; record where it came from. */
  function verifyQuestions(list, passages, docs) {
    const byId = new Map(passages.map(p => [p.id, p]));
    const docText = docs.map(d => [d.name, (d.text || '') + '\n' + (d.note || '')]);
    let removed = 0;
    const items = (list || []).filter(q => q && q.q).map(q => {
      const p = byId.get(String(q.ref || '').trim());
      const inP = !!(q.quote && p && found(q.quote, p.text));
      const hit = inP ? [p.doc] : (q.quote ? docText.find(([, t]) => found(q.quote, t)) : null);
      if (!hit) { removed++; return null; }
      return Object.assign({}, q, { source: hit[0], ref: inP ? p.id : '' });
    }).filter(Boolean);
    return { items, removed };
  }

  async function tab(ctx) {
    const { a, body, profile } = ctx;
    a.docs = a.docs || [];
    const stories = await S.getKV('stories', []) || [];
    const statusText = d => d.status === 'reading' ? 'Reading…' : d.status === 'ready' ? `Ready · ${(d.text || '').length.toLocaleString('en-GB')} characters${d.pages ? ' · ' + d.pages + ' pages' : ''}` : d.status === 'error' ? 'Could not read' : (d.note || '').trim() ? 'Using your notes' : 'Needs notes';
    const readable = () => a.docs.filter(d => d.use !== false && (((d.text || '').trim()) || (d.note || '').trim()));
    const dqHint = () => {
      const n = readable().length, waiting = a.docs.filter(d => d.use !== false && !hasContent(d));
      const skip = waiting.length ? ` ${waiting.length} file${waiting.length > 1 ? 's have' : ' has'} no readable text yet and will be skipped${waiting.some(d => d.kind === 'video' || d.kind === 'audio') ? ' (add a transcript or notes to a video to include it)' : ''}.` : '';
      if (n) return `Questions come only from your ${n} document${n === 1 ? '' : 's'}, never from the job advert. Each one quotes the words it came from, checked against your files. Answer outlines use only your real experience.${skip}`;
      return a.docs.length ? `None of your files has readable text yet.${skip} Add notes or a transcript to a file, then prepare questions.` : 'Upload the documents for this job (role pack, client deck, case study, notes). Questions are drawn only from them.';
    };

    const groups = items => { const m = new Map(); items.forEach(q => { const k = q.source || 'Your documents'; if (!m.has(k)) m.set(k, []); m.get(k).push(q); }); return [...m.entries()]; };
    const TYPE = { functional: 'Functional', ba: 'Business analysis', behavioural: 'Behavioural', motivation: 'Motivation', case: 'Case study' };
    const pnum = ref => (String(ref || '').split('-')[1] || '').replace('P', '');
    /** One question card. del = data attribute for its delete button. */
    const qCard = (q, n, del) => html`<li class="dq"><details>
      <summary><span class="dq-n">${n}</span><span class="dq-body"><span class="dq-q">${q.q}</span><span class="dq-meta"><span class="chip muted">${TYPE[q.type] || q.type || 'Question'}</span>${q.ref ? html`<span>passage ${pnum(q.ref)}</span>` : ''}</span></span>${raw(`<button class="q-del" ${del} type="button" title="Delete this question" aria-label="Delete question">🗑</button>`)}</summary>
      <div class="dq-more">
        ${q.quote ? html`<blockquote class="mm-quote">“${q.quote}”</blockquote><p class="small ok-text">✓ Found in ${q.source || d0(q)}${q.ref ? ', passage ' + pnum(q.ref) : ''}</p>` : ''}
        ${q.why ? html`<p class="small"><strong>What it tests:</strong> ${q.why}</p>` : ''}
        ${(q.answer_outline || []).length ? html`<p class="small"><strong>How to answer</strong></p><ul class="tight small">${q.answer_outline.map(x => html`<li>${x}</li>`)}</ul>` : ''}
        ${q.story_hint && stories.find(s => s.id === q.story_hint) ? html`<p class="small">Story to use: <strong>${stories.find(s => s.id === q.story_hint).title}</strong></p>` : ''}
      </div></details></li>`;
    const d0 = () => 'your document';
    const mapSig = () => readable().map(d => d.id + ':' + sigOf(d)).join('|');
    let mmApi = null;
    const mountMap = () => { const root = $('#mm-root', body); if (!root || !a.docMap) return; mmApi = window.CVT.mindmap.mount(root, JSON.parse(JSON.stringify(a.docMap.tree)), { collapsed: a.docMap.collapsed || [], onChange: c => { a.docMap.collapsed = c; ctx.saveSoon ? ctx.saveSoon() : save(); } }); };
    const sigOf = d => (d.text || '').length + ':' + (d.note || '').trim().length;
    const hasContent = d => !!(((d.text || '').trim()) || (d.note || '').trim());
    const checking = new Set();
    const checkBlock = d => {
      if (checking.has(d.id)) return html`<div class="doc-check busy"><span class="spinner" aria-hidden="true"></span> Checking what Applywise understood and drawing questions from this file…</div>`;
      if (!hasContent(d)) return d.status === 'reading' ? '' : html`<div class="doc-check warn"><strong>Not read yet.</strong> Nothing in this file could be read, so it isn't used for questions. Add notes or a transcript above, then press <em>Check reading</em>.<div class="mt-s"><button class="btn ghost small" data-digest="${d.id}" type="button" disabled>Check reading</button></div></div>`;
      const g = d.digest;
      if (!g) return html`<div class="doc-check"><button class="btn ghost small" data-digest="${d.id}" type="button">Check reading &amp; get questions</button> <span class="muted small">See a summary and the facts Applywise found, so you can confirm it read this file.</span></div>`;
      const stale = g.sig !== sigOf(d);
      return html`<div class="doc-check ok">
        <div class="row gap wrap"><strong>✓ Read and understood</strong>${g.relevance ? html`<span class="chip ${/^high/i.test(g.relevance) ? 'ok' : /^low/i.test(g.relevance) ? 'bad' : 'muted'}" title="${g.relevance}">Relevance to this job: ${g.relevance.split(':')[0]}</span>` : ''}${stale ? html`<span class="chip warn">Notes changed since check</span>` : ''}<button class="linkish small" data-digest="${d.id}" type="button">Check again</button></div>
        <p class="small mt-s">${g.summary}</p>
        ${(g.facts || []).length ? html`<p class="small muted mt-s">Facts it found (check these against your file):</p><ul class="tight small">${g.facts.map(f => html`<li>${f}</li>`)}</ul>` : ''}
        ${(g.questions || []).length ? html`<p class="small mt-s"><strong>Questions from this file</strong></p><ol class="dq-list compact">${g.questions.map((q, qi) => qCard(Object.assign({ source: d.name }, q), qi + 1, `data-gqdel="${d.id}:${qi}"`))}</ol>` : ''}
      </div>`;
    };
    async function digest(d) {
      if (checking.has(d.id) || !hasContent(d)) return;
      checking.add(d.id); draw();
      try {
        const r = await A.docDigest({ app: a, profile, stories, doc: d });
        d.digest = { at: new Date().toISOString(), sig: sigOf(d), summary: r.summary || '', facts: (r.facts || []).slice(0, 8), relevance: r.relevance || '', questions: verifyQuestions(r.questions, [], [d]).items.map(q => Object.assign(q, { ref: '' })).slice(0, 6) };
      } catch (e) { toast(`${d.name}: ${e.message}`, 'bad'); }
      checking.delete(d.id); await save(); draw();
    }
    const draw = () => { drawBase(); mountMap(); };
    const drawBase = () => {
      body.innerHTML = String(html`
        <div class="docs-grid">
          <section class="panel">
            <div class="panel-head"><h2>Documents for this job</h2><span class="muted small">${a.docs.length} file${a.docs.length === 1 ? '' : 's'}</span></div>
            <p class="hint">Add anything that helps you prepare: the role pack, a client case study, company slides, a recorded briefing, screenshots or your own notes. PDF, Word, images, video, audio and text files. Large files are fine.</p>
            <label class="dropzone" id="dz">
              <input type="file" id="dz-in" multiple hidden accept=".pdf,.docx,.txt,.md,.csv,.srt,.vtt,image/*,video/*,audio/*">
              <strong>Drop files here or click to choose</strong>
              <span class="muted small">Kept on this device. ${inClaude() ? 'PDFs, images and videos up to 20 MB also sync to your other devices.' : ''}</span>
            </label>
            <div class="doc-list">${a.docs.map(d => html`
              <article class="doc ${d.use === false ? 'off' : ''}" data-id="${d.id}">
                <span class="doc-ico k-${d.kind}">${ICON[d.kind] || 'FILE'}</span>
                <div class="doc-main">
                  <div class="doc-name">${d.name}</div>
                  <div class="muted small">${size(d.size)} · ${d.assetId ? 'synced' : 'this device only'} · <span class="${d.status === 'ready' || (d.note || '').trim() ? 'ok-text' : d.status === 'reading' ? '' : 'warn-text'}">${statusText(d)}</span></div>
                  ${d.why ? html`<p class="small muted mt-s">${d.why}</p>` : ''}
                  <details ${(d.status === 'notes' && !(d.note || '').trim()) ? raw('open') : ''}><summary class="small">${(d.note || '').trim() ? 'Your notes' : 'Add notes or a transcript'}</summary>
                    <textarea class="doc-note" data-note="${d.id}" rows="4" placeholder="What matters in this file: key points, names, numbers, or paste a transcript.">${d.note || ''}</textarea></details>
                  ${d.text ? html`<details><summary class="small">Raw text Applywise extracted</summary><div class="pre small doc-text">${d.text.slice(0, 3000)}${d.text.length > 3000 ? '…' : ''}</div></details>` : ''}
                  ${checkBlock(d)}
                </div>
                <div class="doc-actions">
                  <label class="check-line small"><input type="checkbox" data-use="${d.id}" ${d.use !== false ? raw('checked') : ''}> Use</label>
                  <button class="btn ghost small" data-open="${d.id}" type="button">Open</button>
                  ${d.status === 'error' || d.status === 'notes' ? html`<button class="btn ghost small" data-retry="${d.id}" type="button">Read again</button>` : ''}
                  <button class="btn ghost small danger" data-del="${d.id}" data-label="Delete" type="button" title="Delete this file and what was read from it" aria-label="Delete ${d.name}">🗑 Delete</button>
                </div>
              </article>`)}</div>
            ${a.docs.length ? '' : html`<p class="empty-note">No documents yet.</p>`}
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Likely interview questions</h2>${a.docQuestions ? html`<div class="row gap"><button class="btn ghost small" id="dq-copy" type="button">Copy all</button><button class="btn ghost small danger" id="dq-clear" data-label="Delete all" type="button" title="Delete all these questions">🗑 Delete all</button></div>` : ''}</div>
            <p class="hint" id="dq-hint">${dqHint()}</p>
            ${a.docQuestions && !a.docQuestions.grounded ? html`<p class="small"><span class="chip warn">These were made before document-only mode and may include advert questions. Press Prepare again.</span></p>` : ''}
            <button class="btn primary" id="dq-go" type="button" ${readable().length ? '' : raw('disabled')}>${a.docQuestions ? 'Prepare again' : 'Prepare questions'}</button>
            ${a.docQuestions ? html`
              ${a.docQuestions.grounded ? html`<p class="small muted mt-s">${a.docQuestions.items.length} question${a.docQuestions.items.length === 1 ? '' : 's'} from ${a.docQuestions.from}${a.docQuestions.coverage < 100 ? ` (${a.docQuestions.coverage}% of the text read)` : ''}${a.docQuestions.removed ? html` · <strong>${a.docQuestions.removed} dropped</strong> because their quote wasn't in your files` : ''}${a.docQuestions.sig !== mapSig() ? html` · <span class="chip warn">Documents changed since. Prepare again to include them</span>` : ''}</p>` : ''}
              ${(a.docQuestions.themes || []).length ? html`<p class="small mt-s dq-themes">Themes: ${a.docQuestions.themes.map(t => html`<span class="chip accent">${t}</span> `)}</p>` : ''}
              ${(() => { let n = 0; return groups(a.docQuestions.items).map(([src, items]) => html`<h3 class="h-sub mt">From ${src} <span class="muted">· ${items.length}</span></h3><ol class="dq-list">${items.map(q => qCard(q, ++n, `data-qdel="${a.docQuestions.items.indexOf(q)}"`))}</ol>`); })()}` : ''}
          </section>

          <section class="panel docs-map">
            <div class="panel-head"><h2>Mind map of your documents</h2>
              <div class="row gap wrap">${a.docMap ? html`<button class="btn ghost small" id="mm-dl" type="button">Download (SVG)</button><button class="btn ghost small danger" id="mm-del" data-label="Delete map" type="button">🗑 Delete map</button>` : ''}<button class="btn ${a.docMap ? 'ghost' : 'primary'} small" id="mm-go" type="button" ${readable().length ? '' : raw('disabled')}>${a.docMap ? 'Rebuild' : 'Build mind map'}</button></div></div>
            <p class="hint">${a.docMap && a.docMap.grounded ? html`Built only from your ${a.docMap.from} (${a.docMap.passages} passages${a.docMap.coverage < 100 ? `, ${a.docMap.coverage}% of the text` : ''}) on ${new Date(a.docMap.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}. Every topic quotes the passage it came from: ${a.docMap.kept} checked against your files${a.docMap.removed ? html`, <strong>${a.docMap.removed} removed</strong> because the quote wasn't found` : ''}.${a.docMap.sig !== mapSig() ? html` <span class="chip warn">Documents changed since. Rebuild to include them</span>` : ''}` : a.docMap ? html`<span class="chip warn">This map was built before document-only mode. Rebuild it.</span>` : readable().length ? `Built only from your ${readable().length} readable document${readable().length === 1 ? '' : 's'}: nothing from the advert or outside knowledge. Every topic is checked against the exact words in your files.` : 'Add a readable document or notes first. The mind map uses only your documents.'}</p>
            <div id="mm-root">${a.docMap ? '' : ''}</div>
          </section>

          <section class="panel docs-ask">
            <div class="panel-head"><h2>Ask about these documents</h2>${(a.docChat || []).length ? html`<button class="btn ghost small danger" id="dc-clear" data-label="Delete all" type="button">🗑 Delete all</button>` : ''}</div>
            <p class="hint">Clarify anything: scope, systems, who's who, what the client wants. Answers come only from your documents and the advert.</p>
            <div class="chat">${(a.docChat || []).map((m, ci) => html`<div class="chat-q"><span>${m.q}</span><button class="q-del" data-cdel="${ci}" type="button" title="Delete this question and answer" aria-label="Delete question and answer">🗑</button></div><div class="chat-a">${m.a}${(m.sources || []).length ? html`<div class="muted small mt-s">Sources: ${m.sources.join(', ')}</div>` : ''}${m.ask ? html`<div class="small mt-s"><strong>Ask them:</strong> ${m.ask} <button class="linkish small" data-copyask="${m.ask}" type="button">Copy</button></div>` : ''}</div>`)}</div>
            <form id="dc-form" class="row gap"><input id="dc-q" type="text" placeholder="e.g. Which S/4HANA modules are in scope?" ${readable().length ? '' : raw('disabled')} autocomplete="off" title="${readable().length ? '' : 'Add a readable file or notes first'}"><button class="btn primary" type="submit" ${readable().length ? '' : raw('disabled')}>Ask</button></form>
          </section>
        </div>`);
    };
    draw();

    const save = () => ctx.saveNow();
    async function addFiles(files) {
      for (const f of files) {
        const d = { id: uid(), name: f.name, type: f.type || '', size: f.size, kind: kindOf(f), added: new Date().toISOString(), status: 'reading', use: true, text: '', note: '' };
        try { await S.putFile(d.id, f); }
        catch (e) { toast(`${f.name}: this browser could not store it (${e.name === 'QuotaExceededError' ? 'storage full' : 'error'})`, 'bad'); continue; }
        a.docs.push(d); await save(); draw();
        process(d, f);
      }
    }
    async function process(d, blob) {
      const step = t => { const el = $(`[data-id="${d.id}"] .doc-main .muted.small span`, body); if (el) el.textContent = t; };
      try {
        const r = await extract(d, blob, step);
        Object.assign(d, { text: r.text || '', status: r.status, why: r.why || '', pages: r.pages || 0 });
      } catch (e) { d.status = 'error'; d.why = e.message || 'Could not read this file.'; }
      // Copy to the Claude account so other devices can open it.
      if (!d.assetId && d.size <= SYNC_MAX && SYNC_TYPES.test(d.type)) {
        const as = await assets();
        if (as) { try { const r = await as.upload(blob, { type: d.type }); d.assetId = r.id; } catch (e) { console.warn('asset upload', e); } }
      }
      await save(); draw();
      if (hasContent(d)) digest(d);
    }

    body.addEventListener('change', async e => {
      if (e.target.id === 'dz-in') { await addFiles([...e.target.files]); e.target.value = ''; return; }
      const u = e.target.dataset.use; if (u) { const d = a.docs.find(x => x.id === u); d.use = e.target.checked; await save(); draw(); }
    });
    body.addEventListener('input', e => { const id = e.target.dataset.note; if (!id) return; const d = a.docs.find(x => x.id === id); d.note = e.target.value; ctx.saveSoon ? ctx.saveSoon() : save(); });
    // Refresh the file's status and the buttons without redrawing (a redraw here would swallow the next click).
    body.addEventListener('focusout', e => {
      const id = e.target.dataset.note; if (!id) return;
      const d = a.docs.find(x => x.id === id), row = $(`[data-id="${id}"]`, body);
      const st = row && $('.doc-main .muted.small span', row); if (st) { st.textContent = statusText(d); st.className = d.status === 'ready' || (d.note || '').trim() ? 'ok-text' : 'warn-text'; }
      const n = readable().length, go = $('#dq-go', body), q = $('#dc-q', body), qb = $('#dc-form button', body);
      const h = $('#dq-hint', body); if (h) h.textContent = dqHint();
      const cb = row && $('[data-digest]', row); if (cb) cb.disabled = !hasContent(d);
      if (q) q.disabled = !n; if (qb) qb.disabled = !n; if (go) go.disabled = !n;
    });
    const dz = () => $('#dz', body);
    body.addEventListener('dragover', e => { if (e.target.closest('#dz')) { e.preventDefault(); dz().classList.add('over'); } });
    body.addEventListener('dragleave', e => { if (e.target.closest('#dz')) dz().classList.remove('over'); });
    body.addEventListener('drop', async e => { if (!e.target.closest('#dz')) return; e.preventDefault(); dz().classList.remove('over'); await addFiles([...e.dataTransfer.files]); });

    body.addEventListener('click', async e => {
      const t = e.target;
      const open = t.closest('[data-open]');
      if (open) {
        const d = a.docs.find(x => x.id === open.dataset.open); const b = await blobOf(d);
        if (!b) { toast('This file is on another device. Open it there, or upload it again here.', 'warn'); return; }
        const url = URL.createObjectURL(b); const w = window.open(url, '_blank');
        if (!w) window.CVT.ui.download(b, d.name); setTimeout(() => URL.revokeObjectURL(url), 60000); return;
      }
      const del = t.closest('[data-del]');
      if (del) {
        const d = a.docs.find(x => x.id === del.dataset.del);
        if (!confirmInline(del)) return;
        await S.delFile(d.id).catch(() => {});
        if (d.assetId) { const as = await assets(); try { if (as && as.delete) await as.delete(d.assetId); } catch (_) { /* the local copy is gone either way */ } }
        a.docs = a.docs.filter(x => x !== d); await save(); draw(); toast('Removed'); return;
      }
      const qd = t.closest('[data-qdel]');
      if (qd) { e.preventDefault(); a.docQuestions.items.splice(+qd.dataset.qdel, 1); if (!a.docQuestions.items.length) a.docQuestions = null; await save(); draw(); toast('Question deleted'); return; }
      const gq = t.closest('[data-gqdel]');
      if (gq) { e.preventDefault(); const [id, i] = gq.dataset.gqdel.split(':'); const d = a.docs.find(x => x.id === id); if (d && d.digest) { d.digest.questions.splice(+i, 1); await save(); draw(); toast('Question deleted'); } return; }
      const cd = t.closest('[data-cdel]');
      if (cd) { a.docChat.splice(+cd.dataset.cdel, 1); await save(); draw(); toast('Deleted'); return; }
      if (t.id === 'dq-clear') { if (!confirmInline(t)) return; a.docQuestions = null; await save(); draw(); toast('Questions deleted'); return; }
      if (t.id === 'mm-del') { if (!confirmInline(t)) return; a.docMap = null; mmApi = null; await save(); draw(); toast('Mind map deleted'); return; }
      const dg = t.closest('[data-digest]');
      if (dg) { const d = a.docs.find(x => x.id === dg.dataset.digest); if (d) digest(d); return; }
      const retry = t.closest('[data-retry]');
      if (retry) { const d = a.docs.find(x => x.id === retry.dataset.retry); const b = await blobOf(d); if (!b) { toast('The file is not on this device.', 'warn'); return; } d.status = 'reading'; draw(); process(d, b); return; }
      if (t.id === 'dq-go') {
        const docs = readable();
        if (!docs.length) { toast('Add a readable document (or notes) first: questions come only from your documents.', 'warn'); return; }
        t.disabled = true; t.textContent = 'Preparing… (30–60 s)';
        try {
          const { passages, coverage } = passagesOf(docs);
          const r = await A.docQuestions({ app: a, profile, stories, passages });
          const v = verifyQuestions(r && r.questions, passages, docs);
          if (!v.items.length) throw new Error('None of the questions could be matched to your documents. Press Prepare again, or add clearer documents.');
          a.docQuestions = { at: new Date().toISOString(), grounded: true, sig: mapSig(), from: `${docs.length} document${docs.length === 1 ? '' : 's'}`, coverage, removed: v.removed, items: v.items, themes: (r && r.themes) || [] };
          await save(); draw(); toast(`${v.items.length} questions ready`);
        } catch (err) { toast(err.message, 'bad'); t.disabled = false; t.textContent = a.docQuestions ? 'Prepare again' : 'Prepare questions'; }
        return;
      }
      if (t.id === 'mm-go') {
        const docs = readable();
        if (!docs.length) { toast('Add a readable document (or notes) first: the mind map uses only your documents.', 'warn'); return; }
        t.disabled = true; t.textContent = 'Building… (30–60 s)';
        try {
          const { passages, coverage } = passagesOf(docs);
          const r = await A.docMindmap({ passages });
          const v = verifyTree(r || {}, passages, docs);
          if (!v.tree.branches.length) throw new Error('Nothing in the mind map could be matched to your documents. Try Rebuild, or add clearer documents.');
          a.docMap = { at: new Date().toISOString(), sig: mapSig(), from: `${docs.length} document${docs.length === 1 ? '' : 's'}`, grounded: true, passages: passages.length, coverage, kept: v.kept, removed: v.removed, tree: v.tree, collapsed: [] };
          await save(); draw(); toast('Mind map ready');
        } catch (err) { toast(err.message, 'bad'); t.disabled = false; t.textContent = a.docMap ? 'Rebuild' : 'Build mind map'; }
        return;
      }
      if (t.id === 'mm-dl' && mmApi) { window.CVT.ui.download(new Blob([mmApi.svgText()], { type: 'image/svg+xml' }), `${(a.company || 'job').replace(/\W+/g, '_')}_mind_map.svg`); return; }
      if (t.id === 'dq-copy') { copy(a.docQuestions.items.map((q, i) => `${i + 1}. ${q.q}${q.source ? `\n   (From ${q.source}${q.quote ? ': "' + q.quote + '"' : ''})` : ''}\n   ${(q.answer_outline || []).map(x => '- ' + x).join('\n   ')}`).join('\n\n')); return; }
      if (t.id === 'dc-clear') { if (!confirmInline(t)) return; a.docChat = []; await save(); draw(); toast('Deleted'); return; }
      const ca = t.closest('[data-copyask]'); if (ca) { copy(ca.dataset.copyask); return; }
    });
    // Two-step delete without browser dialogs.
    function confirmInline(btn) { if (btn.dataset.sure) return true; const was = btn.textContent; btn.dataset.sure = '1'; btn.textContent = 'Click again to delete'; btn.classList.add('armed'); setTimeout(() => { if (btn.isConnected) { delete btn.dataset.sure; btn.textContent = was; btn.classList.remove('armed'); } }, 4000); return false; }

    body.addEventListener('submit', async e => {
      if (e.target.id !== 'dc-form') return; e.preventDefault();
      const inp = $('#dc-q', body), q = inp.value.trim(); if (q.length < 3) return;
      const btn = e.target.querySelector('button'); btn.disabled = true; inp.disabled = true; btn.textContent = 'Thinking…';
      try {
        const r = await A.docAsk({ app: a, docs: a.docs, question: q, history: a.docChat || [] });
        a.docChat = (a.docChat || []).concat({ q, a: r.answer || '', sources: r.sources || [], ask: r.ask_them || '', at: new Date().toISOString() }).slice(-30);
        await save(); draw(); const c = $('.chat', body); if (c) c.scrollTop = c.scrollHeight; $('#dc-q', body).focus();
      } catch (err) { toast(err.message, 'bad'); btn.disabled = false; inp.disabled = false; btn.textContent = 'Ask'; }
    });
  }

  window.CVT.docs = { tab, kindOf, extract };
})();
