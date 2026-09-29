/*
 * prep.js — interview preparation and offers.
 *   Mock interview : Claude asks one question at a time for a chosen job, scores your answer, shows a stronger version.
 *   Story bank     : your STAR stories, saved once, matched to every job.
 *   Drill cards    : SAP procurement and business-analysis practice with spaced repetition.
 *   Offers         : compare offers (perm vs contract), draft a counter-offer, checklist before you accept.
 *   Calendar       : interview slots as .ics files with prep and thank-you reminders.
 */
(function () {
  const { html, raw, $, $$, toast, download, copy, today, ukDate, daysBetween, state, masterModel } = window.CVT.ui;
  const S = window.CVT.store, A = window.CVT.agent, D = window.CVT.docx;
  const J = () => window.CVT.jobs;
  const uid = S.uid;

  const TABS = [['mock', 'Mock interview'], ['stories', 'Story bank'], ['drills', 'Drill cards'], ['offers', 'Offers']];
  const THEMES = ['leadership', 'stakeholder management', 'conflict', 'failure', 'cutover', 'data migration', 'requirements', 'process improvement', 'pressure', 'influencing', 'supplier adoption', 'team development'];

  const getStories = async () => (await S.getKV('stories', [])) || [];
  const saveStories = v => S.setKV('stories', v);
  const getOffers = async () => (await S.getKV('offers', [])) || [];
  const saveOffers = v => S.setKV('offers', v);
  const getDrills = async () => Object.assign({ p: {}, custom: [] }, (await S.getKV('drills', null)) || {});
  const saveDrills = v => S.setKV('drills', v);
  const getMocks = async () => (await S.getKV('mocks', [])) || [];
  const saveMocks = v => S.setKV('mocks', v.slice(0, 20));
  const needAi = () => { if (!state.key) { toast('Switch on the AI engine in Settings first', 'warn'); return false; } return true; };

  // ---------------------------------------------------------------------
  // Stories matched to a job (local, instant)
  // ---------------------------------------------------------------------
  function storiesForJob(app, stories, n = 4) {
    const jd = ((app && (app.jd || '')) + ' ' + (app && app.role || '')).toLowerCase();
    const terms = new Set(J().termsIn(jd));
    return stories.map(s => {
      const text = [s.title, s.situation, s.action, s.result].join(' ');
      const skills = new Set((s.skills || []).concat(J().termsIn(text)));
      let score = 0; skills.forEach(k => { if (terms.has(k)) score += 2; });
      (s.tags || []).forEach(t => { if (jd.includes(String(t).toLowerCase())) score += 1; });
      if (s.metrics) score += 0.5;
      return { s, score, hits: [...skills].filter(k => terms.has(k)) };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, n);
  }

  // ---------------------------------------------------------------------
  // Calendar (.ics)
  // ---------------------------------------------------------------------
  const icsDate = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const icsText = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  function interviewIcs(a) {
    const start = new Date(a.interviewAt), end = new Date(start.getTime() + (Number(a.interviewMins) || 60) * 60000);
    const ty = new Date(start); ty.setDate(ty.getDate() + 1); ty.setHours(9, 0, 0, 0);
    const tyEnd = new Date(ty.getTime() + 15 * 60000);
    const title = `Interview: ${a.role || 'role'} at ${a.company || 'company'}`;
    const desc = [`${a.interviewFormat || 'Interview'}${a.interviewWith ? ' with ' + a.interviewWith : ''}`, a.interviewWhere ? 'Where / link: ' + a.interviewWhere : '', a.url ? 'Advert: ' + a.url : '', 'Prepare in Applywise: pitch, likely questions, stories, questions to ask.'].filter(Boolean).join('\n');
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Applywise//Interview//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT', `UID:${a.id}-interview@applywise`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsText(title)}`, `DESCRIPTION:${icsText(desc)}`, a.interviewWhere ? `LOCATION:${icsText(a.interviewWhere)}` : '',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText('Prepare tomorrow\'s interview: ' + title)}`, 'TRIGGER:-P1D', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText('Interview in 1 hour: ' + title)}`, 'TRIGGER:-PT1H', 'END:VALARM',
      'END:VEVENT',
      'BEGIN:VEVENT', `UID:${a.id}-thanks@applywise`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(ty)}`, `DTEND:${icsDate(tyEnd)}`,
      `SUMMARY:${icsText('Send thank-you note: ' + (a.company || ''))}`, `DESCRIPTION:${icsText('Use the thank-you message in Applywise (Outreach tab).')}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Send your thank-you note', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean);
    return L.join('\r\n');
  }

  /** Interview slot + stories panel shown at the top of an application's Interview tab. */
  async function interviewExtras(ctx) {
    const { a, body } = ctx;
    const stories = await getStories();
    const matched = storiesForJob(a, stories);
    const local = a.interviewAt ? a.interviewAt.slice(0, 16) : '';
    const box = document.createElement('div');
    box.className = 'iv-extras';
    box.innerHTML = String(html`
      <section class="panel">
        <div class="panel-head"><h2>Interview slot</h2>${a.interviewAt ? html`<span class="chip accent">${new Date(a.interviewAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>` : ''}</div>
        <div class="grid-2">
          <label class="field"><span>Date and time</span><input id="iv-at" type="datetime-local" value="${local}"></label>
          <label class="field"><span>Length</span><select id="iv-mins">${[30, 45, 60, 90, 120].map(m => html`<option value="${m}" ${Number(a.interviewMins || 60) === m ? raw('selected') : ''}>${m} min</option>`)}</select></label>
          <label class="field"><span>Format</span><select id="iv-fmt">${['Video call', 'Phone screen', 'On-site', 'Technical panel', 'Final / HR'].map(f => html`<option ${a.interviewFormat === f ? raw('selected') : ''}>${f}</option>`)}</select></label>
          <label class="field"><span>With (names, roles)</span><input id="iv-with" type="text" value="${a.interviewWith || ''}"></label>
          <label class="field span-2"><span>Where or meeting link</span><input id="iv-where" type="text" value="${a.interviewWhere || ''}"></label>
        </div>
        <div class="row gap wrap"><button class="btn primary small" id="iv-save" type="button">Save slot</button><button class="btn ghost small" id="iv-ics" type="button" ${a.interviewAt ? '' : raw('disabled')}>Add to calendar (.ics)</button>
          <a class="btn ghost small" href="#/prep/mock/${a.id}">Mock interview for this job</a></div>
        <p class="muted small">The calendar file includes reminders the day before and an hour before, plus a thank-you note reminder the next morning. It opens in Outlook, Google Calendar and iPhone/Android calendars.</p>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Stories to tell for this job</h2><a class="link small" href="#/prep/stories">Story bank</a></div>
        ${!stories.length ? html`<p class="hint">Add your STAR stories once in the Story bank (Claude can draft them from your CV). They'll be matched to each job here.</p>`
        : matched.length ? html`<ul class="story-hits">${matched.map(m => html`<li><strong>${m.s.title}</strong>${m.hits.length ? html` <span class="muted small">covers ${m.hits.slice(0, 4).join(', ')}</span>` : ''}<p class="small">${m.s.result || ''}</p></li>`)}</ul>`
        : html`<p class="hint">None of your stories mention this job's key skills yet. Add one about ${J().termsIn(a.jd || '').slice(0, 3).join(', ') || 'its main requirement'}.</p>`}
      </section>`);
    body.prepend(box);
    const saveSlot = async () => {
      const v = $('#iv-at', box).value;
      a.interviewAt = v ? new Date(v).toISOString() : '';
      a.interviewMins = Number($('#iv-mins', box).value); a.interviewFormat = $('#iv-fmt', box).value;
      a.interviewWith = $('#iv-with', box).value.trim(); a.interviewWhere = $('#iv-where', box).value.trim();
      if (a.interviewAt && !['Interview', 'Offer', 'Accepted'].includes(a.status)) S.setStatus(a, 'Interview');
      if (a.interviewAt) { const d = new Date(a.interviewAt); d.setDate(d.getDate() - 1); a.next = { text: `Prepare for ${a.company || 'the'} interview`, due: d.toISOString().slice(0, 10) }; }
      await ctx.saveNow();
    };
    $('#iv-at', box).addEventListener('input', e => { $('#iv-ics', box).disabled = !e.target.value; });
    $('#iv-save', box).addEventListener('click', async () => { await saveSlot(); toast(a.interviewAt ? 'Interview saved. Add it to your calendar next.' : 'Interview slot cleared'); window.CVT.app.rerender(); });
    $('#iv-ics', box).addEventListener('click', async () => {
      await saveSlot(); if (!a.interviewAt) return;
      download(new Blob([interviewIcs(a)], { type: 'text/calendar' }), `Interview_${(a.company || 'company').replace(/\W+/g, '_')}.ics`);
    });
  }

  // =====================================================================
  // VIEW
  // =====================================================================
  async function view(root, tab, arg) {
    tab = TABS.some(t => t[0] === tab) ? tab : 'mock';
    root.innerHTML = String(html`
      <header class="page-head"><div><p class="eyebrow">Get interview-ready</p><h1>Prep</h1></div></header>
      <nav class="ws-tabs" aria-label="Prep sections">${TABS.map(([k, l]) => html`<a href="#/prep/${k}" ${k === tab ? raw('aria-current="page"') : ''}>${l}</a>`)}</nav>
      <div id="prep-body"></div>`);
    const body = $('#prep-body', root);
    await ({ mock, stories, drills, offers })[tab](body, arg);
  }

  // ---------------------------------------------------------------------
  // Mock interview
  // ---------------------------------------------------------------------
  async function mock(body, appId) {
    const [apps, profile, stories, past] = await Promise.all([S.listApps(), S.getProfile(), getStories(), getMocks()]);
    const withJd = apps.filter(a => (a.jd || '').length > 150);
    let session = null, current = null, ctl = null;
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;

    body.innerHTML = String(html`
      <section class="panel" id="mk-setup">
        <div class="panel-head"><h2>Practise with Claude as the interviewer</h2></div>
        <p class="hint">One question at a time, tailored to the job. Answer as you would out loud: type, or press Speak. You get a score out of 5, what was missing, and a stronger answer built only from your real experience.</p>
        <div class="grid-2">
          <label class="field"><span>Job</span><select id="mk-app"><option value="">General SAP procurement / BA interview</option>${withJd.map(a => html`<option value="${a.id}" ${a.id === appId ? raw('selected') : ''}>${a.role || 'Role'} · ${a.company || ''}</option>`)}</select></label>
          <label class="field"><span>Question type</span><select id="mk-kind"><option value="mixed">Mixed</option><option value="functional">SAP functional scenarios</option><option value="ba">Business analysis</option><option value="behavioural">Behavioural (STAR)</option></select></label>
        </div>
        <button class="btn primary start-btn" id="mk-start" type="button">Start mock interview</button>
      </section>
      <div id="mk-live"></div>
      ${past.length ? html`<section class="panel"><div class="panel-head"><h2>Past sessions</h2></div>
        <ul class="tight">${past.slice(0, 8).map(p => { const sc = p.turns.filter(t => t.grade).map(t => t.grade.score); const avg = sc.length ? (sc.reduce((x, y) => x + y, 0) / sc.length).toFixed(1) : '—';
          return html`<li>${ukDate(p.started)} · ${p.title} · ${p.turns.length} question${p.turns.length === 1 ? '' : 's'} · average <strong>${avg}</strong>/5</li>`; })}</ul></section>` : ''}`);

    const live = $('#mk-live', body);
    const app = () => apps.find(a => a.id === $('#mk-app', body).value) || null;

    const ask = async () => {
      if (!needAi()) return;
      live.innerHTML = '<section class="panel"><p class="muted">Claude is thinking of the next question…</p></section>';
      try {
        ctl = new AbortController();
        const q = await A.mockQuestion({ app: app(), profile, stories, asked: session.turns.map(t => t.q), kind: session.kind, signal: ctl.signal });
        current = { q: q.question, type: q.type, why: q.why, look: q.look_for || [], hint: q.story_hint || '' };
        drawQuestion();
      } catch (e) { live.innerHTML = String(html`<section class="panel"><p class="error">${e.message}</p></section>`); }
    };
    const drawQuestion = () => {
      const hintStory = stories.find(s => s.id === current.hint);
      live.innerHTML = String(html`<section class="panel mock-q">
        <div class="panel-head"><h2>Question ${session.turns.length + 1}</h2><span class="chip accent">${current.type || 'question'}</span></div>
        <p class="mock-question">${current.q}</p>
        <details><summary>What they're testing</summary><p class="small">${current.why || ''}</p>${current.look.length ? html`<ul class="tight small">${current.look.map(x => html`<li>${x}</li>`)}</ul>` : ''}${hintStory ? html`<p class="small">Story to use: <strong>${hintStory.title}</strong></p>` : ''}</details>
        <label class="field"><span class="sr">Your answer</span><textarea id="mk-ans" rows="8" placeholder="Type or speak your answer as you'd say it…"></textarea></label>
        <div class="mic-help" id="mk-mic-help" hidden></div>
        <div class="row gap wrap">
          <button class="btn primary" id="mk-send" type="button">Get feedback</button>
          <button class="btn ghost" id="mk-mic" type="button">🎤 Speak</button>
          ${'speechSynthesis' in window ? html`<button class="btn ghost" id="mk-say" type="button">🔊 Read question</button>` : ''}
          <button class="btn ghost" id="mk-skip" type="button">Skip question</button>
          <button class="btn ghost" id="mk-end" type="button">End session</button>
        </div></section>`);
      $('#mk-send', live).addEventListener('click', grade);
      $('#mk-skip', live).addEventListener('click', () => { session.turns.push({ q: current.q, type: current.type, skipped: true }); store(); ask(); });
      $('#mk-end', live).addEventListener('click', endSession);
      const mic = $('#mk-mic', live), ta = $('#mk-ans', live), help = $('#mk-mic-help', live);
      const say = $('#mk-say', live);
      if (say) say.addEventListener('click', () => { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(current.q); u.lang = 'en-GB'; u.rate = 0.97; speechSynthesis.speak(u); } catch (_) {} });
      const showDictation = why => {
        const ua = navigator.userAgent;
        const how = /iPhone|iPad|Android/i.test(ua) ? 'tap the 🎤 microphone key on your phone keyboard'
          : /Mac/i.test(ua) ? 'press the 🎤 / Fn key twice (or Control twice), then speak'
          : 'press <b>Windows key + H</b>, then speak';
        help.hidden = false;
        help.innerHTML = `<strong>Speak with your device's voice typing instead.</strong> ${why} Click in the answer box, then ${how}. Your words appear in the box as you talk. It's free and built into your device.`;
        ta.focus();
      };
      let rec = null, blocked = !Speech || S.local.get('cvt.micBlocked', false);
      mic.addEventListener('click', () => {
        if (rec) { rec.stop(); return; }
        if (blocked) return showDictation(Speech ? 'This page is shown inside claude.ai, which does not let pages use the microphone.' : 'This browser has no built-in speech input.');
        try {
          rec = new Speech(); rec.lang = 'en-GB'; rec.continuous = true; rec.interimResults = true;
          const base = ta.value ? ta.value + ' ' : '';
          rec.onresult = e => { ta.value = base + [...e.results].map(r => r[0].transcript).join(' '); help.hidden = true; };
          rec.onend = () => { rec = null; mic.textContent = '🎤 Speak'; };
          rec.onerror = e => {
            rec = null; mic.textContent = '🎤 Speak';
            if (/not-allowed|service-not-allowed|audio-capture|network/.test(e.error || '')) { blocked = true; S.local.set('cvt.micBlocked', true); }
            showDictation(e.error === 'no-speech' ? 'No speech was heard.' : 'The microphone is blocked for this page.');
          };
          rec.start(); mic.textContent = '■ Stop';
        } catch (_) { rec = null; blocked = true; showDictation('Speech input could not start here.'); }
      });
    };
    const grade = async () => {
      const answer = $('#mk-ans', live).value.trim();
      if (answer.length < 20) { toast('Write or say a fuller answer first', 'warn'); return; }
      const btn = $('#mk-send', live); btn.disabled = true; btn.textContent = 'Scoring…';
      try {
        const g = await A.mockGrade({ app: app(), profile, stories, question: current.q, answer });
        session.turns.push({ q: current.q, type: current.type, answer, grade: g }); store();
        const stars = n => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
        live.innerHTML = String(html`<section class="panel mock-q">
          <div class="panel-head"><h2>Feedback</h2><span class="score-stars" title="${g.score} out of 5">${stars(Math.max(1, Math.min(5, Number(g.score) || 1)))}</span></div>
          <p class="mock-question small">${current.q}</p>
          <p><strong>${g.verdict || ''}</strong></p>
          <div class="two-col">
            <div><h3>Strong points</h3><ul class="tight small">${(g.strengths || []).map(x => html`<li>${x}</li>`)}</ul></div>
            <div><h3>Missing or weak</h3><ul class="tight small">${(g.gaps || []).map(x => html`<li>${x}</li>`)}</ul></div>
          </div>
          <details open><summary>Stronger answer (your facts only)</summary><p class="pre small">${g.better_answer || ''}</p></details>
          <div class="row gap wrap">
            <button class="btn primary" id="mk-next" type="button">Next question</button>
            ${g.follow_up ? html`<button class="btn ghost" id="mk-fu" type="button">Answer the follow-up</button>` : ''}
            <button class="btn ghost" id="mk-copy" type="button">Copy stronger answer</button>
            <button class="btn ghost" id="mk-end2" type="button">End session</button>
          </div></section>`);
        $('#mk-next', live).addEventListener('click', ask);
        const fu = $('#mk-fu', live); if (fu) fu.addEventListener('click', () => { current = { q: g.follow_up, type: 'follow-up', why: 'A natural follow-up to your last answer.', look: [], hint: '' }; drawQuestion(); });
        $('#mk-copy', live).addEventListener('click', e => copy(g.better_answer || '', e.currentTarget));
        $('#mk-end2', live).addEventListener('click', endSession);
      } catch (e) { btn.disabled = false; btn.textContent = 'Get feedback'; toast(e.message, 'bad'); }
    };
    const store = async () => { const all = await getMocks(); const i = all.findIndex(x => x.id === session.id); if (i >= 0) all[i] = session; else all.unshift(session); await saveMocks(all); };
    const endSession = () => {
      const sc = session.turns.filter(t => t.grade).map(t => t.grade.score);
      const avg = sc.length ? (sc.reduce((x, y) => x + y, 0) / sc.length).toFixed(1) : null;
      const weak = session.turns.filter(t => t.grade && t.grade.score <= 3).map(t => t.q);
      live.innerHTML = String(html`<section class="panel"><div class="panel-head"><h2>Session summary</h2></div>
        <p>${session.turns.length} question${session.turns.length === 1 ? '' : 's'}${avg ? html`, average <strong>${avg}/5</strong>` : ''}.</p>
        ${weak.length ? html`<p class="small">Practise again:</p><ul class="tight small">${weak.map(q => html`<li>${q}</li>`)}</ul>` : ''}
        <button class="btn primary" id="mk-again" type="button">Start another session</button></section>`);
      $('#mk-again', live).addEventListener('click', () => window.CVT.app.rerender());
    };
    $('#mk-start', body).addEventListener('click', () => {
      const a = app();
      session = { id: uid(), started: new Date().toISOString(), appId: a ? a.id : '', kind: $('#mk-kind', body).value, title: a ? `${a.role} · ${a.company}` : 'General interview', turns: [] };
      ask();
    });
  }

  // ---------------------------------------------------------------------
  // Story bank
  // ---------------------------------------------------------------------
  async function stories(body) {
    let list = await getStories();
    let filter = '';
    const draw = () => {
      const covered = new Set(list.flatMap(s => (s.tags || []).map(t => t.toLowerCase())));
      const allTags = [...covered];
      const missing = THEMES.filter(th => !allTags.some(t => th.split(' ').every(w => t.includes(w))));
      const shown = list.filter(s => !filter || (s.tags || []).map(t => t.toLowerCase()).includes(filter));
      body.innerHTML = String(html`
        <section class="panel">
          <div class="panel-head"><h2>Your stories <span class="muted">· ${list.length}</span></h2>
            <div class="row gap wrap"><button class="btn ghost small" id="st-draft" type="button">Draft stories from my CV</button><button class="btn primary small" id="st-add" type="button">Add a story</button></div></div>
          <p class="hint">Interviewers ask for evidence. Keep 10–15 true stories in STAR form (Situation, Task, Action, Result, with numbers). Each application's Interview tab shows which stories fit that job.</p>
          ${list.length ? html`<div class="kw">${[...covered].sort().map(t => html`<button class="chip ${filter === t ? 'accent' : 'muted'} chip-filter" data-tag="${t}" type="button">${t}</button>`)}${filter ? html`<button class="chip outline chip-filter" data-tag="" type="button">Show all</button>` : ''}</div>` : ''}
          ${missing.length ? html`<p class="small muted">Themes not covered yet: ${missing.join(', ')}.</p>` : html`<p class="small ok-text">All common interview themes are covered.</p>`}
          <p class="error" id="st-err" hidden></p>
        </section>
        <div class="stories" id="st-list">${shown.map(s => html`<article class="panel story ${s.draft ? 'draft' : ''}" data-id="${s.id}">
          <div class="panel-head"><h3>${s.title || 'Untitled story'}</h3>
            <div class="row gap">${s.draft ? html`<span class="chip warn">Draft: check and edit</span>` : ''}<button class="btn ghost small" data-st="edit" type="button">Edit</button><button class="icon-btn" data-st="del" type="button" title="Delete" aria-label="Delete story">✕</button></div></div>
          <dl class="star"><dt>S</dt><dd>${s.situation}</dd><dt>T</dt><dd>${s.task}</dd><dt>A</dt><dd>${s.action}</dd><dt>R</dt><dd>${s.result}${s.metrics ? html` <strong>${s.metrics}</strong>` : ''}</dd></dl>
          <div class="kw">${(s.tags || []).map(t => html`<span class="chip muted">${t}</span>`)}${(s.skills || []).map(t => html`<span class="chip accent">${t}</span>`)}</div>
        </article>`)}</div>`);
      $$('.chip-filter', body).forEach(b => b.addEventListener('click', () => { filter = b.dataset.tag; draw(); }));
      $('#st-add', body).addEventListener('click', () => edit({ id: uid(), title: '', situation: '', task: '', action: '', result: '', metrics: '', tags: [], skills: [] }, true));
      $('#st-draft', body).addEventListener('click', draft);
      $('#st-list', body).addEventListener('click', async e => {
        const b = e.target.closest('[data-st]'); if (!b) return;
        const id = b.closest('[data-id]').dataset.id; const s = list.find(x => x.id === id);
        if (b.dataset.st === 'edit') edit(s, false);
        if (b.dataset.st === 'del') {
          if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Delete?'; return; }
          list = list.filter(x => x.id !== id); await saveStories(list); draw();
        }
      });
    };
    const edit = (s, isNew) => {
      const card = document.createElement('section');
      card.className = 'panel story-edit';
      card.innerHTML = String(html`<div class="panel-head"><h2>${isNew ? 'New story' : 'Edit story'}</h2></div>
        <label class="field"><span>Title</span><input data-k="title" value="${s.title}" placeholder="e.g. Rescued a failing Guided Buying go-live"></label>
        <label class="field"><span>Situation: context, client, scale</span><textarea data-k="situation" rows="2">${s.situation}</textarea></label>
        <label class="field"><span>Task: your responsibility</span><textarea data-k="task" rows="2">${s.task}</textarea></label>
        <label class="field"><span>Action: what YOU did (3–5 steps)</span><textarea data-k="action" rows="4">${s.action}</textarea></label>
        <label class="field"><span>Result: outcome</span><textarea data-k="result" rows="2">${s.result}</textarea></label>
        <div class="grid-2">
          <label class="field"><span>Numbers (e.g. 4,000 users, 30% faster)</span><input data-k="metrics" value="${s.metrics || ''}"></label>
          <label class="field"><span>Themes (comma separated)</span><input data-k="tags" value="${(s.tags || []).join(', ')}" placeholder="${THEMES.slice(0, 4).join(', ')}"></label>
          <label class="field span-2"><span>Skills shown (comma separated)</span><input data-k="skills" value="${(s.skills || []).join(', ')}" placeholder="SAP Ariba, Guided Buying, cutover"></label>
        </div>
        <div class="row gap"><button class="btn primary" data-save type="button">Save story</button><button class="btn ghost" data-cancel type="button">Cancel</button></div>`);
      body.prepend(card); card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('[data-cancel]', card).addEventListener('click', () => card.remove());
      $('[data-save]', card).addEventListener('click', async () => {
        const v = k => $(`[data-k="${k}"]`, card).value.trim();
        Object.assign(s, { title: v('title'), situation: v('situation'), task: v('task'), action: v('action'), result: v('result'), metrics: v('metrics'),
          tags: v('tags').split(',').map(x => x.trim().toLowerCase()).filter(Boolean), skills: v('skills').split(',').map(x => x.trim()).filter(Boolean), draft: false, updated: new Date().toISOString() });
        if (!s.title || !s.action) { toast('Add at least a title and the action', 'warn'); return; }
        if (isNew) list.unshift(s);
        await saveStories(list); toast('Story saved'); draw();
      });
    };
    const draft = async () => {
      if (!needAi()) return;
      const btn = $('#st-draft', body); btn.disabled = true; btn.textContent = 'Drafting (30–60 s)…';
      try {
        const [profile, mm] = await Promise.all([S.getProfile(), masterModel()]);
        if (!mm) throw new Error('Upload your CV in Career profile first.');
        const r = await A.storyDrafts({ profile, cvText: D.plainText(mm.model), have: list.map(s => s.title) });
        const add = (r.stories || []).map(s => ({ id: uid(), title: s.title || '', situation: s.situation || '', task: s.task || '', action: s.action || '', result: s.result || '', metrics: s.metrics || '', tags: (s.tags || []).map(t => String(t).toLowerCase()), skills: s.skills || [], draft: true, updated: new Date().toISOString() }));
        list = add.concat(list); await saveStories(list);
        toast(`${add.length} draft stories added. Check each one; replace any [add: …] with your real details.`); draw();
      } catch (e) { const er = $('#st-err', body); er.textContent = e.message; er.hidden = false; btn.disabled = false; btn.textContent = 'Draft stories from my CV'; }
    };
    draw();
  }

  // ---------------------------------------------------------------------
  // Drill cards (Leitner boxes)
  // ---------------------------------------------------------------------
  const GAP = [0, 1, 3, 7, 14, 30];
  async function dueCount() {
    const d = await getDrills(); const all = window.CVT.drills.CARDS.concat(d.custom || []); const t = today();
    return all.filter(c => !d.p[c.id] || d.p[c.id].due <= t).length;
  }
  async function drills(body) {
    const { DECKS, CARDS } = window.CVT.drills;
    let d = await getDrills();
    let deck = S.local.get('cvt.deck', 'all');
    let queue = [], cur = null, shown = false, doneToday = 0;
    const all = () => CARDS.concat(d.custom || []);
    const decks = () => Object.assign({}, DECKS, (d.custom || []).length ? { custom: 'My cards' } : {});
    const build = () => { const t = today(); queue = all().filter(c => (deck === 'all' || c.deck === deck) && (!d.p[c.id] || d.p[c.id].due <= t)).sort(() => Math.random() - 0.5).slice(0, 12); cur = queue.shift() || null; shown = false; };
    const mastered = () => all().filter(c => d.p[c.id] && d.p[c.id].box >= 4).length;
    const draw = () => {
      body.innerHTML = String(html`
        <section class="panel">
          <div class="panel-head"><h2>Drill cards</h2><span class="muted small">${mastered()} of ${all().length} mastered</span></div>
          <p class="hint">Ten minutes a day. Say your answer out loud, then reveal the model answer and rate yourself. Cards you find hard come back sooner.</p>
          <div class="row gap wrap"><label class="inline-field">Deck <select id="dr-deck"><option value="all">All decks</option>${Object.entries(decks()).map(([k, l]) => html`<option value="${k}" ${deck === k ? raw('selected') : ''}>${l}</option>`)}</select></label>
            <span class="muted small">${queue.length + (cur ? 1 : 0)} due now</span></div>
        </section>
        ${cur ? html`<section class="panel flash">
          <span class="chip muted">${decks()[cur.deck] || cur.deck}</span>
          <p class="flash-q">${cur.q}</p>
          ${shown ? html`<div class="flash-a pre">${cur.a}</div>
            <div class="rate"><button class="btn ghost" data-r="0" type="button">Again</button><button class="btn ghost" data-r="1" type="button">Hard</button><button class="btn primary" data-r="2" type="button">Good</button><button class="btn ghost" data-r="3" type="button">Easy</button></div>`
          : html`<button class="btn primary" id="dr-show" type="button">Show answer</button>`}
        </section>` : html`<section class="panel empty-state"><h2>${doneToday ? 'Done for today' : 'Nothing due'}</h2><p class="hint">${doneToday ? `You reviewed ${doneToday} card${doneToday === 1 ? '' : 's'}. Come back tomorrow.` : 'All cards in this deck are scheduled for later.'}</p></section>`}
        <section class="panel">
          <div class="panel-head"><h2>Add cards on a topic</h2></div>
          <p class="hint">For example: "SAP Ariba Contracts", "S/4HANA MDG supplier", "requirements traceability", or anything from a job advert.</p>
          <div class="row gap wrap"><input id="dr-topic" type="text" placeholder="Topic" class="grow"><button class="btn ghost" id="dr-gen" type="button">Create 8 cards</button></div>
        </section>`);
      $('#dr-deck', body).addEventListener('change', e => { deck = e.target.value; S.local.set('cvt.deck', deck); build(); draw(); });
      const sh = $('#dr-show', body); if (sh) sh.addEventListener('click', () => { shown = true; draw(); });
      $$('[data-r]', body).forEach(b => b.addEventListener('click', async () => {
        const r = Number(b.dataset.r), p = d.p[cur.id] || { box: 0 };
        p.box = r === 0 ? 1 : r === 1 ? Math.max(1, p.box) : Math.min(5, p.box + (r === 3 ? 2 : 1));
        p.due = r === 0 ? today() : S.addDays(today(), GAP[p.box]);
        d.p[cur.id] = p; await saveDrills(d); doneToday++;
        if (r === 0) queue.push(cur);
        cur = queue.shift() || null; shown = false; draw();
      }));
      $('#dr-gen', body).addEventListener('click', async () => {
        const topic = $('#dr-topic', body).value.trim(); if (!topic) return toast('Type a topic first', 'warn');
        if (!needAi()) return;
        const b = $('#dr-gen', body); b.disabled = true; b.textContent = 'Creating…';
        try {
          const r = await A.moreCards({ topic });
          const add = (r.cards || []).filter(c => c.q && c.a).map(c => ({ id: 'c' + uid(), deck: 'custom', q: c.q, a: c.a, topic }));
          d.custom = (d.custom || []).concat(add); await saveDrills(d);
          toast(`${add.length} cards added to "My cards"`); deck = 'custom'; build(); draw();
        } catch (e) { toast(e.message, 'bad'); b.disabled = false; b.textContent = 'Create 8 cards'; }
      });
    };
    build(); draw();
  }

  // ---------------------------------------------------------------------
  // Offers
  // ---------------------------------------------------------------------
  const CHECKS = ['Written offer received and read in full', 'Salary / day rate, bonus and pension match what was agreed', 'Start date and notice period agreed with current employer', 'Contract: IR35 status determination (SDS) received', 'Contract: length, extension terms, notice and payment terms', 'Location and on-site days confirmed in writing', 'Holiday, sick pay and benefits confirmed', 'Background checks / clearance timeline understood', 'Other applications and recruiters told once you accept'];
  function annual(o) {
    const n = x => Number(String(x || '').replace(/[^\d.]/g, '')) || 0;
    if (o.type === 'Contract') {
      const r = J().rateCalc({ rate: n(o.rate), days: n(o.days) || 220, benefits: 20, inside: o.ir35 === 'Inside' });
      return { gross: r.gross, value: r.gross - r.umbrella, compare: r.comparable, label: `${'£' + n(o.rate)}/day × ${n(o.days) || 220} days${o.ir35 ? ' · ' + o.ir35 + ' IR35' : ''}` };
    }
    const sal = n(o.salary), bonus = sal * n(o.bonus) / 100, pension = sal * n(o.pension) / 100, ben = n(o.benefits);
    const total = sal + bonus + pension + ben;
    return { gross: sal, value: total, compare: total, label: `£${sal.toLocaleString('en-GB')} + ${n(o.bonus)}% bonus + ${n(o.pension)}% pension${ben ? ' + £' + ben.toLocaleString('en-GB') + ' benefits' : ''}` };
  }
  async function offers(body) {
    let list = await getOffers();
    const apps = await S.listApps();
    const money = v => '£' + Math.round(v).toLocaleString('en-GB');
    const draw = () => {
      const vals = list.map(o => ({ o, v: annual(o) }));
      const best = vals.length ? vals.reduce((a, b) => (b.v.compare > a.v.compare ? b : a)) : null;
      body.innerHTML = String(html`
        <section class="panel">
          <div class="panel-head"><h2>Compare offers</h2><button class="btn primary small" id="of-add" type="button">Add offer</button></div>
          <p class="hint">Contract and permanent offers are compared on a like-for-like yearly value (contract after umbrella costs if inside IR35, perm including bonus, pension and benefits). A rough guide, not tax advice.</p>
          ${vals.length ? html`<div class="table-wrap"><table class="list offers">
            <thead><tr><th>Offer</th><th>Package</th><th>Yearly value</th><th>Perm-equivalent</th><th>Holiday</th><th>On-site</th><th></th></tr></thead>
            <tbody>${vals.map(({ o, v }) => html`<tr data-id="${o.id}">
              <td><strong>${o.company}</strong><br><span class="muted small">${o.role || ''} · ${o.type}</span>${best && best.o.id === o.id && vals.length > 1 ? html` <span class="chip ok">Best value</span>` : ''}</td>
              <td class="small">${v.label}</td><td>${money(v.value)}</td><td>${money(v.compare)}</td>
              <td>${o.holiday ? o.holiday + ' days' : '—'}</td><td>${o.onsite ? o.onsite + ' days/wk' : '—'}</td>
              <td class="nowrap"><button class="btn ghost small" data-of="counter" type="button">Counter-offer</button> <button class="btn ghost small" data-of="edit" type="button">Edit</button> <button class="icon-btn" data-of="del" type="button" aria-label="Delete offer">✕</button></td></tr>`)}</tbody></table></div>`
          : html`<p class="empty-note">No offers yet. When one arrives, add it here to compare and negotiate.</p>`}
        </section>
        <div id="of-extra"></div>
        ${list.length ? html`<section class="panel"><div class="panel-head"><h2>Before you accept</h2></div>
          ${list.map(o => html`<details><summary>${o.company}: ${(o.checks || []).length}/${CHECKS.length} checked</summary><ul class="checklist">${CHECKS.map((c, i) => html`<li><label><input type="checkbox" data-chk="${o.id}:${i}" ${(o.checks || []).includes(i) ? raw('checked') : ''}> ${c}</label></li>`)}</ul></details>`)}
        </section>` : ''}`);
      $('#of-add', body).addEventListener('click', () => form({ id: uid(), type: 'Permanent', company: '', role: '', checks: [] }, true));
      body.querySelector('.offers') && body.querySelector('.offers').addEventListener('click', async e => {
        const b = e.target.closest('[data-of]'); if (!b) return;
        const o = list.find(x => x.id === b.closest('[data-id]').dataset.id);
        if (b.dataset.of === 'edit') form(o, false);
        if (b.dataset.of === 'del') { if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '?'; return; } list = list.filter(x => x !== o); await saveOffers(list); draw(); }
        if (b.dataset.of === 'counter') counter(o);
      });
      $$('[data-chk]', body).forEach(c => c.addEventListener('change', async () => {
        const [id, i] = c.dataset.chk.split(':'); const o = list.find(x => x.id === id); const n = Number(i);
        o.checks = (o.checks || []).filter(x => x !== n).concat(c.checked ? [n] : []); await saveOffers(list);
        c.closest('details').querySelector('summary').textContent = `${o.company}: ${o.checks.length}/${CHECKS.length} checked`;
      }));
    };
    const form = (o, isNew) => {
      const x = $('#of-extra', body);
      x.innerHTML = String(html`<section class="panel"><div class="panel-head"><h2>${isNew ? 'Add offer' : 'Edit offer'}</h2></div>
        <div class="grid-2">
          <label class="field"><span>Company</span><input data-k="company" value="${o.company}"></label>
          <label class="field"><span>Role</span><input data-k="role" value="${o.role || ''}"></label>
          <label class="field"><span>Type</span><select data-k="type"><option ${o.type === 'Permanent' ? raw('selected') : ''}>Permanent</option><option ${o.type === 'Contract' ? raw('selected') : ''}>Contract</option></select></label>
          <label class="field"><span>Linked application</span><select data-k="appId"><option value="">—</option>${apps.map(a => html`<option value="${a.id}" ${o.appId === a.id ? raw('selected') : ''}>${a.role} · ${a.company}</option>`)}</select></label>
          <label class="field"><span>Salary (£/year, perm)</span><input data-k="salary" inputmode="numeric" value="${o.salary || ''}"></label>
          <label class="field"><span>Day rate (£, contract)</span><input data-k="rate" inputmode="numeric" value="${o.rate || ''}"></label>
          <label class="field"><span>Bonus (% of salary)</span><input data-k="bonus" inputmode="numeric" value="${o.bonus || ''}"></label>
          <label class="field"><span>Employer pension (%)</span><input data-k="pension" inputmode="numeric" value="${o.pension || ''}"></label>
          <label class="field"><span>Other benefits (£/year: car, health…)</span><input data-k="benefits" inputmode="numeric" value="${o.benefits || ''}"></label>
          <label class="field"><span>Billable days/year (contract)</span><input data-k="days" inputmode="numeric" value="${o.days || ''}" placeholder="220"></label>
          <label class="field"><span>IR35 (contract)</span><select data-k="ir35"><option value="">—</option><option ${o.ir35 === 'Outside' ? raw('selected') : ''}>Outside</option><option ${o.ir35 === 'Inside' ? raw('selected') : ''}>Inside</option></select></label>
          <label class="field"><span>Holiday days</span><input data-k="holiday" inputmode="numeric" value="${o.holiday || ''}"></label>
          <label class="field"><span>On-site days per week</span><input data-k="onsite" inputmode="numeric" value="${o.onsite || ''}"></label>
          <label class="field"><span>Decision deadline</span><input data-k="deadline" type="date" value="${o.deadline || ''}"></label>
        </div>
        <label class="field"><span>Notes</span><textarea data-k="notes" rows="2">${o.notes || ''}</textarea></label>
        <div class="row gap"><button class="btn primary" data-save type="button">Save offer</button><button class="btn ghost" data-cancel type="button">Cancel</button></div></section>`);
      x.scrollIntoView({ behavior: 'smooth' });
      $('[data-cancel]', x).addEventListener('click', () => { x.innerHTML = ''; });
      $('[data-save]', x).addEventListener('click', async () => {
        $$('[data-k]', x).forEach(el => { o[el.dataset.k] = el.value.trim(); });
        if (!o.company) return toast('Add the company name', 'warn');
        o.updated = new Date().toISOString();
        if (isNew) list.push(o);
        if (o.appId) { const a = await S.getApp(o.appId); if (a && !['Offer', 'Accepted'].includes(a.status)) { S.setStatus(a, 'Offer'); await S.saveApp(a); } }
        await saveOffers(list); toast('Offer saved'); draw();
      });
    };
    const counter = async o => {
      if (!needAi()) return;
      const x = $('#of-extra', body);
      x.innerHTML = String(html`<section class="panel"><div class="panel-head"><h2>Counter-offer for ${o.company}</h2></div>
        <label class="field"><span>What do you want? (e.g. £95k base, or £600/day, 2 days on-site, start in 6 weeks)</span><input id="co-goal" type="text"></label>
        <button class="btn primary" id="co-go" type="button">Draft counter-offer</button><div id="co-out"></div></section>`);
      x.scrollIntoView({ behavior: 'smooth' });
      $('#co-go', x).addEventListener('click', async e => {
        const b = e.currentTarget; b.disabled = true; b.textContent = 'Drafting…';
        try {
          const profile = await S.getProfile();
          const r = await A.counterOffer({ profile, offer: o, others: list.filter(y => y !== o).map(y => ({ company: y.company, type: y.type, value: Math.round(annual(y).compare) })), goal: $('#co-goal', x).value.trim() });
          $('#co-out', x).innerHTML = String(html`<div class="copy-block"><div class="copy-head"><strong>${r.email_subject || 'Email'}</strong><button class="btn ghost small" id="co-copy" type="button">Copy email</button></div><p class="pre">${r.email || ''}</p></div>
            ${(r.ask_for || []).length ? html`<h3>Ask for, in order</h3><ol class="tight">${r.ask_for.map(t => html`<li>${t}</li>`)}</ol>` : ''}
            ${(r.call_script || []).length ? html`<h3>If they call</h3><ul class="tight">${r.call_script.map(t => html`<li>${t}</li>`)}</ul>` : ''}
            ${r.walk_away_note ? html`<p class="small muted">${r.walk_away_note}</p>` : ''}`);
          $('#co-copy', x).addEventListener('click', ev => copy(r.email || '', ev.currentTarget));
        } catch (err) { toast(err.message, 'bad'); }
        b.disabled = false; b.textContent = 'Draft again';
      });
    };
    draw();
  }

  /** Upcoming interviews for the dashboard. */
  async function upcoming() {
    const now = Date.now();
    return (await S.listApps()).filter(a => a.interviewAt && new Date(a.interviewAt).getTime() > now - 3 * 3600e3).sort((a, b) => a.interviewAt.localeCompare(b.interviewAt));
  }

  window.CVT.prep = { view, interviewExtras, interviewIcs, storiesForJob, dueCount, upcoming, annual };
})();
