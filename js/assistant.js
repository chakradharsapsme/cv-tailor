/*
 * assistant.js — "Ask AI" on every application: a chat drawer that answers any question about the job,
 * the company, your CV and fit, interviews, salary, or any other topic. It knows the advert, the fit
 * analysis, your (tailored) CV, your profile and the documents you uploaded for this application.
 * The conversation is saved with the application.
 */
(function () {
  const { html, raw, esc, toast } = window.CVT.ui;
  const S = window.CVT.store, A = window.CVT.agent;
  const MAX = 40;

  async function context(a) {
    const p = await S.getProfile();
    const an = a.analysis && !a.analysis.legacy ? a.analysis : null;
    let cv = '';
    try { cv = await window.CVT.engine.cvText(a); } catch (_) {}
    const parts = [
      `JOB: ${a.role || '(role not given)'} at ${a.company || '(company not given)'}${a.location ? ' · ' + a.location : ''}${a.contractType ? ' · ' + a.contractType : ''}${a.pay ? ' · pay: ' + a.pay : ''}${a.status ? ' · status: ' + a.status : ''}`,
      a.jd ? 'JOB ADVERT:\n' + a.jd.slice(0, 7000) : '(no advert pasted yet)',
      an ? `FIT ANALYSIS: score ${an.fit && an.fit.score}/100; advice: ${(an.decision && an.decision.verdict) || ''}. ${(an.decision && an.decision.headline) || ''} ${(an.decision && an.decision.angle) ? 'Angle: ' + an.decision.angle : ''}
Requirements vs evidence: ${(an.requirements || []).map(r => `${r.req} [${r.type}, ${r.evidence}]${r.note ? ': ' + r.note : ''}`).join('; ').slice(0, 2500)}
Red flags: ${((an.decision && an.decision.red_flags) || []).join('; ')}
Keywords: ${(an.keywords || []).join(', ').slice(0, 600)}` : '(no fit analysis yet)',
      cv ? 'CANDIDATE CV:\n' + cv.slice(0, 7000) : '(no CV)',
      'CANDIDATE PROFILE:\n' + A.profileBlock(p).slice(0, 2500),
      a.letter ? 'COVER LETTER DRAFT:\n' + a.letter.slice(0, 2500) : '',
      a.interview && a.interview.questions ? 'INTERVIEW PREP QUESTIONS: ' + a.interview.questions.map(q => q.q || q.question || '').filter(Boolean).slice(0, 12).join(' | ') : '',
      a.notes ? 'CANDIDATE NOTES: ' + a.notes.slice(0, 1500) : ''
    ];
    return parts.filter(Boolean).join('\n\n');
  }
  /** The most relevant passages from documents uploaded to this application. */
  function docsFor(a, q) {
    const D = window.CVT.docs;
    const docs = (a.docs || []).filter(d => d.use !== false && ((d.text || '').trim() || (d.note || '').trim()));
    if (!D || !docs.length) return '';
    try {
      const { passages } = D.passagesOf(docs);
      const top = D.retrieve(passages, q, { k: 8, chars: 6000 });
      return top.length ? 'FROM THE DOCUMENTS YOU UPLOADED:\n' + top.map(x => `[${x.doc}] ${x.text}`).join('\n') : '';
    } catch (_) { return ''; }
  }
  // Light formatting for answers: paragraphs, bullets, bold.
  function render(t) {
    const lines = String(t || '').replace(/\r/g, '').split('\n');
    let out = '', list = false;
    const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    lines.forEach(l => {
      const m = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (m) { if (!list) { out += '<ul>'; list = true; } out += `<li>${inline(m[1])}</li>`; return; }
      if (list) { out += '</ul>'; list = false; }
      if (l.trim()) out += `<p>${inline(l)}</p>`;
    });
    if (list) out += '</ul>';
    return out;
  }

  function starters(a) {
    const an = a.analysis && !a.analysis.legacy ? a.analysis : null;
    const gap = an && (an.requirements || []).find(r => r.evidence === 'gap');
    const gapText = gap && gap.req;
    return [
      `Why am I a good fit for this ${a.role || 'role'}?`,
      a.company ? `What should I know about ${a.company} before applying?` : 'What should I research about this company?',
      'What questions are they likely to ask me, and how should I answer?',
      gapText ? `How do I handle the gap: ${String(gapText).slice(0, 60)}?` : 'What are the weakest points in my application?',
      'What salary or day rate should I ask for?',
      'Write a short LinkedIn message to the hiring manager'
    ];
  }

  /** Open the drawer for application `id`. */
  async function open(id) {
    let a = await S.getApp(id); if (!a) return;
    document.querySelectorAll('.ask-drawer').forEach(x => x.remove());
    const d = document.createElement('aside');
    d.className = 'ask-drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Ask AI about this application');
    document.body.append(d);
    let busy = false, ctl = null;
    const draw = () => {
      const chat = a.chat || [];
      d.innerHTML = String(html`
        <div class="ask-head"><div><strong>Ask AI</strong><span class="muted small"> · ${a.role || 'this application'}${a.company ? ' at ' + a.company : ''}</span></div>
          <div class="row gap">${chat.length ? html`<button class="linkish small" type="button" data-k="clear">Clear chat</button>` : ''}<button class="icon-btn" type="button" data-k="close" aria-label="Close">×</button></div></div>
        <div class="ask-log" id="ask-log">
          ${chat.length ? '' : html`<div class="ask-intro"><p>Ask anything: this job and company, your fit and CV, interview answers, salary, the industry, or any other topic. Answers use this application's advert, your CV, the fit analysis and your uploaded documents.</p>
            <div class="ask-chips">${starters(a).map(q => html`<button type="button" class="chip-btn" data-q="${q}">${q}</button>`)}</div></div>`}
          ${chat.map(m => html`<div class="ask-q">${m.q}</div><div class="ask-a">${raw(render(m.a))}${(m.follow || []).length ? html`<div class="ask-chips">${m.follow.map(q => html`<button type="button" class="chip-btn" data-q="${q}">${q}</button>`)}</div>` : ''}</div>`)}
          ${busy ? html`<div class="ask-a ask-wait">Thinking…</div>` : ''}
        </div>
        <form class="ask-form" id="ask-form"><textarea id="ask-in" rows="2" placeholder="Ask about this job, the company, your CV… or anything" aria-label="Your question" ${busy ? raw('disabled') : ''}></textarea>
          ${busy ? html`<button class="btn ghost" type="button" data-k="stop">Stop</button>` : html`<button class="btn primary" type="submit">Ask</button>`}</form>`);
      const log = d.querySelector('#ask-log'); log.scrollTop = log.scrollHeight;
      const inp = d.querySelector('#ask-in'); if (inp && !busy) inp.focus({ preventScroll: true });
    };
    async function askQ(q) {
      q = String(q || '').trim(); if (!q || busy) return;
      busy = true; a.chat = a.chat || []; a.chat.push({ q, a: '', at: new Date().toISOString() }); draw();
      const msg = a.chat[a.chat.length - 1];
      try {
        ctl = new AbortController();
        const ctx = [await context(a), docsFor(a, q)].filter(Boolean).join('\n\n');
        const r = await A.appChat({ context: ctx, history: a.chat.slice(0, -1), question: q, signal: ctl.signal });
        msg.a = (r && r.answer) || 'No answer came back. Try asking again.'; msg.follow = ((r && r.follow_ups) || []).slice(0, 3);
      } catch (e) {
        if (e.name === 'AbortError') { a.chat.pop(); } else { msg.a = 'Sorry, that did not work: ' + e.message; }
      }
      busy = false; ctl = null;
      a.chat = a.chat.slice(-MAX);
      const fresh = await S.getApp(a.id); if (fresh) { fresh.chat = a.chat; await S.saveApp(fresh); a = fresh; }
      draw();
    }
    d.addEventListener('click', e => {
      const k = e.target.closest('[data-k]'), q = e.target.closest('[data-q]');
      if (q) return askQ(q.dataset.q);
      if (!k) return;
      if (k.dataset.k === 'close') { if (ctl) ctl.abort(); d.remove(); }
      if (k.dataset.k === 'stop' && ctl) ctl.abort();
      if (k.dataset.k === 'clear') { a.chat = []; S.getApp(a.id).then(f => { if (f) { f.chat = []; S.saveApp(f); } }); draw(); }
    });
    d.addEventListener('submit', e => { e.preventDefault(); const i = d.querySelector('#ask-in'); const v = i.value; i.value = ''; askQ(v); });
    d.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (ctl) ctl.abort(); d.remove(); }
      if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'ask-in') { e.preventDefault(); d.querySelector('#ask-form').requestSubmit(); }
    });
    draw();
  }

  window.CVT = window.CVT || {};
  window.CVT.assistant = { open, render };
})();
