/*
 * art.js — original job-themed illustrations (inline SVG, no image files, crisp at any size).
 * Colours follow the theme (light and dark) through CSS variables.
 * Scenes: search, cv, interview, handshake, growth, ask, welcome, calendar.
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
      <circle cx="248" cy="150" r="22" fill="${C.c}"/><path d="M248 138v13l9 6" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>`, 'Interview dates and follow-ups')
  };

  window.CVT = window.CVT || {};
  window.CVT.art = { scene: name => (S[name] || S.search)(), names: Object.keys(S) };
})();
