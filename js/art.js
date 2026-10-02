/*
 * art.js — original job-themed illustrations (inline SVG, no image files, crisp at any size).
 * Colours follow the theme (light and dark) through CSS variables.
 * Scenes: search, cv, interview, handshake, growth, ask, welcome, calendar, aiwriter, match, robot, shield.
 */
(function () {
  const C = { a: 'var(--art-a, #2447D6)', b: 'var(--art-b, #7AA8F8)', c: 'var(--art-c, #F2B84B)', d: 'var(--art-d, #2FA37C)', skin: 'var(--art-skin, #E9B08B)', skin2: 'var(--art-skin2, #8D5A3B)',
    ink: 'var(--art-ink, #1B2A4A)', paper: 'var(--art-paper, #FFFFFF)', soft: 'var(--art-soft, #E8EEFF)', line: 'var(--art-line, #C9D3EA)' };
  const svg = (body, label, vb = '0 0 320 220') => `<svg class="art" viewBox="${vb}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  const blob = (fill) => `<path d="M30 150c-8-52 30-104 92-112 50-7 74 18 112 14 40-4 66 26 58 70-8 46-56 74-120 76-74 3-136-6-142-48z" fill="${fill}"/>`;
  // A simple person: head, hair, body. x,y = top of head.
  const person = (x, y, { shirt = C.a, skin = C.skin, hair = C.ink, s = 1 } = {}) => `<g transform="translate(${x} ${y}) scale(${s})">
    <rect x="-22" y="34" width="44" height="58" rx="18" fill="${shirt}"/>
    <circle cx="0" cy="18" r="16" fill="${skin}"/>
    <path d="M-16 15c0-12 8-19 17-19 10 0 16 7 16 17-6-6-15-8-22-5-4 2-8 4-11 7z" fill="${hair}"/>
    <rect x="-5" y="31" width="10" height="7" rx="3" fill="${skin}"/></g>`;
  const doc = (x, y, w = 70, h = 90, lines = 6, accent = C.a) => `<g transform="translate(${x} ${y})">
    <rect width="${w}" height="${h}" rx="8" fill="${C.paper}" stroke="${C.line}" stroke-width="2"/>
    <rect x="10" y="10" width="${w * 0.45}" height="7" rx="3.5" fill="${accent}"/>
    ${Array.from({ length: lines }, (_, i) => `<rect x="10" y="${26 + i * 10}" width="${(w - 20) * (i % 3 === 2 ? 0.6 : 1)}" height="4" rx="2" fill="${C.line}"/>`).join('')}</g>`;

  const S = {
    search: () => svg(`${blob(C.soft)}
      ${doc(60, 52, 66, 86, 6)}${doc(98, 40, 66, 86, 6, C.d)}
      <circle cx="196" cy="104" r="34" fill="${C.paper}" stroke="${C.a}" stroke-width="10"/>
      <circle cx="196" cy="104" r="22" fill="${C.soft}"/>
      <path d="M220 130l34 34" stroke="${C.ink}" stroke-width="14" stroke-linecap="round"/>
      <path d="M186 104l7 7 14-15" fill="none" stroke="${C.d}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="262" cy="56" r="9" fill="${C.c}"/><circle cx="46" cy="70" r="6" fill="${C.b}"/>`, 'Searching job adverts'),

    cv: () => svg(`${blob(C.soft)}
      <g transform="rotate(-6 150 110)">${doc(96, 34, 104, 140, 9)}</g>
      <circle cx="118" cy="68" r="12" fill="${C.b}"/>
      <path d="M210 70l40-40 18 18-40 40-24 6z" fill="${C.c}"/><path d="M250 30l18 18" stroke="${C.ink}" stroke-width="4"/>
      <circle cx="236" cy="150" r="22" fill="${C.d}"/><path d="M226 150l7 7 13-14" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="60" cy="60" r="7" fill="${C.c}"/>`, 'A CV being tailored'),

    interview: () => svg(`${blob(C.soft)}
      <rect x="40" y="150" width="240" height="10" rx="5" fill="${C.ink}" opacity=".85"/>
      ${person(100, 66, { shirt: C.a })}${person(222, 62, { shirt: C.d, skin: C.skin2, hair: C.ink })}
      <rect x="140" y="30" width="62" height="34" rx="12" fill="${C.paper}" stroke="${C.line}" stroke-width="2"/><path d="M156 64l-6 12 16-12" fill="${C.paper}" stroke="${C.line}" stroke-width="2"/>
      <circle cx="158" cy="47" r="4" fill="${C.a}"/><circle cx="171" cy="47" r="4" fill="${C.a}"/><circle cx="184" cy="47" r="4" fill="${C.a}"/>
      ${doc(142, 112, 36, 38, 2)}`, 'A job interview'),

    handshake: () => svg(`${blob(C.soft)}
      <path d="M60 128l58-26 36 16-26 30z" fill="${C.a}"/><path d="M260 128l-58-26-36 16 26 30z" fill="${C.d}"/>
      <path d="M128 132c10-14 26-22 38-16l26 14c8 5 4 16-6 14l-16-4 10 8c6 5 0 14-8 10l-12-7 6 7c5 6-2 13-9 9l-12-8c-8 6-18-2-12-10z" fill="${C.skin}"/>
      <path d="M192 124c-6 0-14 2-18 6" stroke="${C.skin2}" stroke-width="4" fill="none" stroke-linecap="round"/>
      <circle cx="160" cy="62" r="20" fill="${C.c}"/><path d="M151 62l6 6 12-13" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="78" cy="70" r="6" fill="${C.b}"/><circle cx="250" cy="72" r="8" fill="${C.b}"/>`, 'An offer accepted'),

    growth: () => svg(`${blob(C.soft)}
      <rect x="70" y="128" width="30" height="40" rx="6" fill="${C.b}"/><rect x="112" y="104" width="30" height="64" rx="6" fill="${C.a}"/>
      <rect x="154" y="82" width="30" height="86" rx="6" fill="${C.a}"/><rect x="196" y="56" width="30" height="112" rx="6" fill="${C.d}"/>
      <path d="M72 118l44-26 42-18 46-28" fill="none" stroke="${C.c}" stroke-width="6" stroke-linecap="round"/>
      <path d="M196 40l16 4-4 16" fill="none" stroke="${C.c}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="56" y="168" width="196" height="6" rx="3" fill="${C.ink}" opacity=".8"/>`, 'Progress growing'),

    ask: () => svg(`${blob(C.soft)}
      ${person(96, 74, { shirt: C.a })}
      <rect x="150" y="40" width="120" height="56" rx="16" fill="${C.a}"/><path d="M168 96l-10 16 26-16" fill="${C.a}"/>
      <rect x="166" y="56" width="88" height="7" rx="3.5" fill="#fff" opacity=".9"/><rect x="166" y="72" width="60" height="7" rx="3.5" fill="#fff" opacity=".7"/>
      <rect x="170" y="112" width="96" height="44" rx="14" fill="${C.paper}" stroke="${C.line}" stroke-width="2"/>
      <path d="M200 134l7-15 7 15m-11-5h8" stroke="${C.d}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="236" cy="128" r="5" fill="${C.c}"/>`, 'Asking the AI assistant'),

    welcome: () => svg(`${blob(C.soft)}
      ${person(98, 64, { shirt: C.d, skin: C.skin2 })}${person(160, 52, { shirt: C.a, s: 1.08 })}${person(222, 66, { shirt: C.c })}
      <path d="M40 170h240" stroke="${C.ink}" stroke-width="6" stroke-linecap="round" opacity=".8"/>
      <circle cx="60" cy="56" r="8" fill="${C.b}"/><circle cx="268" cy="44" r="6" fill="${C.d}"/>`, 'People starting new jobs'),

    calendar: () => svg(`${blob(C.soft)}
      <rect x="86" y="44" width="148" height="128" rx="14" fill="${C.paper}" stroke="${C.line}" stroke-width="2"/>
      <rect x="86" y="44" width="148" height="30" rx="14" fill="${C.a}"/><rect x="86" y="62" width="148" height="12" fill="${C.a}"/>
      ${[0, 1, 2, 3].map(r => [0, 1, 2, 3, 4].map(c => `<rect x="${100 + c * 26}" y="${86 + r * 20}" width="16" height="12" rx="3" fill="${r === 1 && c === 3 ? C.d : C.line}"/>`).join('')).join('')}
      <circle cx="248" cy="150" r="22" fill="${C.c}"/><path d="M248 138v13l9 6" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>`, 'Interview dates and follow-ups'),

    // ---- AI scenes ----
    aiwriter: () => svg(`${blob(C.soft)}
      ${doc(150, 40, 96, 128, 8)}
      <path d="M160 140h46" stroke="${C.d}" stroke-width="5" stroke-linecap="round"/><path d="M160 152h30" stroke="${C.d}" stroke-width="5" stroke-linecap="round" opacity=".6"/>
      <g transform="rotate(-38 236 128)"><rect x="226" y="88" width="14" height="70" rx="4" fill="${C.c}"/><path d="M226 158h14l-7 14z" fill="${C.ink}"/></g>
      <rect x="54" y="78" width="80" height="66" rx="22" fill="${C.a}"/>
      <rect x="66" y="94" width="56" height="28" rx="14" fill="${C.paper}"/>
      <circle cx="82" cy="108" r="6" fill="${C.a}"/><circle cx="106" cy="108" r="6" fill="${C.a}"/>
      <path d="M94 78v-14" stroke="${C.ink}" stroke-width="4" stroke-linecap="round"/><circle cx="94" cy="60" r="7" fill="${C.c}"/>
      <rect x="68" y="144" width="52" height="28" rx="10" fill="${C.b}"/>
      <path d="M268 54l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="${C.c}"/><path d="M40 52l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="${C.b}"/>`, 'An AI assistant writing a CV'),
    match: () => svg(`${blob(C.soft)}
      ${doc(42, 58, 74, 98, 7)}
      <rect x="202" y="70" width="82" height="76" rx="12" fill="${C.paper}" stroke="${C.line}" stroke-width="2"/>
      <rect x="226" y="86" width="34" height="24" rx="5" fill="${C.a}"/><path d="M236 86v-6h14v6" stroke="${C.a}" stroke-width="4" fill="none"/>
      <rect x="216" y="120" width="54" height="5" rx="2.5" fill="${C.line}"/><rect x="216" y="131" width="36" height="5" rx="2.5" fill="${C.line}"/>
      <path d="M118 106c30-46 54-46 84-6" stroke="${C.a}" stroke-width="4" fill="none" stroke-dasharray="7 7" stroke-linecap="round"/>
      <circle cx="160" cy="70" r="27" fill="${C.d}"/><text x="160" y="77" text-anchor="middle" font-family="system-ui,sans-serif" font-size="19" font-weight="800" fill="#fff">92%</text>
      <path d="M272 44l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="${C.c}"/><circle cx="34" cy="48" r="7" fill="${C.b}"/>`, 'Your CV matched to a job'),
    robot: () => svg(`${blob(C.soft)}
      ${[0, 1, 2].map(i => `<g transform="translate(${150 + i * 10} ${46 + i * 34})"><rect width="118" height="28" rx="8" fill="${C.paper}" stroke="${C.line}" stroke-width="2"/><rect x="12" y="10" width="54" height="8" rx="4" fill="${i === 1 ? C.d : C.line}"/><circle cx="100" cy="14" r="8" fill="${C.d}"/><path d="M96 14l3 3 6-6" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/></g>`).join('')}
      <rect x="52" y="86" width="74" height="62" rx="20" fill="${C.a}"/><rect x="64" y="100" width="50" height="24" rx="12" fill="${C.paper}"/>
      <circle cx="79" cy="112" r="5" fill="${C.a}"/><circle cx="99" cy="112" r="5" fill="${C.a}"/>
      <path d="M89 86v-12" stroke="${C.ink}" stroke-width="4" stroke-linecap="round"/><circle cx="89" cy="70" r="6" fill="${C.c}"/>
      <rect x="62" y="148" width="54" height="24" rx="9" fill="${C.b}"/>
      <path d="M126 116h18" stroke="${C.ink}" stroke-width="5" stroke-linecap="round"/>
      <circle cx="266" cy="182" r="16" fill="${C.c}"/><path d="M266 173v10l6 4" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round"/>`, 'The daily job robot collecting matching jobs'),
    shield: () => svg(`${blob(C.soft)}
      ${doc(70, 44, 80, 108, 8)}
      <path d="M200 54l52 18v34c0 34-24 56-52 66-28-10-52-32-52-66V72z" fill="${C.a}"/>
      <rect x="182" y="104" width="36" height="30" rx="6" fill="${C.paper}"/><path d="M190 104v-8a10 10 0 0 1 20 0v8" stroke="${C.paper}" stroke-width="6" fill="none"/>
      <circle cx="200" cy="118" r="5" fill="${C.a}"/>
      <path d="M268 50l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="${C.c}"/>`, 'Your details kept private and ready for application forms')
  };

  // ---- side rails: illustrated helpers that fill the empty space on wide screens (hidden on smaller ones) ----
  const CARDS = {
    writer: ['aiwriter', 'Your AI CV writer', 'Paste any advert. A senior CV writer fits the job into your own Word CV, a recruiter-reviewer checks it is realistic, and it is written in your voice.', 'Tailor for an advert', '#/new'],
    robot: ['robot', 'Your job robot', 'Every morning it gathers new roles in your field, including LinkedIn, Totaljobs and Reed adverts via Google Jobs.', 'See jobs for you', '#/jobs'],
    match: ['match', 'Scored against your CVs', 'Every job is matched to the skills on all your CVs, with your town first. Pick one and press Tailor.', 'Paste an advert', '#/new'],
    forms: ['shield', 'Workday-ready', 'Fill in your details and work history once, then copy them into Workday, Taleo or SuccessFactors in seconds.', 'Career profile', '#/profile'],
    prep: ['interview', 'Interview prep', 'Likely questions, STAR stories and a mock interviewer for each application.', 'Open Prep', '#/prep'],
    track: ['growth', 'Track every application', 'Follow-ups, interviews and offers in one pipeline, with reminders.', 'Pipeline', '#/pipeline'],
    ask: ['ask', 'Ask AI', 'Ask anything about a job, your CV or the company, with answers from your own documents.', 'Applications', '#/pipeline']
  };
  const RAILS = { dashboard: ['writer', 'robot'], jobs: ['robot', 'match'], profile: ['forms', 'writer'], app: ['writer', 'prep'], pipeline: ['track', 'prep'], prep: ['prep', 'ask'], settings: ['forms', 'robot'] };
  const TIPS = ['Tailor the CV for every application: recruiters spend seconds on the first page.', 'Apply within 3 days of a job being posted: early applicants get read first.', 'Follow up 5 working days after applying, briefly and politely.', 'Keep one CV per skill set: Applywise picks the best one for each job.', 'Tick a new bullet only if you really did that work: it will come up at interview.', 'A short, specific cover letter beats a long generic one.'];
  function rails(view) {
    const pair = RAILS[view] || ['writer', 'match'];
    const tip = TIPS[(new Date().getDate() + pair[0].length) % TIPS.length];
    return pair.map((k, i) => {
      const [scene, title, text, cta, href] = CARDS[k];
      const el = document.createElement('aside');
      el.className = 'rail ' + (i ? 'rail-r' : 'rail-l'); el.setAttribute('aria-label', title);
      el.innerHTML = `<div class="rail-card"><div class="rail-art">${S[scene]()}</div><h3>${title}</h3><p>${text}</p><a class="btn ghost small" href="${href}">${cta}</a></div>`
        + (i ? '' : `<div class="rail-tip"><span class="rail-tip-h">Tip of the day</span><p>${tip}</p></div>`);
      return el;
    });
  }

  window.CVT = window.CVT || {};
  window.CVT.art = { scene: name => (S[name] || S.search)(), names: Object.keys(S), rails };
})();
