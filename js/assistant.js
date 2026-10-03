/*
 * assistant.js — "Ask AI" on every application: a chat drawer that answers any question about the job,
 * the company, your CV and fit, interviews, salary, or any other topic. It knows the advert, the fit
 * analysis, your (tailored) CV, your profile and the documents you uploaded for this application.
 * The conversation is saved with the application.
 * Voice: speak your question (browser speech recognition) and hear a calm, professional voice read the
 * answer (browser speech synthesis). Both are built into the browser and free. Abusive or offensive
 * messages are not sent and get no reply.
 */
(function () {
  const { html, raw, esc, toast } = window.CVT.ui;
  const S = window.CVT.store, A = window.CVT.agent;
  const MAX = 40;

  // ---------- Respectful-language guard (runs before anything is sent) ----------
  const BAD = ['fuck', 'fck', 'fuk', 'fuc', 'fking', 'fcking', 'wtf', 'stfu', 'sht', 'fucking', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bitch', 'bastard', 'asshole', 'arsehole', 'dick', 'dickhead', 'cunt', 'twat', 'wanker', 'prick', 'slut', 'whore', 'piss off', 'pissed', 'bollocks', 'bugger off', 'crap', 'damn you', 'screw you', 'shut up', 'stupid', 'idiot', 'moron', 'dumb', 'retard', 'retarded', 'loser', 'useless bot', 'hate you', 'kill you', 'die', 'porn', 'sex', 'nude', 'nudes', 'boobs', 'penis', 'vagina', 'nigger', 'nigga', 'faggot', 'fag', 'paki', 'chink', 'spastic',
    'chutiya', 'chutia', 'madarchod', 'mc', 'bhenchod', 'behenchod', 'bc', 'bsdk', 'bhosdike', 'gandu', 'harami', 'kamina', 'kutta', 'kutti', 'saala', 'saali', 'lavda', 'lauda', 'randi', 'dengey', 'denga', 'lanja', 'puka', 'gudda'];
  const norm = t => ' ' + String(t || '').toLowerCase().replace(/[@4]/g, 'a').replace(/[3]/g, 'e').replace(/[1!|]/g, 'i').replace(/[0]/g, 'o').replace(/[$5]/g, 's').replace(/[7]/g, 't').replace(/\*/g, '').replace(/[^a-z\s]/g, ' ').replace(/(.)\1{2,}/g, '$1$1').replace(/\s+/g, ' ') + ' ';
  const squash = t => t.replace(/(.)\1+/g, '$1');
  const reOf = list => new RegExp(' (?:' + list.join('|') + ')(?:s|es|ed|ing|y)? ', 'i');
  const BAD_RE = reOf(BAD), BAD_SQ = reOf([...new Set(BAD.map(squash))]);
  // Ordinary words that are only abuse when aimed at someone ("die casting", "MC" and "BC" stay usable).
  const SOFT = /^(die|dumb|crap|stupid|shut up|sex|mc|bc|pissed|dick|prick|kutta|kutti|saala|saali|puka|denga|gudda)$/;
  function abusive(t) {
    const n = norm(t), words = n.trim().split(' ').length;
    let m = n.match(BAD_RE), hay = n;
    if (!m) { hay = squash(n); m = hay.match(BAD_SQ); }
    if (!m) return false;
    const w = m[0].trim(), base = w.replace(/(?:s|es|ed|ing|y)$/, '');
    if (!SOFT.test(w) && !SOFT.test(base)) return true;
    if (words <= 3 && !/^(mc|bc|sex)$/.test(base)) return true;
    const before = hay.slice(Math.max(0, m.index - 14), m.index + 1);
    return / (you|u|ur|your|youre|bot|go|this bot|f off) [a-z ]*$/.test(before) || / (you|u) /.test(hay.slice(m.index + m[0].length - 1, m.index + m[0].length + 5));
  }

  // ---------- Voice (Web Speech API: built into Chrome, Edge and Safari; free) ----------
  const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem('aw-ask-' + k); localStorage.setItem('aw-ask-' + k, v); } catch (_) { return null; } };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const TTS = 'speechSynthesis' in window ? window.speechSynthesis : null;
  const PRO_VOICES = [/Sonia.*Natural/i, /Libby.*Natural/i, /Ryan.*Natural/i, /Natural.*en-GB/i, /Google UK English Female/i, /Google UK English Male/i, /Serena/i, /Daniel/i, /Kate/i, /Aria.*Natural/i, /Jenny.*Natural/i, /Guy.*Natural/i, /Natural/i, /Google US English/i, /Samantha/i];
  function voices() { return TTS ? TTS.getVoices().filter(v => /^en[-_]/i.test(v.lang)) : []; }
  function bestVoice() {
    const vs = voices(); const want = pref('voice');
    if (want) { const v = vs.find(x => x.name === want); if (v) return v; }
    for (const re of PRO_VOICES) { const v = vs.find(x => re.test(x.name) || re.test(x.name + ' ' + x.lang)); if (v) return v; }
    return vs.find(v => /en-GB/i.test(v.lang)) || vs[0] || null;
  }
  const plain = t => String(t || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, '').replace(/[#_`>]/g, '').replace(/\be\.g\./gi, 'for example').replace(/\bi\.e\./gi, 'that is').replace(/\s*\n+\s*/g, '. ').replace(/\.\s*\./g, '.').trim();
  function speak(text, onEnd) {
    if (!TTS) return false;
    TTS.cancel();
    // Speak sentence by sentence: smoother, and avoids Chrome cutting off long utterances.
    const parts = plain(text).match(/[^.!?]+[.!?]*/g) || [];
    const v = bestVoice(); const rate = +(pref('rate') || 1);
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p.trim()); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-GB';
      u.rate = rate; u.pitch = 1; u.volume = 1;
      if (i === parts.length - 1 && onEnd) u.onend = onEnd;
      TTS.speak(u);
    });
    return true;
  }
  if (TTS) { TTS.getVoices(); TTS.onvoiceschanged = () => TTS.getVoices(); }

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
    let busy = false, ctl = null, listening = false, rec = null, speakingIdx = -1, notice = '';
    let voiceOn = pref('voiceOn') === '1', handsFree = false, showVoice = false;
    const stopSpeaking = () => { if (TTS) TTS.cancel(); speakingIdx = -1; };
    function listen() {
      if (!SR) { toast('Voice input needs Chrome, Edge or Safari. You can still type.', 'warn'); return; }
      if (listening && rec) { rec.stop(); return; }
      stopSpeaking();
      rec = new SR(); rec.lang = (bestVoice() && bestVoice().lang) || 'en-GB'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
      let finalText = '';
      rec.onresult = e => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) finalText += t; else interim += t; }
        const inp = d.querySelector('#ask-in'); if (inp) inp.value = (finalText + interim).trim();
      };
      rec.onerror = e => { listening = false; draw(); if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Microphone access is blocked. Allow it in the browser address bar to talk to Ask AI.', 'warn'); else if (e.error !== 'no-speech' && e.error !== 'aborted') toast('Voice input stopped: ' + e.error, 'warn'); };
      rec.onend = () => { listening = false; rec = null; draw(); const q = finalText.trim(); if (q) { const inp = d.querySelector('#ask-in'); if (inp) inp.value = ''; voiceOn = true; pref('voiceOn', '1'); askQ(q); } };
      listening = true; draw();
      try { rec.start(); } catch (_) { listening = false; draw(); }
    }
    const draw = () => {
      const chat = a.chat || [];
      d.innerHTML = String(html`
        <div class="ask-head"><div><strong>Ask AI</strong><span class="muted small"> · ${a.role || 'this application'}${a.company ? ' at ' + a.company : ''}</span></div>
          <div class="row gap">${TTS ? html`<button class="ask-tog${voiceOn ? ' on' : ''}" type="button" data-k="voice" aria-pressed="${voiceOn}" title="${voiceOn ? 'Answers are read aloud' : 'Read answers aloud'}">${voiceOn ? '🔊 On' : '🔈 Off'}</button><button class="linkish small" type="button" data-k="vset" aria-expanded="${showVoice}" title="Voice settings" aria-label="Voice settings">⚙</button>` : ''}${chat.length ? html`<button class="linkish small" type="button" data-k="clear">Clear chat</button>` : ''}<button class="icon-btn" type="button" data-k="close" aria-label="Close">×</button></div></div>
        ${showVoice && TTS ? html`<div class="ask-vset">
          <label class="small">Voice <select data-k2="voice">${voices().map(v => html`<option value="${v.name}" ${bestVoice() && bestVoice().name === v.name ? raw('selected') : ''}>${v.name} (${v.lang})</option>`)}</select></label>
          <label class="small">Speed <select data-k2="rate">${[['0.9', 'Calm'], ['1', 'Normal'], ['1.1', 'Brisk']].map(([v, l]) => html`<option value="${v}" ${(pref('rate') || '1') === v ? raw('selected') : ''}>${l}</option>`)}</select></label>
          ${SR ? html`<label class="check-line small"><input type="checkbox" data-k2="hands" ${handsFree ? raw('checked') : ''}> Hands-free: listen again after each answer</label>` : ''}
          <button class="btn ghost small" type="button" data-k="vtest">▶ Test voice</button>
        </div>` : ''}
        <div class="ask-log" id="ask-log">
          ${chat.length ? '' : html`<div class="ask-intro"><p>Ask anything about this requirement: the job and company, the technologies it needs, your fit and CV, interview answers, salary and the industry. Type, or press 🎤 and speak; turn on 🔊 to hear answers in a professional voice. Answers use this application's advert, your CV, the fit analysis and your uploaded documents.</p>
            <p class="small muted">Please keep it professional: offensive or abusive messages are not sent and get no reply.</p>
            <div class="ask-chips">${starters(a).map(q => html`<button type="button" class="chip-btn" data-q="${q}">${q}</button>`)}</div></div>`}
          ${chat.map((m, i) => html`<div class="ask-q">${m.q}</div><div class="ask-a">${raw(render(m.a))}${TTS && m.a ? html`<div class="ask-say"><button class="linkish small" type="button" data-say="${i}">${speakingIdx === i ? '⏹ Stop reading' : '🔊 Listen'}</button></div>` : ''}${(m.follow || []).length ? html`<div class="ask-chips">${m.follow.map(q => html`<button type="button" class="chip-btn" data-q="${q}">${q}</button>`)}</div>` : ''}</div>`)}
          ${busy ? html`<div class="ask-a ask-wait">Thinking…</div>` : ''}
          ${notice ? html`<div class="ask-note" role="status">${notice}</div>` : ''}
        </div>
        <form class="ask-form" id="ask-form">${SR ? html`<button class="ask-mic${listening ? ' live' : ''}" type="button" data-k="mic" aria-pressed="${listening}" title="${listening ? 'Listening… click to stop' : 'Speak your question'}" aria-label="${listening ? 'Stop listening' : 'Speak your question'}" ${busy ? raw('disabled') : ''}>${listening ? '●' : '🎤'}</button>` : ''}<textarea id="ask-in" rows="2" placeholder="${listening ? 'Listening… speak your question' : 'Ask about this job, the company, the technologies, your CV…'}" aria-label="Your question" ${busy ? raw('disabled') : ''}></textarea>
          ${busy ? html`<button class="btn ghost" type="button" data-k="stop">Stop</button>` : html`<button class="btn primary" type="submit">Ask</button>`}</form>`);
      const log = d.querySelector('#ask-log'); log.scrollTop = log.scrollHeight;
      const inp = d.querySelector('#ask-in'); if (inp && !busy) inp.focus({ preventScroll: true });
    };
    async function askQ(q) {
      q = String(q || '').trim(); if (!q || busy) return;
      notice = '';
      if (abusive(q)) { stopSpeaking(); notice = 'Message not sent. Please keep questions professional and respectful.'; draw(); return; }
      busy = true; a.chat = a.chat || []; a.chat.push({ q, a: '', at: new Date().toISOString() }); draw();
      const msg = a.chat[a.chat.length - 1];
      try {
        ctl = new AbortController();
        const ctx = [await context(a), docsFor(a, q)].filter(Boolean).join('\n\n');
        const r = await A.appChat({ context: ctx, history: a.chat.slice(0, -1), question: q, signal: ctl.signal });
        if (r && (r.blocked || (r.answer === '' && r.blocked !== false))) { a.chat.pop(); notice = 'Message not sent. Please keep questions professional and respectful.'; }
        else { msg.a = (r && r.answer) || 'No answer came back. Try asking again.'; msg.follow = ((r && r.follow_ups) || []).slice(0, 3); }
      } catch (e) {
        if (e.name === 'AbortError') { a.chat.pop(); } else { msg.a = 'Sorry, that did not work: ' + e.message; }
      }
      busy = false; ctl = null;
      a.chat = a.chat.slice(-MAX);
      const fresh = await S.getApp(a.id); if (fresh) { fresh.chat = a.chat; await S.saveApp(fresh); a = fresh; }
      const last = a.chat[a.chat.length - 1];
      if (voiceOn && !notice && last && last.a && d.isConnected) {
        speakingIdx = a.chat.length - 1;
        speak(last.a, () => { speakingIdx = -1; if (d.isConnected) { draw(); if (handsFree) listen(); } });
      }
      draw();
    }
    d.addEventListener('click', e => {
      const k = e.target.closest('[data-k]'), q = e.target.closest('[data-q]'), say = e.target.closest('[data-say]');
      if (q) return askQ(q.dataset.q);
      if (say) { const i = +say.dataset.say; if (speakingIdx === i) stopSpeaking(); else { speakingIdx = i; speak(a.chat[i].a, () => { speakingIdx = -1; if (d.isConnected) draw(); }); } draw(); return; }
      if (!k) return;
      if (k.dataset.k === 'mic') { listen(); return; }
      if (k.dataset.k === 'voice') { voiceOn = !voiceOn; pref('voiceOn', voiceOn ? '1' : '0'); if (!voiceOn) stopSpeaking(); draw(); return; }
      if (k.dataset.k === 'vset') { showVoice = !showVoice; draw(); return; }
      if (k.dataset.k === 'vtest') { speak(`Hello. I am your Applywise assistant for the ${a.role || 'role'}${a.company ? ' at ' + a.company : ''}. Ask me anything about this requirement.`); return; }
      if (k.dataset.k === 'close') { if (ctl) ctl.abort(); if (rec) rec.abort(); stopSpeaking(); d.remove(); }
      if (k.dataset.k === 'stop' && ctl) ctl.abort();
      if (k.dataset.k === 'clear') { a.chat = []; S.getApp(a.id).then(f => { if (f) { f.chat = []; S.saveApp(f); } }); draw(); }
    });
    d.addEventListener('change', e => {
      const k = e.target.dataset.k2; if (!k) return;
      if (k === 'voice') pref('voice', e.target.value);
      if (k === 'rate') pref('rate', e.target.value);
      if (k === 'hands') handsFree = e.target.checked;
    });
    d.addEventListener('submit', e => { e.preventDefault(); const i = d.querySelector('#ask-in'); const v = i.value; i.value = ''; askQ(v); });
    d.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (ctl) ctl.abort(); if (rec) rec.abort(); stopSpeaking(); d.remove(); }
      if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'ask-in') { e.preventDefault(); d.querySelector('#ask-form').requestSubmit(); }
    });
    draw();
  }

  window.CVT = window.CVT || {};
  window.CVT.assistant = { open, render, abusive };
})();
