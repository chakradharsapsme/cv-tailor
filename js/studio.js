/*
 * studio.js — "Studio" for the Documents page.
 * Briefing doc, study guide, FAQ, timeline + cast, flashcards, quiz, audio overview (free browser voices) and notes.
 * Everything is generated only from the uploaded documents; every item must quote its passage and is checked here.
 */
(function () {
  const { html, raw, toast, copy } = window.CVT.ui;
  const S = window.CVT.store, A = window.CVT.agent;

  const KINDS = [
    ['briefing', 'Briefing doc', 'A one-page brief: programme, scope, systems, people, pain points and risks.'],
    ['study', 'Study guide', 'Key terms explained, plus short-answer questions to test yourself.'],
    ['faq', 'FAQ', 'The questions you would want answered, answered from your documents.'],
    ['timeline', 'Timeline', 'Dates, phases and milestones in order, plus the cast of people and organisations.'],
    ['flashcards', 'Flashcards', 'Flip cards to memorise names, systems, numbers and dates.'],
    ['quiz', 'Quiz', 'Multiple choice with instant marking and the source for every answer.'],
    ['audio', 'Audio overview', 'A two-host spoken overview of your documents, read aloud by your browser’s free voices.'],
    ['notes', 'Notes', 'Your own notes and answers you pinned from “Ask about these documents”.']
  ];
  const LISTS = { briefing: d => (d.sections || []).map(s => s.points || []), study: d => [d.concepts || [], d.questions || []], faq: d => [d.items || []], timeline: d => [d.events || [], d.cast || []], flashcards: d => [d.cards || []], quiz: d => [d.questions || []] };
  const ui = new Map(); // per application: tab, card, flip, quiz answers, show quotes
  const pnum = ref => (String(ref || '').split('-')[1] || '').replace('P', '');
  const curRoot = () => document.getElementById('studio-root');
  const uid = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /** Drop every item whose quote isn't in the documents; label the rest with their source. */
  function verify(kind, data, passages, docs, found) {
    const byId = new Map(passages.map(p => [p.id, p]));
    const texts = docs.map(d => [d.name, (d.text || '') + '\n' + (d.note || '')]);
    let kept = 0, removed = 0;
    const check = it => {
      if (!it || typeof it !== 'object') return null;
      const p = byId.get(String(it.ref || '').trim());
      const inP = !!(it.quote && p && found(it.quote, p.text));
      const hit = inP ? [p.doc] : (it.quote ? texts.find(([, t]) => found(it.quote, t)) : null);
      if (kind === 'audio') { it.ok = !!hit; it.source = hit ? hit[0] : ''; if (!hit) { it.ref = ''; it.quote = ''; } return it; }
      if (!hit) { removed++; return null; }
      kept++; return Object.assign(it, { source: hit[0], ref: inP ? p.id : '' });
    };
    const d = JSON.parse(JSON.stringify(data || {}));
    if (kind === 'briefing') d.sections = (d.sections || []).map(s => Object.assign(s, { points: (s.points || []).map(check).filter(Boolean) })).filter(s => s.points.length);
    if (kind === 'study') { d.concepts = (d.concepts || []).map(check).filter(Boolean); d.questions = (d.questions || []).map(check).filter(Boolean); }
    if (kind === 'faq') d.items = (d.items || []).map(check).filter(Boolean);
    if (kind === 'timeline') { d.events = (d.events || []).map(check).filter(Boolean); d.cast = (d.cast || []).map(check).filter(Boolean); }
    if (kind === 'flashcards') d.cards = (d.cards || []).filter(c => c && c.front && c.back).map(check).filter(Boolean);
    if (kind === 'quiz') d.questions = (d.questions || []).filter(q => q && q.q && Array.isArray(q.options) && q.options.length >= 2 && q.options[q.answer] != null).map(check).filter(Boolean);
    if (kind === 'audio') { d.lines = (d.lines || []).filter(l => l && l.text).map(l => Object.assign(l, { host: l.host === 'B' ? 'B' : 'A' })).map(check); kept = d.lines.filter(l => l.ok).length; }
    const empty = kind === 'audio' ? !d.lines.length : LISTS[kind](d).every(x => !x.length);
    return { data: d, kept, removed, empty };
  }

  /** Plain-text version for Copy / Download. */
  function asText(kind, d) {
    const src = it => it.source ? ` [${it.source}]` : '';
    if (kind === 'briefing') return `${d.title || 'Briefing'}\n\n${d.summary || ''}\n\n` + (d.sections || []).map(s => `${s.heading}\n` + s.points.map(p => `- ${p.text}${src(p)}`).join('\n')).join('\n\n');
    if (kind === 'study') return 'KEY TERMS\n' + d.concepts.map(c => `- ${c.term}: ${c.explain}${src(c)}`).join('\n') + '\n\nQUESTIONS\n' + d.questions.map((q, i) => `${i + 1}. ${q.q}\n   ${q.answer}${src(q)}`).join('\n');
    if (kind === 'faq') return d.items.map(x => `Q: ${x.q}\nA: ${x.a}${src(x)}`).join('\n\n');
    if (kind === 'timeline') return 'TIMELINE\n' + d.events.map(e => `- ${e.when}: ${e.what}${src(e)}`).join('\n') + '\n\nCAST\n' + d.cast.map(c => `- ${c.name}: ${c.role}${src(c)}`).join('\n');
    if (kind === 'flashcards') return d.cards.map((c, i) => `${i + 1}. ${c.front}\n   ${c.back}${src(c)}`).join('\n');
    if (kind === 'quiz') return d.questions.map((q, i) => `${i + 1}. ${q.q}\n` + q.options.map((o, j) => `   ${'ABCD'[j] || j + 1}) ${o}`).join('\n') + `\n   Answer: ${'ABCD'[q.answer] || q.answer + 1}. ${q.explain || ''}${src(q)}`).join('\n\n');
    if (kind === 'audio') return `${d.title || 'Audio overview'}\n\n` + d.lines.map(l => `${l.host === 'A' ? 'Host A' : 'Host B'}: ${l.text}`).join('\n\n');
    return '';
  }

  // ---------------- audio: browser speech (free) ----------------
  const speech = { playing: false, paused: false, idx: -1, rate: 1, appId: null };
  function voices() {
    const all = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
    const en = all.filter(v => /^en(-|_)GB/i.test(v.lang)).concat(all.filter(v => /^en/i.test(v.lang) && !/^en(-|_)GB/i.test(v.lang)));
    const pool = en.length ? en : all;
    const a = pool[0] || null, b = pool.find(v => v !== a && v.lang === (a && a.lang)) || pool.find(v => v !== a) || a;
    return { A: a, B: b };
  }
  function mark(root) { if (!root) return; root.querySelectorAll('[data-line]').forEach(el => el.classList.toggle('speaking', +el.dataset.line === speech.idx)); const cur = root.querySelector(`[data-line="${speech.idx}"]`); if (cur) cur.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); const b = root.querySelector('[data-au="play"]'); if (b) b.textContent = speech.playing && !speech.paused ? '⏸ Pause' : speech.paused ? '▶ Resume' : '▶ Play'; }
  function stopSpeech() { speech.playing = false; speech.paused = false; speech.idx = -1; if (window.speechSynthesis) speechSynthesis.cancel(); }
  function speakFrom(lines, i, getRoot) {
    if (!window.speechSynthesis) { toast('This browser has no built-in voices. Read the transcript instead.', 'warn'); return; }
    speechSynthesis.cancel();
    const v = voices();
    const next = k => {
      if (!speech.playing || k >= lines.length) { if (k >= lines.length) { speech.playing = false; speech.idx = -1; } mark(getRoot()); return; }
      speech.idx = k; mark(getRoot());
      const u = new SpeechSynthesisUtterance(lines[k].text);
      const host = lines[k].host === 'B' ? 'B' : 'A';
      if (v[host]) u.voice = v[host];
      u.rate = speech.rate; u.pitch = host === 'B' ? 1.12 : 0.95;
      u.onend = () => { if (speech.playing && !speech.paused && speech.idx === k) next(k + 1); };
      u.onerror = () => { if (speech.playing && speech.idx === k) next(k + 1); };
      speechSynthesis.speak(u);
    };
    speech.playing = true; speech.paused = false; next(i);
  }

  // ---------------- view ----------------
  function mount(el, env) {
    const { a, readable, passagesOf, found, save, sig } = env;
    a.studio = a.studio || {}; a.docNotes = a.docNotes || [];
    if (!ui.has(a.id)) ui.set(a.id, { tab: 'briefing', card: 0, flip: false, known: new Set(), picks: {}, quotes: false, busy: null });
    const st = ui.get(a.id);
    const n = readable().length;

    const srcChip = () => '';
    const _srcChipOld = it => it && it.source ? html`<span class="src-chip" title="“${it.quote}” (${it.source}${it.ref ? ', passage ' + pnum(it.ref) : ''})">${it.source}${it.ref ? ' · p' + pnum(it.ref) : ''}</span>${st.quotes ? html`<blockquote class="mm-quote">“${it.quote}”</blockquote>` : ''}` : '';
    const body = (kind, d) => {
      if (kind === 'briefing') return html`<h3 class="st-title">${d.title || 'Briefing'}</h3>${d.summary ? html`<p class="st-lead">${d.summary}</p>` : ''}${(d.sections || []).map(s => html`<h4 class="st-h">${s.heading}</h4><ul class="st-points">${s.points.map(p => html`<li>${p.text} ${srcChip(p)}</li>`)}</ul>`)}`;
      if (kind === 'study') return html`<h4 class="st-h">Key terms</h4><dl class="st-terms">${d.concepts.map(c => html`<div><dt>${c.term}</dt><dd>${c.explain} ${srcChip(c)}</dd></div>`)}</dl>
        <h4 class="st-h">Test yourself</h4><div class="st-qa">${d.questions.map((q, i) => html`<details><summary><span class="dq-n">${i + 1}</span> ${q.q}</summary><p>${q.answer} ${srcChip(q)}</p></details>`)}</div>`;
      if (kind === 'faq') return html`<div class="st-qa">${d.items.map(x => html`<details><summary>${x.q}</summary><p>${x.a} ${srcChip(x)}</p></details>`)}</div>`;
      if (kind === 'timeline') return html`${d.events.length ? html`<h4 class="st-h">Timeline</h4><ol class="st-tl">${d.events.map(e => html`<li><span class="st-when">${e.when}</span><span>${e.what} ${srcChip(e)}</span></li>`)}</ol>` : html`<p class="muted small">No dated events found in your documents.</p>`}
        ${d.cast.length ? html`<h4 class="st-h">Cast</h4><div class="st-cast">${d.cast.map(c => html`<div class="st-person"><strong>${c.name}</strong><span class="small">${c.role}</span>${srcChip(c)}</div>`)}</div>` : ''}`;
      if (kind === 'flashcards') {
        const cards = d.cards; if (st.card >= cards.length) st.card = 0; const c = cards[st.card];
        return html`<div class="fc-bar small"><span>Card ${st.card + 1} of ${cards.length}</span><span>${st.known.size} marked known</span></div>
          <button type="button" class="fc ${st.flip ? 'flipped' : ''} ${st.known.has(st.card) ? 'known' : ''}" data-st="flip" aria-label="Flip card"><span class="fc-side">${st.flip ? 'Answer' : 'Prompt'}</span><span class="fc-text">${st.flip ? c.back : c.front}</span>${st.flip ? srcChip(c) : html`<span class="muted small">Click to flip</span>`}</button>
          <div class="fc-nav"><button class="btn ghost small" data-st="prev" type="button">← Previous</button><button class="btn ghost small" data-st="again" type="button">Again</button><button class="btn primary small" data-st="known" type="button">✓ Got it</button><button class="btn ghost small" data-st="next" type="button">Next →</button><button class="btn ghost small" data-st="shuffle" type="button">Shuffle</button><button class="btn ghost small" data-st="toprep" type="button">+ All to Prep cards</button></div>`;
      }
      if (kind === 'quiz') {
        const qs = d.questions, answered = Object.keys(st.picks).length, right = qs.filter((q, i) => st.picks[i] === q.answer).length;
        return html`<div class="fc-bar small"><span><strong>${right}</strong> right of ${answered} answered (${qs.length} questions)</span>${answered ? html`<button class="linkish small" data-st="retake" type="button">Retake</button>` : ''}</div>
          <ol class="quiz">${qs.map((q, i) => { const pick = st.picks[i]; const done = pick != null; return html`<li class="${done ? (pick === q.answer ? 'right' : 'wrong') : ''}"><p class="quiz-q">${q.q}</p><div class="quiz-opts">${q.options.map((o, j) => html`<button type="button" class="quiz-opt ${done && j === q.answer ? 'is-answer' : ''} ${done && j === pick && pick !== q.answer ? 'is-wrong' : ''}" data-qz="${i}:${j}" ${done ? raw('disabled') : ''}><b>${'ABCD'[j] || j + 1}</b> ${o}</button>`)}</div>${done ? html`<p class="small quiz-why">${pick === q.answer ? '✓ Correct. ' : '✗ Not quite. '}${q.explain || ''} ${srcChip(q)}</p>` : ''}</li>`; })}</ol>`;
      }
      if (kind === 'audio') {
        const has = !!window.speechSynthesis;
        return html`<div class="au-bar"><button class="btn primary small" data-au="play" type="button" ${has ? '' : raw('disabled')}>${speech.playing && speech.appId === a.id && !speech.paused ? '⏸ Pause' : '▶ Play'}</button><button class="btn ghost small" data-au="stop" type="button">■ Stop</button>
          <label class="small">Speed <select data-au="rate">${[0.85, 1, 1.15, 1.3].map(r => html`<option value="${r}" ${speech.rate === r ? raw('selected') : ''}>${r}×</option>`)}</select></label>
          <span class="muted small">${has ? 'Uses your browser’s free built-in voices. Click any line to start there.' : 'This browser has no built-in voices; read the transcript below.'}</span></div>
          <h3 class="st-title">${d.title || 'Audio overview'}</h3>
          <div class="au-lines">${d.lines.map((l, i) => html`<p class="au-line h${l.host}" data-line="${i}" tabindex="0"><b>${l.host === 'A' ? 'Host A' : 'Host B'}</b> ${l.text}</p>`)}</div>`;
      }
      return '';
    };
    const notesPane = () => html`<form class="st-note-add" data-st-form="note"><textarea id="st-note" rows="3" placeholder="Write a note: what to mention, what to ask, what surprised you…"></textarea><div class="row gap"><span class="grow-s"></span><button class="btn primary small" type="submit">Add note</button></div></form>
      ${a.docNotes.length ? html`<div class="st-notes">${a.docNotes.slice().reverse().map(x => html`<div class="st-note ${x.from ? 'pinned' : ''}"><div class="small muted">${x.from ? '📌 From Ask · ' + x.from : 'Your note'} · ${new Date(x.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}<button class="q-del" data-ndel="${x.id}" type="button" title="Delete note" aria-label="Delete note">🗑</button></div><div class="st-note-t">${x.text}</div></div>`)}</div>
        <div class="row gap wrap"><button class="btn ghost small" data-st="notes-copy" type="button">Copy all notes</button><button class="btn ghost small danger" data-st="notes-clear" type="button">🗑 Delete all notes</button></div>` : html`<p class="muted small">No notes yet. Add one above, or press “📌 Save to notes” under any answer in Ask.</p>`}`;

    const render = () => {
      const kind = st.tab, meta = KINDS.find(k => k[0] === kind), out = a.studio[kind];
      el.innerHTML = String(html`
        <div class="panel-head"><h2>Studio</h2><span class="muted small">Built only from your documents</span></div>
        <div class="st-tabs" role="tablist">${KINDS.map(([k, label]) => html`<button type="button" role="tab" data-sttab="${k}" aria-selected="${k === kind}">${label}${k === 'notes' ? html` <span>${a.docNotes.length}</span>` : a.studio[k] ? html` <span>✓</span>` : ''}</button>`)}</div>
        <div class="st-pane">
          <p class="hint">${meta[2]}</p>
          ${kind === 'notes' ? notesPane() : st.busy === kind ? html`<p><span class="spinner" aria-hidden="true"></span> Reading your documents and building the ${meta[1].toLowerCase()}… (30–90 s)</p>` : out ? html`
            <div class="st-meta small muted">Built ${new Date(out.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} from ${out.from}</div>
            <div class="st-actions"><button class="btn ghost small" data-st="copy" type="button">Copy</button><button class="btn ghost small" data-st="dl" type="button">Download</button><button class="btn ghost small" data-st="gen" type="button" ${n ? '' : raw('disabled')}>Regenerate</button><button class="btn ghost small danger" data-st="del" type="button">🗑 Delete</button></div>
            <div class="st-body st-${kind}">${body(kind, out.data)}</div>` : html`<button class="btn primary" data-st="gen" type="button" ${n ? '' : raw('disabled')}>Create ${meta[1].toLowerCase()}</button>${n ? '' : html`<p class="muted small">Add a readable document or notes first.</p>`}`}
        </div>`);
      if (kind === 'audio' && speech.appId === a.id) mark(el);
    };

    async function generate(kind) {
      const docs = readable(); if (!docs.length) { toast('Add a readable document first.', 'warn'); return; }
      st.busy = kind; render();
      try {
        const { passages, coverage } = passagesOf(docs);
        const r = await A.docStudio({ kind, app: a, passages });
        const v = verify(kind, r, passages, docs, found);
        if (v.empty) throw new Error('Nothing could be matched to your documents. Try again, or add clearer documents.');
        if (kind === 'flashcards') { st.card = 0; st.flip = false; st.known = new Set(); }
        if (kind === 'quiz') st.picks = {};
        if (kind === 'audio') stopSpeech();
        a.studio[kind] = { at: new Date().toISOString(), sig: sig(), ids: docs.map(x => x.id), from: `${docs.length} document${docs.length === 1 ? '' : 's'}${coverage < 100 ? ` (${coverage}% of the text)` : ''}`, kept: v.kept, removed: v.removed, data: v.data };
        await save(); toast(`${KINDS.find(k => k[0] === kind)[1]} ready`);
      } catch (e) { toast(e.message, 'bad'); }
      st.busy = null; if (el.isConnected) render(); else if (env.redraw) env.redraw();
    }

    el.onclick = async e => {
      const t = e.target;
      const tabB = t.closest('[data-sttab]'); if (tabB) { st.tab = tabB.dataset.sttab; render(); return; }
      const qz = t.closest('[data-qz]'); if (qz) { const [i, j] = qz.dataset.qz.split(':').map(Number); st.picks[i] = j; render(); return; }
      const nd = t.closest('[data-ndel]'); if (nd) { a.docNotes = a.docNotes.filter(x => x.id !== nd.dataset.ndel); await save(); render(); env.refreshJump && env.refreshJump(); return; }
      const line = t.closest('[data-line]'); if (line && !t.closest('.src-chip')) { speech.appId = a.id; speakFrom(a.studio.audio.data.lines, +line.dataset.line, curRoot); return; }
      const au = t.closest('[data-au]');
      if (au && au.dataset.au === 'play') {
        speech.appId = a.id;
        if (speech.playing && !speech.paused) { speech.paused = true; speechSynthesis.pause(); }
        else if (speech.paused) { speech.paused = false; speechSynthesis.resume(); }
        else speakFrom(a.studio.audio.data.lines, 0, curRoot);
        mark(el); return;
      }
      if (au && au.dataset.au === 'stop') { stopSpeech(); mark(el); return; }
      const b = t.closest('[data-st]'); if (!b) return;
      const act = b.dataset.st, kind = st.tab, out = a.studio[kind];
      if (act === 'gen') { generate(kind); return; }
      if (act === 'quotes') { st.quotes = b.checked; render(); return; }
      if (act === 'copy') { copy(asText(kind, out.data)); return; }
      if (act === 'dl') { window.CVT.ui.download(new Blob([asText(kind, out.data)], { type: 'text/plain' }), `${(a.company || 'job').replace(/\W+/g, '_')}_${kind}.txt`); return; }
      if (act === 'del') { if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Click again to delete'; b.classList.add('armed'); setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = '🗑 Delete'; b.classList.remove('armed'); } }, 4000); return; } if (kind === 'audio') stopSpeech(); delete a.studio[kind]; await save(); render(); toast('Deleted'); return; }
      const cards = out && out.data.cards;
      if (act === 'flip') { st.flip = !st.flip; render(); return; }
      if (act === 'next' || act === 'prev') { st.card = (st.card + (act === 'next' ? 1 : -1) + cards.length) % cards.length; st.flip = false; render(); return; }
      if (act === 'known') { st.known.add(st.card); st.card = (st.card + 1) % cards.length; st.flip = false; render(); return; }
      if (act === 'again') { st.known.delete(st.card); st.card = (st.card + 1) % cards.length; st.flip = false; render(); return; }
      if (act === 'shuffle') { out.data.cards = cards.map(c => [Math.random(), c]).sort((x, y) => x[0] - y[0]).map(x => x[1]); st.card = 0; st.flip = false; st.known = new Set(); await save(); render(); return; }
      if (act === 'toprep') {
        const cur = Object.assign({ p: {}, custom: [] }, (await S.getKV('drills', null)) || {});
        const topic = [a.role, a.company].filter(Boolean).join(' at ') || 'This job';
        const have = new Set((cur.custom || []).map(c => c.q));
        const add = cards.filter(c => !have.has(c.front)).map(c => ({ id: 'c' + uid(), deck: 'custom', q: c.front, a: c.back + (c.source ? `\n\n(From ${c.source})` : ''), topic }));
        cur.custom = (cur.custom || []).concat(add); await S.setKV('drills', cur); toast(add.length ? `${add.length} cards added to Prep → Drill cards (My cards)` : 'Already in Prep'); return;
      }
      if (act === 'retake') { st.picks = {}; render(); return; }
      if (act === 'notes-copy') { copy(a.docNotes.map(x => (x.from ? `[From Ask: ${x.from}]\n` : '') + x.text).join('\n\n')); return; }
      if (act === 'notes-clear') { if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Click again to delete'; b.classList.add('armed'); setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = '🗑 Delete all notes'; b.classList.remove('armed'); } }, 4000); return; } a.docNotes = []; await save(); render(); env.refreshJump && env.refreshJump(); return; }
    };
    el.onchange = e => { if (e.target.dataset.au === 'rate') { speech.rate = +e.target.value; if (speech.playing && speech.appId === a.id) speakFrom(a.studio.audio.data.lines, Math.max(0, speech.idx), curRoot); } };
    el.onsubmit = async e => {
      if (!e.target.matches('[data-st-form="note"]')) return; e.preventDefault();
      const v = el.querySelector('#st-note').value.trim(); if (!v) return;
      a.docNotes.push({ id: uid(), text: v, at: new Date().toISOString() }); await save(); render(); env.refreshJump && env.refreshJump();
    };
    render();
  }

  /** Add content from newly added documents to an existing Studio output (merged, no duplicates). Returns how many items were added. */
  async function extend(a, kind, newDocs, env) {
    const out = a.studio && a.studio[kind]; if (!out || kind === 'notes') return 0;
    const { passages } = env.passagesOf(newDocs);
    const r = await A.docStudio({ kind, app: a, passages });
    const v = verify(kind, r, passages, newDocs, env.found);
    if (v.empty) return 0;
    const d = out.data, n = v.data, k = x => String(x || '').trim().toLowerCase();
    let added = 0;
    const addU = (arr, items, f) => { const have = new Set(arr.map(f)); (items || []).forEach(i => { if (!have.has(f(i))) { arr.push(i); have.add(f(i)); added++; } }); return arr; };
    if (kind === 'briefing') (n.sections || []).forEach(s => { const m = (d.sections = d.sections || []).find(x => k(x.heading) === k(s.heading)); if (m) addU(m.points, s.points, p => k(p.text)); else { d.sections.push(s); added += s.points.length; } });
    if (kind === 'study') { addU(d.concepts = d.concepts || [], n.concepts, c => k(c.term)); addU(d.questions = d.questions || [], n.questions, q => k(q.q)); }
    if (kind === 'faq') addU(d.items = d.items || [], n.items, x => k(x.q));
    if (kind === 'timeline') { addU(d.events = d.events || [], n.events, e => k(e.when + e.what)); addU(d.cast = d.cast || [], n.cast, c => k(c.name)); }
    if (kind === 'flashcards') addU(d.cards = d.cards || [], n.cards, c => k(c.front));
    if (kind === 'quiz') addU(d.questions = d.questions || [], n.questions, q => k(q.q));
    if (kind === 'audio' && n.lines.length) { d.lines = (d.lines || []).concat([{ host: 'A', text: `Now for something new: ${newDocs.map(x => x.name).join(' and ')}.`, source: newDocs.length === 1 ? newDocs[0].name : '' }], n.lines); added += n.lines.length; }
    out.kept = (out.kept || 0) + v.kept; out.removed = (out.removed || 0) + v.removed; out.at = new Date().toISOString();
    return added;
  }
  /** Remove everything that came from a deleted document. */
  function prune(a, docName) {
    Object.entries(a.studio || {}).forEach(([kind, out]) => {
      const d = out.data, keep = x => x.source !== docName;
      if (kind === 'briefing') d.sections = (d.sections || []).map(s => Object.assign(s, { points: s.points.filter(keep) })).filter(s => s.points.length);
      if (kind === 'study') { d.concepts = (d.concepts || []).filter(keep); d.questions = (d.questions || []).filter(keep); }
      if (kind === 'faq') d.items = (d.items || []).filter(keep);
      if (kind === 'timeline') { d.events = (d.events || []).filter(keep); d.cast = (d.cast || []).filter(keep); }
      if (kind === 'flashcards') d.cards = (d.cards || []).filter(keep);
      if (kind === 'quiz') d.questions = (d.questions || []).filter(keep);
      if (kind === 'audio') d.lines = (d.lines || []).filter(l => !l.source || l.source !== docName);
      const empty = kind === 'audio' ? !(d.lines || []).length : LISTS[kind](d).every(x => !x.length);
      if (empty) delete a.studio[kind];
    });
  }

  /** Pin an Ask answer into Notes. */
  function pin(a, q, text) { a.docNotes = a.docNotes || []; a.docNotes.push({ id: uid(), from: q, text, at: new Date().toISOString() }); }
  function open(appId, tab) { const s = ui.get(appId); if (s) s.tab = tab; else ui.set(appId, { tab, card: 0, flip: false, known: new Set(), picks: {}, quotes: false, busy: null }); }

  window.CVT.studio = { mount, pin, open, verify, asText, extend, prune, KINDS, stop: stopSpeech };
})();
