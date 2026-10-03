/*
 * myqs.js — "My questions" tab: questions you add yourself (expected, asked in an interview, or to ask them),
 * with your answer notes, free AI answer help, practice tracking and Prep cards.
 */
(function () {
  const { html, raw, $, toast, copy } = window.CVT.ui;
  const S = window.CVT.store, A = window.CVT.agent;
  const uid = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const KIND = { expect: 'I expect to be asked', asked: 'I was asked', ask: 'To ask them' };
  const KSHORT = { expect: 'Expected', asked: 'Was asked', ask: 'To ask them' };

  // ---------- Upload: read questions out of files (all in the browser, free) ----------
  const QWORD = /^(what|why|how|when|where|who|which|whom|whose|can|could|would|will|should|do|does|did|is|are|was|were|have|has|tell|describe|explain|walk|give|talk|share|define|list|compare|outline|discuss|imagine|suppose|if)\b/i;
  const stripNo = x => String(x || '').replace(/^\s*(?:q(?:uestion)?\s*\d*\s*[:.)\-]|\d+\s*[.):\-]|[-•*▪●◦]|\(\w\))\s*/i, '').replace(/\s+/g, ' ').trim();
  const ANS = /^\s*(?:a|ans|answer|my answer|notes?)\s*[:\-]\s*/i;
  /** Plain text → [{q, notes}]. Lines with "?" (or numbered / question-word lines) are questions; "A:"/"Answer:" lines and the text under a question become its notes. */
  function fromText(t) {
    const lines = String(t || '').replace(/\r/g, '').replace(/\[Page \d+\]/g, '').split('\n').map(x => x.trim());
    const hasQ = lines.some(l => /\?\s*$/.test(l));
    const listed = l => /^\s*(?:q(?:uestion)?\s*\d+|\d+\s*[.):\-]|[-•*▪●◦])/i.test(l);
    const isQ = l => { const c = stripNo(l); if (c.length < 6 || c.length > 400 || ANS.test(l)) return false; return hasQ ? (/\?/.test(c) || (listed(l) && QWORD.test(c))) : true; };
    const out = []; let cur = null, inAns = false;
    for (const l of lines) {
      if (!l) { inAns = false; continue; }
      if (isQ(l)) { cur = { q: stripNo(l), notes: '' }; out.push(cur); inAns = false; continue; }
      // Only text marked as an answer ("A:", "Answer:", "Notes:") and the lines straight after it become notes.
      if (cur && hasQ && (ANS.test(l) || inAns)) { cur.notes = (cur.notes ? cur.notes + '\n' : '') + l.replace(ANS, ''); inAns = true; }
    }
    out.forEach(x => { x.notes = x.notes.trim().slice(0, 4000); });
    return out;
  }
  /** Rows (first row may be headers) → [{q, notes}]: uses a "Question" column and an "Answer/Notes" column when present. */
  function fromRows(rows) {
    rows = rows.map(r => r.map(c => String(c ?? '').trim())).filter(r => r.some(Boolean));
    if (!rows.length) return [];
    const h = rows[0].map(c => c.toLowerCase());
    let qi = h.findIndex(c => /question|^q$|prompt/.test(c)), ai = h.findIndex(c => /answer|notes?|response|^a$/.test(c));
    let start = 1;
    if (qi < 0) { start = 0; qi = 0; let best = -1; (rows[0] || []).forEach((_, i) => { const n = rows.reduce((m, r) => m + (r[i] || '').length, 0); if (n > best) { best = n; qi = i; } }); ai = -1; }
    return rows.slice(start).map(r => ({ q: stripNo(r[qi]), notes: ai >= 0 ? (r[ai] || '').slice(0, 4000) : '' })).filter(x => x.q.length >= 6 && x.q.length <= 400);
  }
  function csvRows(t) {
    const rows = []; let row = [], cell = '', q = false;
    const sep = (t.split('\n')[0].match(/\t/g) || []).length > (t.split('\n')[0].match(/,/g) || []).length ? '\t' : ',';
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
      else if (c === '"') q = true; else if (c === sep) { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c;
    }
    row.push(cell); rows.push(row); return rows;
  }
  async function xlsxRows(blob) {
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const un = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    const ssx = zip.file('xl/sharedStrings.xml') ? await zip.file('xl/sharedStrings.xml').async('string') : '';
    const ss = [...ssx.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => un([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('')));
    const sheets = Object.keys(zip.files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort();
    let all = [];
    for (const n of sheets) {
      const x = await zip.file(n).async('string');
      for (const r of x.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
        const row = [];
        for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const ref = (c[1].match(/r="([A-Z]+)/) || [])[1] || 'A'; const col = ref.split('').reduce((m, ch) => m * 26 + ch.charCodeAt(0) - 64, 0) - 1;
          const t = (c[1].match(/t="(\w+)"/) || [])[1]; const inner = c[2] || '';
          const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          row[col] = t === 's' ? ss[+v] || '' : t === 'inlineStr' ? un([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(y => y[1]).join('')) : un(v || '');
        }
        all.push(Array.from(row, x => x || ''));
      }
      if (all.length) break; // first sheet with data
    }
    return all;
  }
  /** One file → [{q, notes}] */
  async function readQuestions(f) {
    const n = (f.name || '').toLowerCase();
    if (n.endsWith('.xlsx')) return fromRows(await xlsxRows(f));
    if (/\.(csv|tsv)$/.test(n)) return fromRows(csvRows(await f.text()));
    const D = window.CVT.docs, kind = D && D.kindOf ? D.kindOf(f) : 'text';
    if (kind === 'pdf') { const r = D.pdfText ? await D.pdfText(f) : await D.extract({ kind, name: f.name }, f); if (!(r.text || '').replace(/\[Page \d+\]/g, '').trim()) throw new Error(`${f.name}: this PDF is a scan with no text; type or paste the questions instead`); return fromText(r.text); }
    if (kind === 'word') { const r = await D.extract({ kind, name: f.name }, f); return fromText(r.text); }
    if (kind === 'text' || /\.(txt|md)$/.test(n)) return fromText(await f.text());
    throw new Error(`${f.name}: use .txt, .docx, .pdf, .xlsx or .csv`);
  }

  async function tab(ctx) {
    const { a, body, profile } = ctx;
    a.myQs = a.myQs || [];
    const stories = (await S.getKV('stories', []) || []);
    const save = () => ctx.saveNow();
    const saveSoon = () => (ctx.saveSoon ? ctx.saveSoon() : save());
    const open = new Set(); let filter = 'all'; const busy = new Set(); let pending = null, upKind = 'expect', reading = '';
    const readable = () => (a.docs || []).filter(d => d.use !== false && ((d.text || '').trim() || (d.note || '').trim()));
    const engine = () => { const st = window.CVT.ui.state || {}; return st.provider === 'claude-plan' ? 'the built-in AI, no extra cost' : 'your free Gemini model'; };

    const card = (q, i) => html`<li class="dq ${q.practised ? 'done' : ''}"><details data-k="${q.id}" ${open.has(q.id) ? raw('open') : ''}>
      <summary><span class="dq-n">${q.practised ? '✓' : i + 1}</span><span class="dq-body"><span class="dq-q">${q.q}</span><span class="dq-meta"><span class="chip ${q.kind === 'ask' ? 'accent' : q.kind === 'asked' ? 'warn' : 'muted'}">${KSHORT[q.kind] || 'Question'}</span>${(q.notes || '').trim() ? html`<span>· your notes</span>` : ''}${q.help ? html`<span>· answer help</span>` : ''}${q.inPrep ? html`<span>· in Prep</span>` : ''}</span></span><button class="q-del" data-mdel="${q.id}" type="button" title="Delete this question" aria-label="Delete question">🗑</button></summary>
      <div class="dq-more">
        <div class="row gap wrap">
          <label class="small">Type <select data-mkind="${q.id}">${Object.entries(KIND).map(([k, v]) => html`<option value="${k}" ${q.kind === k ? raw('selected') : ''}>${v}</option>`)}</select></label>
          <label class="small grow-s">Question <input type="text" data-mq="${q.id}" value="${q.q}"></label>
        </div>
        <label class="small dq-notes-l">${q.kind === 'ask' ? 'Their answer / what you learned' : 'Your answer'}<textarea class="dq-notes" data-mn="${q.id}" rows="4" placeholder="${q.kind === 'ask' ? 'Note what they said, so you can use it in the next round.' : 'Draft your answer in your own words: situation, what you did, the result.'}">${q.notes || ''}</textarea></label>
        ${busy.has(q.id) ? html`<p class="small"><span class="spinner" aria-hidden="true"></span> Working on it…</p>` : q.help ? html`<div class="doc-check ok my-help">
          <strong class="small">${q.kind === 'ask' ? 'How to ask it' : 'Answer help'}</strong>
          ${(q.help.outline || []).length ? html`<ul class="tight small">${q.help.outline.map(x => html`<li>${x}</li>`)}</ul>` : ''}
          ${q.help.answer ? html`<p class="small"><strong>${q.kind === 'ask' ? 'Polished question:' : 'Sample answer:'}</strong> ${q.help.answer}</p>` : ''}
          ${(q.help.listen_for || []).length ? html`<p class="small"><strong>${q.kind === 'ask' ? 'Listen for:' : 'Avoid:'}</strong> ${q.help.listen_for.join(' · ')}</p>` : ''}
          ${(q.help.follow_ups || []).length ? html`<p class="small"><strong>Likely follow-ups:</strong> ${q.help.follow_ups.join(' · ')}</p>` : ''}
          <p class="muted small">Built from your Career profile and stories${q.help.docs ? ` and ${q.help.docs} matching passage${q.help.docs === 1 ? '' : 's'} from your documents` : ''}. Check it before you use it.</p>
          <div class="row gap wrap">${q.kind !== 'ask' ? html`<button class="btn ghost small" data-muse="${q.id}" type="button">Use as my answer</button>` : ''}</div>
        </div>` : ''}
        <div class="dq-acts">
          <button class="btn ${q.help ? 'ghost' : 'primary'} small" data-mhelp="${q.id}" type="button">${q.help ? 'Redo answer help' : '✨ Get answer help'}</button>
          <button class="btn ${q.practised ? 'ghost' : 'primary'} small" data-mprac="${q.id}" type="button">${q.practised ? 'Mark as not practised' : '✓ Mark practised'}</button>
          <button class="btn ghost small" data-mprep="${q.id}" type="button" ${q.inPrep ? raw('disabled') : ''}>${q.inPrep ? 'Added to Prep cards' : '+ Add to Prep cards'}</button>
          <button class="btn ghost small" data-mcopy="${q.id}" type="button">Copy</button>
        </div>
      </div></details></li>`;

    const draw = () => {
      const all = a.myQs, done = all.filter(q => q.practised).length, pct = all.length ? Math.round(100 * done / all.length) : 0;
      const shown = all.filter(q => filter === 'all' || (filter === 'todo' ? !q.practised : q.kind === filter));
      const f = (k, label, n) => html`<button type="button" class="dq-f" data-mf="${k}" aria-pressed="${filter === k}">${label} <span>${n}</span></button>`;
      const docQs = ((a.docQuestions && a.docQuestions.items) || []).filter(x => !all.some(q => q.q.trim().toLowerCase() === x.q.trim().toLowerCase()));
      body.innerHTML = String(html`<div class="myq-grid">
        <section class="panel">
          <div class="panel-head"><h2>Add your own questions</h2></div>
          <p class="hint">Questions you expect, questions you were actually asked in a round, or questions you want to ask them. One per line to add several at once.</p>
          <form id="mq-form" class="myq-add">
            <textarea id="mq-text" rows="4" placeholder="e.g. How would you handle a supplier refusing to use Ariba Network?&#10;Why are you leaving your current role?"></textarea>
            <div class="row gap wrap"><label class="small">Type <select id="mq-kind">${Object.entries(KIND).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label><span class="grow-s"></span><button class="btn primary" type="submit">Add</button></div>
          </form>
          <div class="myq-up">
            <label class="dropzone" id="mq-dz">
              <input type="file" id="mq-file" multiple hidden accept=".txt,.md,.docx,.pdf,.xlsx,.csv,.tsv">
              <strong>📄 Upload questions from files</strong>
              <span class="muted small">Drop or choose one or more files: Word, PDF, Excel, CSV or text. Applywise picks out the questions (and any answers under them) so you can tick which to add.</span>
            </label>
            ${reading ? html`<p class="small"><span class="spinner" aria-hidden="true"></span> ${reading}</p>` : ''}
            ${pending ? html`<div class="myq-review">
              <div class="row gap wrap"><strong>${pending.length} question${pending.length === 1 ? '' : 's'} found</strong><span class="muted small">${pending.filter(x => x.dup).length ? `${pending.filter(x => x.dup).length} already in your list (unticked)` : ''}</span><span class="grow-s"></span>
                <button class="linkish small" id="mq-up-all" type="button">Tick all</button><button class="linkish small" id="mq-up-none" type="button">Untick all</button></div>
              <ol class="myq-rlist">${pending.map((x, i) => html`<li><label class="check-line"><input type="checkbox" data-mup="${i}" ${x.on ? raw('checked') : ''}> <span><span>${x.q}</span>${x.notes ? html`<span class="muted small"> · answer included</span>` : ''}${x.dup ? html`<span class="chip warn">already added</span>` : ''}<span class="muted small"> · ${x.src}</span></span></label></li>`)}</ol>
              <div class="row gap wrap"><label class="small">Add as <select id="mq-up-kind">${Object.entries(KIND).map(([k, v]) => html`<option value="${k}" ${upKind === k ? raw('selected') : ''}>${v}</option>`)}</select></label><span class="grow-s"></span>
                <button class="btn ghost small" id="mq-up-cancel" type="button">Cancel</button><button class="btn primary" id="mq-up-add" type="button">Add ${pending.filter(x => x.on).length} selected</button></div>
            </div>` : ''}
          </div>
          ${docQs.length ? html`<p class="small muted">You also have ${docQs.length} question${docQs.length === 1 ? '' : 's'} from your Documents. <button class="linkish small" id="mq-import" type="button">Copy them here</button></p>` : ''}
        </section>
        <section class="panel">
          <div class="panel-head"><h2>My questions</h2>${all.length ? html`<div class="row gap wrap"><button class="btn ghost small" id="mq-copy" type="button">Copy all</button><button class="btn ghost small" id="mq-dl" type="button">Download</button><button class="btn ghost small" id="mq-prep" type="button">+ All to Prep</button><button class="btn ghost small danger" id="mq-clear" type="button">🗑 Delete all</button></div>` : ''}</div>
          ${all.length ? html`<p class="hint">Answer help uses ${engine()}. It uses only your Career profile, your stories and matching passages from your documents; it never invents experience.</p>
          <div class="dq-tools"><div class="dq-prog"><span class="small"><strong>${done}</strong> of ${all.length} practised</span><span class="dq-bar" aria-hidden="true"><i style="width:${pct}%"></i></span></div>
            <div class="dq-filters">${f('all', 'All', all.length)}${f('todo', 'Not practised', all.length - done)}${Object.keys(KIND).map(k => all.some(q => q.kind === k) ? f(k, KSHORT[k], all.filter(q => q.kind === k).length) : '')}</div></div>
          ${shown.length ? html`<ol class="dq-list">${shown.map(q => card(q, all.indexOf(q)))}</ol>` : html`<p class="muted small">No questions match this filter.</p>`}` : html`<p class="empty-note">No questions yet. Add the ones you expect, or the ones you were asked after each round.</p>`}
        </section>
      </div>`);
    };
    draw();

    const find = id => a.myQs.find(q => q.id === id);
    const text = (q, i) => `${i + 1}. [${KSHORT[q.kind]}] ${q.q}${(q.notes || '').trim() ? '\n   ' + (q.kind === 'ask' ? 'Their answer: ' : 'My answer: ') + q.notes.trim() : ''}${q.help && (q.help.outline || []).length ? '\n   Points: ' + q.help.outline.join('; ') : ''}`;
    async function toPrep(list) {
      const cur = Object.assign({ p: {}, custom: [] }, (await S.getKV('drills', null)) || {});
      const topic = [a.role, a.company].filter(Boolean).join(' at ') || 'This job';
      const fresh = list.filter(q => !q.inPrep && q.kind !== 'ask');
      cur.custom = (cur.custom || []).concat(fresh.map(q => ({ id: 'c' + uid(), deck: 'custom', q: q.q, a: (q.notes || '').trim() || (q.help && q.help.answer) || ((q.help && q.help.outline) || []).map(x => '• ' + x).join('\n') || 'Answer from your experience.', topic })));
      await S.setKV('drills', cur); fresh.forEach(q => { q.inPrep = true; }); await save(); draw();
      toast(fresh.length ? `${fresh.length} added to Prep → Drill cards (My cards)` : 'Nothing new to add (questions to ask them stay here)');
    }
    async function help(q) {
      if (busy.has(q.id)) return;
      busy.add(q.id); open.add(q.id); draw();
      try {
        const D = window.CVT.docs; let passages = [];
        const docs = readable();
        if (docs.length && D && D.passagesOf) passages = D.retrieve(D.passagesOf(docs, Infinity).passages, q.q, { k: 6, chars: 6000 });
        const r = await A.myAnswer({ app: a, profile, stories, question: q.q, kind: q.kind, passages });
        q.help = { outline: r.outline || [], answer: r.answer || '', listen_for: r.listen_for || [], follow_ups: r.follow_ups || [], docs: passages.length, at: new Date().toISOString() };
      } catch (e) { toast(e.message, 'bad'); }
      busy.delete(q.id); await save(); draw();
    }

    async function upload(files) {
      files = [...(files || [])]; if (!files.length) return;
      const have = new Set(a.myQs.map(q => q.q.trim().toLowerCase()));
      const found = (pending || []).slice(); const errs = [];
      for (const f of files) {
        reading = `Reading ${f.name}…`; draw();
        try {
          const qs = await readQuestions(f);
          if (!qs.length) errs.push(`${f.name}: no questions found`);
          qs.forEach(x => { const k = x.q.toLowerCase(); if (found.some(y => y.q.toLowerCase() === k)) return; const dup = have.has(k); found.push({ q: x.q, notes: x.notes || '', dup, on: !dup, src: f.name }); });
        } catch (e) { errs.push(e.message.startsWith(f.name) ? e.message : `${f.name}: ${e.message}`); }
      }
      reading = ''; pending = found.length ? found : null; draw();
      if (errs.length) toast(errs.join(' · '), 'warn');
      else if (found.length) toast(`${found.length} question${found.length === 1 ? '' : 's'} found. Tick the ones to add.`);
    }
    body.addEventListener('dragover', e => { const z = e.target.closest && e.target.closest('#mq-dz'); if (z) { e.preventDefault(); z.classList.add('over'); } });
    body.addEventListener('dragleave', e => { const z = e.target.closest && e.target.closest('#mq-dz'); if (z) z.classList.remove('over'); });
    body.addEventListener('drop', e => { const z = e.target.closest && e.target.closest('#mq-dz'); if (!z) return; e.preventDefault(); z.classList.remove('over'); upload(e.dataTransfer.files); });
    body.addEventListener('toggle', e => { const k = e.target.dataset && e.target.dataset.k; if (!k) return; if (e.target.open) open.add(k); else open.delete(k); }, true);
    body.addEventListener('submit', async e => {
      if (e.target.id !== 'mq-form') return; e.preventDefault();
      const kind = $('#mq-kind', body).value;
      const lines = $('#mq-text', body).value.split('\n').map(x => x.replace(/^\s*(\d+[.)]|[-•*])\s*/, '').trim()).filter(x => x.length > 3);
      if (!lines.length) { toast('Type a question first', 'warn'); return; }
      lines.forEach(q => a.myQs.push({ id: uid(), q, kind, notes: '', at: new Date().toISOString() }));
      await save(); draw(); toast(`${lines.length} question${lines.length === 1 ? '' : 's'} added`);
    });
    body.addEventListener('input', e => {
      const n = e.target.dataset.mn, t = e.target.dataset.mq;
      if (n) { find(n).notes = e.target.value; saveSoon(); }
      if (t) { find(t).q = e.target.value; saveSoon(); }
    });
    body.addEventListener('change', async e => {
      if (e.target.id === 'mq-file') { const fl = e.target.files; await upload(fl); return; }
      if (e.target.dataset.mup !== undefined) { pending[+e.target.dataset.mup].on = e.target.checked; draw(); return; }
      if (e.target.id === 'mq-up-kind') { upKind = e.target.value; return; }
    });
    body.addEventListener('change', async e => { const k = e.target.dataset.mkind; if (k) { const q = find(k); q.kind = e.target.value; q.help = null; await save(); draw(); } });
    body.addEventListener('click', async e => {
      const t = e.target;
      const b = (attr) => t.closest(`[data-${attr}]`);
      let x;
      if ((x = b('mf'))) { filter = x.dataset.mf; draw(); return; }
      if ((x = b('mdel'))) { e.preventDefault(); a.myQs = a.myQs.filter(q => q.id !== x.dataset.mdel); await save(); draw(); toast('Question deleted'); return; }
      if ((x = b('mhelp'))) { help(find(x.dataset.mhelp)); return; }
      if ((x = b('mprac'))) { const q = find(x.dataset.mprac); q.practised = !q.practised; await save(); draw(); return; }
      if ((x = b('mprep'))) { await toPrep([find(x.dataset.mprep)]); return; }
      if ((x = b('mcopy'))) { const q = find(x.dataset.mcopy); copy(text(q, a.myQs.indexOf(q))); return; }
      if ((x = b('muse'))) { const q = find(x.dataset.muse); q.notes = q.help.answer; await save(); draw(); toast('Copied into your answer. Edit it to sound like you.'); return; }
      if (t.id === 'mq-import') { const have = new Set(a.myQs.map(q => q.q.trim().toLowerCase())); const add = a.docQuestions.items.filter(x => !have.has(x.q.trim().toLowerCase())).map(x => ({ id: uid(), q: x.q, kind: 'expect', notes: x.notes || '', practised: !!x.practised, at: new Date().toISOString() })); a.myQs = a.myQs.concat(add); await save(); draw(); toast(`${add.length} copied from Documents`); return; }
      if (t.id === 'mq-up-all' || t.id === 'mq-up-none') { pending.forEach(x => { x.on = t.id === 'mq-up-all'; }); draw(); return; }
      if (t.id === 'mq-up-cancel') { pending = null; draw(); return; }
      if (t.id === 'mq-up-add') {
        const pick = pending.filter(x => x.on); if (!pick.length) { toast('Tick at least one question', 'warn'); return; }
        const now = new Date().toISOString();
        pick.forEach(x => a.myQs.push({ id: uid(), q: x.q, kind: upKind, notes: x.notes, at: now }));
        pending = null; await save(); draw(); toast(`${pick.length} question${pick.length === 1 ? '' : 's'} added`); return;
      }
      if (t.id === 'mq-copy') { copy(a.myQs.map(text).join('\n\n')); return; }
      if (t.id === 'mq-dl') { window.CVT.ui.download(new Blob([`My questions: ${[a.role, a.company].filter(Boolean).join(' at ')}\n\n` + a.myQs.map(text).join('\n\n')], { type: 'text/plain' }), `${(a.company || 'job').replace(/\W+/g, '_')}_my_questions.txt`); return; }
      if (t.id === 'mq-prep') { await toPrep(a.myQs); return; }
      if (t.id === 'mq-clear') { if (!t.dataset.sure) { t.dataset.sure = '1'; t.textContent = 'Click again to delete'; t.classList.add('armed'); setTimeout(() => { if (t.isConnected) { delete t.dataset.sure; t.textContent = '🗑 Delete all'; t.classList.remove('armed'); } }, 4000); return; } a.myQs = []; await save(); draw(); toast('All deleted'); return; }
    });
  }

  window.CVT.myqs = { tab };
})();
