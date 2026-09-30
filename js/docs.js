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
  async function tab(ctx) {
    const { a, body, profile } = ctx;
    a.docs = a.docs || [];
    const stories = await S.getKV('stories', []) || [];
    const statusText = d => d.status === 'reading' ? 'Reading…' : d.status === 'ready' ? `Ready · ${(d.text || '').length.toLocaleString('en-GB')} characters${d.pages ? ' · ' + d.pages + ' pages' : ''}` : d.status === 'error' ? 'Could not read' : (d.note || '').trim() ? 'Using your notes' : 'Needs notes';
    const readable = () => a.docs.filter(d => d.use !== false && (((d.text || '').trim()) || (d.note || '').trim()));
    const dqHint = () => {
      const n = readable().length, waiting = a.docs.filter(d => d.use !== false && !((d.text || '').trim() || (d.note || '').trim()));
      if (n) return `Built from ${n} document${n === 1 ? '' : 's'}, the advert and your real experience. Answer outlines never invent experience.${waiting.length ? ` ${waiting.length} file${waiting.length > 1 ? 's have' : ' has'} no readable text yet and will be skipped.` : ''}`;
      return a.docs.length ? `None of your files has readable text yet${waiting.some(d => d.kind === 'video' || d.kind === 'audio') ? ' (videos and audio need a transcript or notes)' : ''}. Questions will come from the job advert and your experience; add notes to a file to include it.` : 'Questions come from the job advert and your experience. Add documents to make them more specific.';
    };

    const draw = () => {
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
                  ${d.text ? html`<details><summary class="small">What Applywise read</summary><div class="pre small doc-text">${d.text.slice(0, 3000)}${d.text.length > 3000 ? '…' : ''}</div></details>` : ''}
                </div>
                <div class="doc-actions">
                  <label class="check-line small"><input type="checkbox" data-use="${d.id}" ${d.use !== false ? raw('checked') : ''}> Use</label>
                  <button class="btn ghost small" data-open="${d.id}" type="button">Open</button>
                  ${d.status === 'error' || d.status === 'notes' ? html`<button class="btn ghost small" data-retry="${d.id}" type="button">Read again</button>` : ''}
                  <button class="icon-btn" data-del="${d.id}" type="button" title="Remove" aria-label="Remove ${d.name}">✕</button>
                </div>
              </article>`)}</div>
            ${a.docs.length ? '' : html`<p class="empty-note">No documents yet.</p>`}
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Likely interview questions</h2>${a.docQuestions ? html`<button class="btn ghost small" id="dq-copy" type="button">Copy all</button>` : ''}</div>
            <p class="hint" id="dq-hint">${dqHint()}</p>
            <button class="btn primary" id="dq-go" type="button">${a.docQuestions ? 'Prepare again' : 'Prepare questions'}</button>
            <ol class="progress" id="dq-prog" hidden></ol>
            ${a.docQuestions ? html`
              ${(a.docQuestions.themes || []).length ? html`<p class="small mt">Themes: ${a.docQuestions.themes.map(t => html`<span class="chip accent">${t}</span> `)}</p>` : ''}
              <div class="qs">${a.docQuestions.items.map((q, i) => html`<details ${i === 0 ? raw('open') : ''}><summary><span class="chip muted">${q.type}</span> ${q.q}</summary>
                <p class="small muted">${q.why}${q.source ? html` · <em>from ${q.source}</em>` : ''}</p>
                <ul class="tight small">${(q.answer_outline || []).map(x => html`<li>${x}</li>`)}</ul>
                ${q.story_hint && stories.find(s => s.id === q.story_hint) ? html`<p class="small">Story to use: <strong>${stories.find(s => s.id === q.story_hint).title}</strong></p>` : ''}</details>`)}</div>` : ''}
          </section>

          <section class="panel docs-ask">
            <div class="panel-head"><h2>Ask about these documents</h2>${(a.docChat || []).length ? html`<button class="linkish small" id="dc-clear" type="button">Clear</button>` : ''}</div>
            <p class="hint">Clarify anything: scope, systems, who's who, what the client wants. Answers come only from your documents and the advert.</p>
            <div class="chat">${(a.docChat || []).map(m => html`<div class="chat-q">${m.q}</div><div class="chat-a">${m.a}${(m.sources || []).length ? html`<div class="muted small mt-s">Sources: ${m.sources.join(', ')}</div>` : ''}${m.ask ? html`<div class="small mt-s"><strong>Ask them:</strong> ${m.ask} <button class="linkish small" data-copyask="${m.ask}" type="button">Copy</button></div>` : ''}</div>`)}</div>
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
      if (q) q.disabled = !n; if (qb) qb.disabled = !n;
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
        if (d.assetId) { const as = await assets(); if (as) as.delete(d.assetId).catch(() => {}); }
        a.docs = a.docs.filter(x => x !== d); await save(); draw(); toast('Removed'); return;
      }
      const retry = t.closest('[data-retry]');
      if (retry) { const d = a.docs.find(x => x.id === retry.dataset.retry); const b = await blobOf(d); if (!b) { toast('The file is not on this device.', 'warn'); return; } d.status = 'reading'; draw(); process(d, b); return; }
      if (t.id === 'dq-go') {
        t.disabled = true; t.textContent = 'Preparing… (30–60 s)';
        try {
          const r = await A.docQuestions({ app: a, profile, stories, docs: a.docs });
          a.docQuestions = { at: new Date().toISOString(), items: (r.questions || []).filter(q => q && q.q), themes: r.themes || [] };
          await save(); draw(); toast(`${a.docQuestions.items.length} questions ready`);
        } catch (err) { toast(err.message, 'bad'); t.disabled = false; t.textContent = 'Prepare questions'; }
        return;
      }
      if (t.id === 'dq-copy') { copy(a.docQuestions.items.map((q, i) => `${i + 1}. ${q.q}\n   ${(q.answer_outline || []).map(x => '- ' + x).join('\n   ')}`).join('\n\n')); return; }
      if (t.id === 'dc-clear') { a.docChat = []; await save(); draw(); return; }
      const ca = t.closest('[data-copyask]'); if (ca) { copy(ca.dataset.copyask); return; }
    });
    // Two-step delete without browser dialogs.
    function confirmInline(btn) { if (btn.dataset.sure) return true; btn.dataset.sure = '1'; btn.textContent = 'Sure?'; btn.classList.add('danger'); setTimeout(() => { if (btn.isConnected) { delete btn.dataset.sure; btn.textContent = '✕'; btn.classList.remove('danger'); } }, 3000); return false; }

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
