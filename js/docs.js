/*
 * docs.js — the Documents tab of an application.
 * Upload PDFs, Word files, images, video, audio or notes for one job. Files stay on this device
 * (any size the browser allows); inside claude.ai, files up to 20 MB are also copied to your Claude
 * account so your other devices can open them. The readable text is pulled out once and kept on the
 * application, then used to prepare likely interview questions and to answer your questions.
 */
(function () {
  const { html, raw, esc, $, $$, toast, copy } = window.CVT.ui;
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
      onStep && onStep('Scanned PDF: reading the pages');
      const imgs = await pdfPageImages(r.doc, lim.maxCount);
      return { text: (await A.describeImages({ blobs: imgs, name: d.name, kind: 'pdf' })).slice(0, TEXT_CAP), status: 'ready', pages: r.pages };
    }
    if (k === 'image') {
      const lim = await imageLimits();
      if (!lim) return { text: '', status: 'notes', why: 'Image reading needs Applywise opened in claude.ai. Add notes describing it instead.' };
      onStep && onStep('Reading the image');
      return { text: await A.describeImages({ blobs: [blob], name: d.name, kind: 'image' }), status: 'ready' };
    }
    if (k === 'video') {
      const lim = await imageLimits();
      if (!lim) return { text: '', status: 'notes', why: 'This video can’t be read here (speech can’t be transcribed, and slide reading isn’t available in this view). Paste a transcript or notes below, or upload the transcript file: Teams, Zoom and YouTube can export one (.vtt or .txt).' };
      onStep && onStep('Taking frames from the video');
      const frames = await videoFrames(blob, Math.min(lim.maxCount, 8));
      if (!frames.length) return { text: '', status: 'notes', why: 'Could not read frames from this video. Paste a transcript or notes below.' };
      onStep && onStep('Reading the slides and screens');
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
  function passagesOf(docs, budget = BUDGET) {
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
    if (total <= budget) return { passages: all, coverage: 100 };
    // Too long for one request: keep an even spread from every document.
    const keep = Math.max(1, Math.floor(all.length * budget / total));
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
      return kids.length ? { label: n.label, detail: '', grouping: true, source: 'your documents', children: kids } : null;
    };
    const branches = (raw.branches || []).map(check).filter(Boolean);
    return { tree: { center: raw.center || 'Your documents', branches }, removed, kept };
  }

  // ---------------------------------------------------------------------
  // Retrieval for "Ask": BM25 over every passage of every document
  // ---------------------------------------------------------------------
  const STOP = new Set('a an the and or of to in on for with by at from is are was were be been it its this that these those what which who whom how why when where do does did can could should would will shall may might about into as than then there their they them we our you your i me my he she his her not no yes if any all some more most other such only own same so too very just also per via vs'.split(' '));
  const toks = t => norm(t).replace(/[.']/g, ' ').split(' ').filter(w => w.length > 1 && !STOP.has(w)).map(w => w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w);
  function retrieve(passages, query, { k = 14, chars = 16000 } = {}) {
    const q = [...new Set(toks(query))]; if (!q.length) return passages.slice(0, k);
    const docs = passages.map(p => { const t = toks(p.doc + ' ' + p.text); const tf = new Map(); t.forEach(w => tf.set(w, (tf.get(w) || 0) + 1)); return { p, tf, len: t.length }; });
    const N = docs.length, avg = docs.reduce((n, d) => n + d.len, 0) / Math.max(1, N);
    const df = new Map(q.map(w => [w, docs.filter(d => d.tf.has(w)).length]));
    const scored = docs.map((d, i) => {
      let sc = 0; q.forEach(w => { const f = d.tf.get(w) || 0; if (!f) return; const idf = Math.log(1 + (N - df.get(w) + 0.5) / (df.get(w) + 0.5)); sc += idf * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * d.len / avg)); });
      return { p: d.p, sc, i };
    }).sort((x, y) => y.sc - x.sc || x.i - y.i);
    const out = []; let used = 0;
    for (const x of scored) { if (out.length >= k || used + x.p.text.length > chars) break; if (x.sc > 0 || out.length < 4) { out.push(x); used += x.p.text.length; } }
    // Add each hit's neighbour so answers keep their context.
    const byId = new Map(passages.map((p, i) => [p.id, i]));
    out.slice(0, 5).forEach(x => { const nb = passages[byId.get(x.p.id) + 1]; if (nb && nb.doc === x.p.doc && !out.some(o => o.p === nb) && used + nb.text.length <= chars) { out.push({ p: nb, sc: x.sc / 2 }); used += nb.text.length; } });
    return out.map(x => x.p);
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
      if (n) return `Questions come only from your ${n} document${n === 1 ? '' : 's'}, never from the job advert. New documents add their questions automatically. Answer outlines use only your real experience.${skip}`;
      return a.docs.length ? `None of your files has readable text yet.${skip} Add notes or a transcript to a file, then prepare questions.` : 'Upload the documents for this job (role pack, client deck, case study, notes). Questions are drawn only from them.';
    };

    const groups = items => { const m = new Map(); items.forEach(q => { const k = q.source || 'Your documents'; if (!m.has(k)) m.set(k, []); m.get(k).push(q); }); return [...m.entries()]; };
    const TYPE = { functional: 'Functional', ba: 'Business analysis', behavioural: 'Behavioural', motivation: 'Motivation', case: 'Case study' };
    const CONF = { high: '✓ Fully backed by your documents', partial: '◐ Partly backed: check the flagged source', none: '○ Not in your documents' };
    const SUGGEST = ['What is in scope?', 'Which systems are mentioned?', 'What are the key dates?', 'Who are the stakeholders?', 'What problems are they trying to fix?', 'What will the interview or case study involve?'];
    const engine = () => { const st = (window.CVT.ui && window.CVT.ui.state) || {}; return st.provider === 'claude-plan' ? 'the built-in AI (no extra cost)' : 'your free Gemini model'; };
    /** Answer text with [D1-P3] markers turned into small source numbers. */
    const cited = (text, cites) => {
      const refs = (cites || []).map(c => c.ref), seen = {};
      // The n-th marker for a passage points to the n-th source quoting that passage.
      const pick = r => { const all = refs.map((x, i) => x === r ? i : -1).filter(i => i >= 0); if (!all.length) return []; const n = seen[r] = (seen[r] || 0) + 1; return [all[Math.min(n, all.length) - 1]]; };
      return raw(esc(text).replace(/\[(D\d+-P\d+)(?:\s*[,;]\s*(D\d+-P\d+))*\]/g, m => m.slice(1, -1).split(/\s*[,;]\s*/).map(r => pick(r).map(i => { const c = cites[i]; return `<sup class="cite ${c.ok ? '' : 'unv'}" title="${esc(c.doc)}, passage ${pnum(r)}${c.ok ? '' : ' (quote not found)'}">${i + 1}</sup>`; }).join('')).join('')));
    };
    const plain = t => String(t || '').replace(/\s*\[D\d+-P\d+(?:\s*[,;]\s*D\d+-P\d+)*\]/g, '');
    const pnum = ref => (String(ref || '').split('-')[1] || '').replace('P', '');
    /** One question card. del = data attribute for its delete button; idx = index in a.docQuestions.items for the main list. */
    const openQ = new Set(); let dqFilter = 'all';
    const qCard = (q, n, del, idx) => { const k = idx == null ? del : 'q' + idx; return html`<li class="dq ${q.practised ? 'done' : ''}"><details data-k="${k}" ${openQ.has(k) ? raw('open') : ''}>
      <summary><span class="dq-n">${q.practised ? '✓' : n}</span><span class="dq-body"><span class="dq-q">${q.q}</span><span class="dq-meta"><span class="chip muted">${TYPE[q.type] || q.type || 'Question'}</span>${(q.notes || '').trim() ? html`<span>· your notes</span>` : ''}${q.inPrep ? html`<span>· in Prep</span>` : ''}</span></span>${raw(`<button class="q-del" ${del} type="button" title="Delete this question" aria-label="Delete question">🗑</button>`)}</summary>
      <div class="dq-more">
        ${q.why ? html`<p class="small"><strong>What it tests:</strong> ${q.why}</p>` : ''}
        ${(q.answer_outline || []).length ? html`<p class="small"><strong>How to answer</strong></p><ul class="tight small">${q.answer_outline.map(x => html`<li>${x}</li>`)}</ul>` : ''}
        ${q.story_hint && stories.find(s => s.id === q.story_hint) ? html`<p class="small">Story to use: <strong>${stories.find(s => s.id === q.story_hint).title}</strong></p>` : ''}
        ${idx == null ? '' : html`<label class="small dq-notes-l">Your answer notes<textarea class="dq-notes" data-dqn="${idx}" rows="3" placeholder="Draft your answer in your own words: situation, what you did, the result.">${q.notes || ''}</textarea></label>
        <div class="dq-acts"><button class="btn ${q.practised ? 'ghost' : 'primary'} small" data-dqp="${idx}" type="button">${q.practised ? 'Mark as not practised' : '✓ Mark practised'}</button><button class="btn ghost small" data-dqprep="${idx}" type="button" ${q.inPrep ? raw('disabled') : ''}>${q.inPrep ? 'Added to Prep cards' : '+ Add to Prep cards'}</button><button class="btn ghost small" data-dqcopy="${idx}" type="button">Copy</button></div>`}
      </div></details></li>`; };
    const d0 = () => 'your document';
    const dqTools = () => {
      const all = a.docQuestions.items, done = all.filter(q => q.practised).length, pct = all.length ? Math.round(100 * done / all.length) : 0;
      const types = [...new Set(all.map(q => q.type).filter(Boolean))];
      const f = (k, label, n) => html`<button type="button" class="dq-f" data-dqf="${k}" aria-pressed="${dqFilter === k}">${label} <span>${n}</span></button>`;
      return html`<div class="dq-tools">
        <div class="dq-prog"><span class="small"><strong>${done}</strong> of ${all.length} practised</span><span class="dq-bar" aria-hidden="true"><i style="width:${pct}%"></i></span></div>
        <div class="dq-filters" role="group" aria-label="Filter questions">${f('all', 'All', all.length)}${f('todo', 'Not practised', all.length - done)}${types.map(t => f(t, TYPE[t] || t, all.filter(q => q.type === t).length))}</div>
      </div>`;
    };
    const qText = (q, i) => `${i + 1}. ${q.q}${q.source ? `\n   From ${q.source}` : ''}${(q.answer_outline || []).length ? '\n   How to answer:\n' + q.answer_outline.map(x => '   - ' + x).join('\n') : ''}${(q.notes || '').trim() ? '\n   My notes: ' + q.notes.trim() : ''}`;
    async function toPrep(list) {
      const cur = Object.assign({ p: {}, custom: [] }, (await S.getKV('drills', null)) || {});
      const topic = [a.role, a.company].filter(Boolean).join(' at ') || 'This job';
      const fresh = list.filter(q => !q.inPrep);
      cur.custom = (cur.custom || []).concat(fresh.map(q => ({ id: 'c' + uid(), deck: 'custom', q: q.q, a: [(q.answer_outline || []).map(x => '• ' + x).join('\n'), (q.notes || '').trim() ? 'My notes: ' + q.notes.trim() : ''].filter(Boolean).join('\n\n') || 'Answer from your documents and experience.', topic })));
      await S.setKV('drills', cur); fresh.forEach(q => { q.inPrep = true; }); await save(); draw();
      toast(fresh.length ? `${fresh.length} question${fresh.length === 1 ? '' : 's'} added to Prep → Drill cards (My cards)` : 'Already in Prep');
    }
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
    const mountStudio = () => { const r = $('#studio-root', body); if (r && window.CVT.studio) window.CVT.studio.mount(r, { a, readable, passagesOf, found, save: () => save(), sig: mapSig, redraw: () => draw(), refreshJump: () => draw() }); };
    const draw = () => { drawBase(); mountMap(); mountStudio(); };
    const drawBase = () => {
      const nq = a.docQuestions ? a.docQuestions.items.length : 0, np = a.docQuestions ? a.docQuestions.items.filter(q => q.practised).length : 0;
      body.innerHTML = String(html`
        <nav class="docs-jump" aria-label="Sections on this page">
          <button type="button" data-jump="sec-docs">Documents <span>${a.docs.length}</span></button>
          <button type="button" data-jump="sec-qs">Interview questions <span>${nq ? `${np}/${nq}` : '0'}</span></button>
          <button type="button" data-jump="sec-map">Mind map <span>${a.docMap ? '✓' : '–'}</span></button>
          <button type="button" data-jump="sec-ask">Ask <span>${(a.docChat || []).length}</span></button>
          <button type="button" data-jump="sec-studio">Studio <span>${Object.keys(a.studio || {}).length + ((a.docNotes || []).length ? '+' + a.docNotes.length : '')}</span></button>
          ${a.docs.length || a.docQuestions || a.docMap || (a.docChat || []).length || Object.keys(a.studio || {}).length || (a.docNotes || []).length ? html`<span class="grow-s"></span><button type="button" class="btn ghost small danger" id="docs-wipe" title="Delete every file, question, the mind map, the Q&A, Studio outputs and notes on this page">🗑 Delete everything &amp; start again</button>` : ''}
        </nav>
        <div class="docs-upd" id="docs-upd" ${body.dataset.upd ? '' : raw('hidden')} role="status"><span class="spinner" aria-hidden="true"></span><span>${body.dataset.upd || ''}</span></div>
        <div class="docs-grid">
          <section class="panel" id="sec-docs">
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

          <section class="panel" id="sec-qs">
            <div class="panel-head"><h2>Likely interview questions</h2>${a.docQuestions ? html`<div class="row gap"><button class="btn ghost small" id="dq-copy" type="button">Copy all</button><button class="btn ghost small" id="dq-dl" type="button">Download</button><button class="btn ghost small" id="dq-prep-all" type="button">+ All to Prep</button><button class="btn ghost small danger" id="dq-clear" data-label="Delete all" type="button" title="Delete all these questions">🗑 Delete all</button></div>` : ''}</div>
            <p class="hint" id="dq-hint">${dqHint()}</p>
            ${a.docQuestions && !a.docQuestions.grounded ? html`<p class="small"><span class="chip warn">These were made before document-only mode and may include advert questions. Press Prepare again.</span></p>` : ''}
            <button class="btn primary" id="dq-go" type="button" ${readable().length ? '' : raw('disabled')}>${a.docQuestions ? 'Prepare again' : 'Prepare questions'}</button>
            ${a.docQuestions ? html`
              ${a.docQuestions.grounded ? html`<p class="small muted mt-s">${a.docQuestions.items.length} question${a.docQuestions.items.length === 1 ? '' : 's'} from ${a.docQuestions.from}</p>` : ''}
              ${(a.docQuestions.themes || []).length ? html`<p class="small mt-s dq-themes">Themes: ${a.docQuestions.themes.map(t => html`<span class="chip accent">${t}</span> `)}</p>` : ''}
              ${dqTools()}
              ${(() => { const all = a.docQuestions.items, shown = all.filter(q => dqFilter === 'all' || (dqFilter === 'todo' ? !q.practised : q.type === dqFilter)); if (!shown.length) return html`<p class="muted small">No questions match this filter.</p>`; return groups(shown).map(([src, items]) => html`<h3 class="h-sub mt dq-src">From ${src} <span class="muted">· ${items.length}</span></h3><ol class="dq-list">${items.map(q => { const i = all.indexOf(q); return qCard(q, i + 1, `data-qdel="${i}"`, i); })}</ol>`); })()}` : ''}
          </section>

          <section class="panel docs-map" id="sec-map">
            <div class="panel-head"><h2>Mind map of your documents</h2>
              <div class="row gap wrap">${a.docMap ? html`<button class="btn ghost small" id="mm-dl" type="button">Download (SVG)</button><button class="btn ghost small danger" id="mm-del" data-label="Delete map" type="button">🗑 Delete map</button>` : ''}<button class="btn ${a.docMap ? 'ghost' : 'primary'} small" id="mm-go" type="button" ${readable().length ? '' : raw('disabled')}>${a.docMap ? 'Rebuild' : 'Build mind map'}</button></div></div>
            <p class="hint">${a.docMap && a.docMap.grounded ? html`Built only from your ${a.docMap.from}, updated ${new Date(a.docMap.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}. New documents you add are merged in automatically.` : a.docMap ? html`<span class="chip warn">This map was built before document-only mode. Rebuild it.</span>` : readable().length ? `Built only from your ${readable().length} readable document${readable().length === 1 ? '' : 's'}: nothing from the advert or outside knowledge.` : 'Add a readable document or notes first. The mind map uses only your documents.'}</p>
            <div id="mm-root">${a.docMap ? '' : ''}</div>
          </section>

          <section class="panel docs-studio" id="sec-studio"><div id="studio-root"></div></section>

          <section class="panel docs-ask" id="sec-ask">
            <div class="panel-head"><h2>Ask about these documents</h2>${(a.docChat || []).length ? html`<button class="btn ghost small danger" id="dc-clear" data-label="Delete all" type="button">🗑 Delete all</button>` : ''}</div>
            <p class="hint">Answers come only from your documents, using ${engine()}.</p>
            <div class="chat">${(a.docChat || []).map((m, ci) => html`<div class="chat-q"><span>${m.q}</span><button class="q-del" data-cdel="${ci}" type="button" title="Delete this question and answer" aria-label="Delete question and answer">🗑</button></div><div class="chat-a"><div class="ans">${plain(m.a)}</div>${m.conf === 'none' ? html`<p class="small muted">Your documents don't cover this.</p>` : ''}${m.ask ? html`<div class="small mt-s"><strong>Ask them:</strong> ${m.ask} <button class="linkish small" data-copyask="${m.ask}" type="button">Copy</button></div>` : ''}<div class="mt-s"><button class="linkish small" data-pin="${ci}" type="button">${m.pinned ? '📌 Saved to notes' : '📌 Save to notes'}</button></div></div>`)}</div>
            ${readable().length ? html`<div class="dc-suggest">${SUGGEST.map(x => html`<button type="button" class="dq-f" data-suggest="${x}">${x}</button>`)}</div>` : ''}
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
      scheduleUpdate();
    }

    // ---------------------------------------------------------------
    // Auto-update: when new documents become readable, merge their content
    // into every section that already exists (mind map, questions, Studio).
    // ---------------------------------------------------------------
    const idsOf = o => o.ids || a.docs.filter(d => hasContent(d) && (!d.added || !o.at || d.added <= o.at)).map(d => d.id);
    let updTimer = null, updating = false, again = false;
    function scheduleUpdate() { clearTimeout(updTimer); updTimer = setTimeout(autoUpdate, 600); }
    function mergeTree(tree, add) {
      const k = x => String(x || '').trim().toLowerCase();
      (add.branches || []).forEach(b => {
        const m = (tree.branches = tree.branches || []).find(x => k(x.label) === k(b.label));
        if (!m) { tree.branches.push(b); return; }
        (b.children || []).forEach(c => { if (!(m.children = m.children || []).some(x => k(x.label) === k(c.label))) m.children.push(c); });
      });
    }
    async function autoUpdate() {
      if (a.docs.some(d => d.status === 'reading')) return; // wait until every new file is read
      if (updating) { again = true; return; }
      const docsR = readable();
      const targets = [];
      if (a.docMap && a.docMap.grounded) targets.push(['Mind map', a.docMap, async nd => { const { passages } = passagesOf(nd); const v = verifyTree((await A.docMindmap({ passages })) || {}, passages, nd); const before = JSON.stringify(a.docMap.tree).length; mergeTree(a.docMap.tree, v.tree); a.docMap.kept = (a.docMap.kept || 0) + v.kept; return JSON.stringify(a.docMap.tree).length > before ? v.kept : 0; }]);
      if (a.docQuestions && a.docQuestions.grounded) targets.push(['Interview questions', a.docQuestions, async nd => {
        const { passages } = passagesOf(nd);
        const r = await A.docQuestions({ app: a, profile, stories, passages });
        const v = verifyQuestions(r && r.questions, passages, nd);
        const have = new Set(a.docQuestions.items.map(q => q.q.trim().toLowerCase()));
        const fresh = v.items.filter(q => !have.has(q.q.trim().toLowerCase()));
        a.docQuestions.items = a.docQuestions.items.concat(fresh);
        a.docQuestions.themes = [...new Set((a.docQuestions.themes || []).concat((r && r.themes) || []))].slice(0, 8);
        return fresh.length;
      }]);
      const ST = window.CVT.studio;
      if (ST) Object.keys(a.studio || {}).forEach(kind => { const label = (ST.KINDS.find(x => x[0] === kind) || [])[1] || kind; targets.push([label, a.studio[kind], nd => ST.extend(a, kind, nd, { passagesOf, found })]); });
      const work = targets.map(([label, o, run]) => [label, o, run, docsR.filter(d => !idsOf(o).includes(d.id))]).filter(x => x[3].length);
      if (!work.length) return;
      updating = true;
      const names = [...new Set(work.flatMap(x => x[3].map(d => d.name)))];
      banner(`Adding ${names.join(', ')} to ${work.map(x => x[0]).join(', ')}…`);
      const done = [];
      for (const [label, o, run, nd] of work) {
        banner(`Adding ${names.join(', ')} to ${label}…`);
        try { const n = await run(nd); o.ids = [...new Set(idsOf(o).concat(nd.map(d => d.id)))]; o.sig = mapSig(); o.from = `${o.ids.length} document${o.ids.length === 1 ? '' : 's'}`; o.at = new Date().toISOString(); if (n) done.push(`${label} (+${n})`); await save(); }
        catch (e) { console.warn('auto-update', label, e && e.message); }
      }
      updating = false; banner('');
      draw();
      if (done.length) toast(`Updated with ${names.join(', ')}: ${done.join(', ')}`);
      if (again) { again = false; scheduleUpdate(); }
    }
    function banner(text) { body.dataset.upd = text; const b = $('#docs-upd', body); if (!b) return; b.hidden = !text; b.querySelector('span:last-child').textContent = text; }
    /** Remove content that came from a deleted document. */
    function pruneDoc(d) {
      const gone = x => x.source === d.name;
      if (a.docQuestions) { a.docQuestions.items = a.docQuestions.items.filter(q => !gone(q)); if (!a.docQuestions.items.length) a.docQuestions = null; }
      if (a.docMap) {
        const walk = n => { const kids = (n.children || []).map(walk).filter(Boolean); if (gone(n) && !kids.length) return null; return Object.assign(n, { children: kids }); };
        a.docMap.tree.branches = (a.docMap.tree.branches || []).map(walk).filter(Boolean);
        if (!a.docMap.tree.branches.length) a.docMap = null;
      }
      if (window.CVT.studio) window.CVT.studio.prune(a, d.name);
      [a.docMap, a.docQuestions, ...Object.values(a.studio || {})].forEach(o => { if (!o) return; o.ids = idsOf(o).filter(i => i !== d.id); o.from = `${o.ids.length} document${o.ids.length === 1 ? '' : 's'}`; });
    }

    body.addEventListener('change', async e => {
      if (e.target.id === 'dz-in') { await addFiles([...e.target.files]); e.target.value = ''; return; }
      const u = e.target.dataset.use; if (u) { const d = a.docs.find(x => x.id === u); d.use = e.target.checked; await save(); draw(); if (d.use) scheduleUpdate(); }
    });
    body.addEventListener('toggle', e => { const k = e.target.dataset && e.target.dataset.k; if (!k) return; if (e.target.open) openQ.add(k); else openQ.delete(k); }, true);
    body.addEventListener('input', e => { if (e.target.dataset.dqn != null) { a.docQuestions.items[+e.target.dataset.dqn].notes = e.target.value; ctx.saveSoon ? ctx.saveSoon() : save(); return; } const id = e.target.dataset.note; if (!id) return; const d = a.docs.find(x => x.id === id); d.note = e.target.value; ctx.saveSoon ? ctx.saveSoon() : save(); });
    // Refresh the file's status and the buttons without redrawing (a redraw here would swallow the next click).
    body.addEventListener('focusout', e => {
      const id = e.target.dataset.note; if (!id) return;
      const d = a.docs.find(x => x.id === id), row = $(`[data-id="${id}"]`, body);
      const st = row && $('.doc-main .muted.small span', row); if (st) { st.textContent = statusText(d); st.className = d.status === 'ready' || (d.note || '').trim() ? 'ok-text' : 'warn-text'; }
      const n = readable().length, go = $('#dq-go', body), q = $('#dc-q', body), qb = $('#dc-form button', body);
      const h = $('#dq-hint', body); if (h) h.textContent = dqHint();
      const cb = row && $('[data-digest]', row); if (cb) cb.disabled = !hasContent(d);
      if (q) q.disabled = !n; if (qb) qb.disabled = !n; if (go) go.disabled = !n;
      if (hasContent(d)) scheduleUpdate();
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
        pruneDoc(d); a.docs = a.docs.filter(x => x !== d); await save(); draw(); toast('Removed, along with anything built from it'); return;
      }
      const qd = t.closest('[data-qdel]');
      if (qd) { e.preventDefault(); openQ.clear(); a.docQuestions.items.splice(+qd.dataset.qdel, 1); if (!a.docQuestions.items.length) a.docQuestions = null; await save(); draw(); toast('Question deleted'); return; }
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
      const j = t.closest('[data-jump]'); if (j) { const el = document.getElementById(j.dataset.jump); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      const f = t.closest('[data-dqf]'); if (f) { dqFilter = f.dataset.dqf; draw(); return; }
      const pr = t.closest('[data-dqp]'); if (pr) { const q = a.docQuestions.items[+pr.dataset.dqp]; q.practised = !q.practised; if (q.practised) openQ.delete('q' + pr.dataset.dqp); await save(); draw(); return; }
      const tp = t.closest('[data-dqprep]'); if (tp) { await toPrep([a.docQuestions.items[+tp.dataset.dqprep]]); return; }
      const qc = t.closest('[data-dqcopy]'); if (qc) { const i = +qc.dataset.dqcopy; copy(qText(a.docQuestions.items[i], i)); return; }
      if (t.id === 'dq-prep-all') { await toPrep(a.docQuestions.items); return; }
      if (t.id === 'dq-dl') { const head = `Likely interview questions: ${[a.role, a.company].filter(Boolean).join(' at ')}\nFrom your documents, ${new Date(a.docQuestions.at).toLocaleDateString('en-GB')}\n\n`; window.CVT.ui.download(new Blob([head + a.docQuestions.items.map(qText).join('\n\n')], { type: 'text/plain' }), `${(a.company || 'job').replace(/\W+/g, '_')}_interview_questions.txt`); return; }
      if (t.id === 'dq-go') {
        const docs = readable();
        if (!docs.length) { toast('Add a readable document (or notes) first: questions come only from your documents.', 'warn'); return; }
        t.disabled = true; t.textContent = 'Preparing… (30–60 s)';
        try {
          const { passages, coverage } = passagesOf(docs);
          const r = await A.docQuestions({ app: a, profile, stories, passages });
          const v = verifyQuestions(r && r.questions, passages, docs);
          if (!v.items.length) throw new Error('None of the questions could be matched to your documents. Press Prepare again, or add clearer documents.');
          const prev = new Map(((a.docQuestions && a.docQuestions.items) || []).map(q => [q.q.trim().toLowerCase(), q]));
          v.items.forEach(q => { const o = prev.get(q.q.trim().toLowerCase()); if (o) Object.assign(q, { notes: o.notes, practised: o.practised, inPrep: o.inPrep }); });
          a.docQuestions = { at: new Date().toISOString(), grounded: true, ids: docs.map(x => x.id), sig: mapSig(), from: `${docs.length} document${docs.length === 1 ? '' : 's'}`, coverage, removed: v.removed, items: v.items, themes: (r && r.themes) || [] };
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
          a.docMap = { at: new Date().toISOString(), sig: mapSig(), ids: docs.map(x => x.id), from: `${docs.length} document${docs.length === 1 ? '' : 's'}`, grounded: true, passages: passages.length, coverage, kept: v.kept, removed: v.removed, tree: v.tree, collapsed: [] };
          await save(); draw(); toast('Mind map ready');
        } catch (err) { toast(err.message, 'bad'); t.disabled = false; t.textContent = a.docMap ? 'Rebuild' : 'Build mind map'; }
        return;
      }
      if (t.id === 'mm-dl' && mmApi) { window.CVT.ui.download(new Blob([mmApi.svgText()], { type: 'image/svg+xml' }), `${(a.company || 'job').replace(/\W+/g, '_')}_mind_map.svg`); return; }
      if (t.id === 'dq-copy') { copy(a.docQuestions.items.map(qText).join('\n\n')); return; }
      if (t.id === 'docs-wipe') {
        if (!t.dataset.sure) { t.dataset.sure = '1'; t.textContent = `Click again to delete ${a.docs.length} file${a.docs.length === 1 ? '' : 's'}, questions, mind map, Q&A, Studio and notes`; t.classList.add('armed'); setTimeout(() => { if (t.isConnected) { delete t.dataset.sure; t.textContent = '🗑 Delete everything & start again'; t.classList.remove('armed'); } }, 5000); return; }
        t.disabled = true; t.textContent = 'Deleting…';
        const as = a.docs.some(d => d.assetId) ? await assets() : null;
        for (const d of a.docs) {
          await S.delFile(d.id).catch(() => {});
          if (d.assetId && as && as.delete) { try { await as.delete(d.assetId); } catch (_) {} }
        }
        const n = a.docs.length;
        if (window.CVT.studio) window.CVT.studio.stop();
        a.docs = []; a.docQuestions = null; a.docMap = null; a.docChat = []; a.studio = {}; a.docNotes = []; mmApi = null; openQ.clear(); dqFilter = 'all';
        await save(); draw(); window.scrollTo({ top: 0 }); toast(`Cleared: ${n} file${n === 1 ? '' : 's'} and everything built from them. Your My questions tab is untouched.`);
        return;
      }
      if (t.id === 'dc-clear') { if (!confirmInline(t)) return; a.docChat = []; await save(); draw(); toast('Deleted'); return; }
      const pn = t.closest('[data-pin]'); if (pn) { const m = a.docChat[+pn.dataset.pin]; if (!m.pinned) { window.CVT.studio.pin(a, m.q, m.a.replace(/\s*\[D\d+-P\d+(?:\s*[,;]\s*D\d+-P\d+)*\]/g, '')); m.pinned = true; await save(); window.CVT.studio.open(a.id, 'notes'); draw(); toast('Saved to Studio → Notes'); } return; }
      const sg = t.closest('[data-suggest]'); if (sg) { const i = $('#dc-q', body); i.value = sg.dataset.suggest; $('#dc-form', body).requestSubmit(); return; }
      const ca = t.closest('[data-copyask]'); if (ca) { copy(ca.dataset.copyask); return; }
    });
    // Two-step delete without browser dialogs.
    function confirmInline(btn) { if (btn.dataset.sure) return true; const was = btn.textContent; btn.dataset.sure = '1'; btn.textContent = 'Click again to delete'; btn.classList.add('armed'); setTimeout(() => { if (btn.isConnected) { delete btn.dataset.sure; btn.textContent = was; btn.classList.remove('armed'); } }, 4000); return false; }

    body.addEventListener('submit', async e => {
      if (e.target.id !== 'dc-form') return; e.preventDefault();
      const inp = $('#dc-q', body), q = inp.value.trim(); if (q.length < 3) return;
      const btn = e.target.querySelector('button'); btn.disabled = true; inp.disabled = true; btn.textContent = 'Thinking…';
      try {
        const docs = readable();
        const { passages: all } = passagesOf(docs, Infinity);
        const hits = retrieve(all, q + ' ' + ((a.docChat || []).slice(-1)[0] || {}).q);
        const r = await A.docAsk({ app: a, passages: hits, question: q, history: a.docChat || [] });
        const byId = new Map(all.map(p => [p.id, p]));
        const seen = new Set();
        const cites = (r.claims || []).filter(c => c && c.quote).map(c => {
          const p = byId.get(String(c.ref || '').trim());
          const ok = !!(p && found(c.quote, p.text)) || docs.some(d => found(c.quote, (d.text || '') + '\n' + (d.note || '')));
          return { ref: p ? p.id : String(c.ref || ''), doc: p ? p.doc : 'your documents', quote: c.quote, ok };
        }).filter(c => { const k = c.ref + c.quote; if (seen.has(k)) return false; seen.add(k); return true; });
        // Make sure every [ref] in the answer has a numbered source.
        (String(r.answer || '').match(/D\d+-P\d+/g) || []).forEach(ref => { if (!cites.some(c => c.ref === ref) && byId.get(ref)) cites.push({ ref, doc: byId.get(ref).doc, quote: byId.get(ref).text.slice(0, 160) + (byId.get(ref).text.length > 160 ? '…' : ''), ok: true }); });
        // Quietly drop any sentence whose support couldn't be found in the documents.
        const seenRef = {};
        const pickOk = ref => { const idx = cites.map((c, i) => c.ref === ref ? i : -1).filter(i => i >= 0); if (!idx.length) return true; const n = seenRef[ref] = (seenRef[ref] || 0) + 1; return cites[idx[Math.min(n, idx.length) - 1]].ok; };
        let answer = String(r.answer || '').split(/\n/).map(line => line.split(/(?<=[.!?])\s+/).filter(sen => { const refs = sen.match(/D\d+-P\d+/g) || []; return !refs.length || refs.map(pickOk).some(Boolean); }).join(' ')).filter(l => l.trim()).join('\n');
        if (!answer.trim()) { answer = "Your documents don't cover this."; r.found = false; }
        r.answer = answer;
        const conf = r.found === false || !cites.length ? 'none' : cites.every(c => c.ok) ? 'high' : 'partial';
        a.docChat = (a.docChat || []).concat({ q, a: r.answer || '', cites, conf, searched: hits.length, total: all.length, ask: r.ask_them || '', at: new Date().toISOString() }).slice(-30);
        await save(); draw(); const c = $('.chat', body); if (c) c.scrollTop = c.scrollHeight; $('#dc-q', body).focus();
      } catch (err) { toast(err.message, 'bad'); btn.disabled = false; inp.disabled = false; btn.textContent = 'Ask'; }
    });
  }

  window.CVT.docs = { tab, kindOf, extract, passagesOf, retrieve, found };
})();
