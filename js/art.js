/*
 * art.js — original job-themed illustrations (inline SVG, no image files, crisp at any size).
 * Colours follow the theme (light and dark) through CSS variables.
 * Scenes: search, cv, interview, handshake, growth, ask, welcome, calendar, aiwriter, match, robot, shield, seeker, phone, coach, celebrate.
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

  // ---------- detailed people (job seekers), drawn to feel warm and human ----------
  const SKIN = ['#F5CDAA', '#E2A97F', '#C68A62', '#8D5A3B', '#5E3B27'];
  const P = { coral: '#F27C6B', purple: '#7C5CFC', teal: '#22A699', navy: '#22305A', gold: '#F2B84B', sky: '#6FA8F5', plum: '#8E4D86', grey: '#3A4254' };
  /** A standing person, feet at (x, y). pose: down | wave | hold | phone | point | cheer | folder. item for hold: laptop | doc. */
  function fig({ x, y, s = 1, flip = false, skin = SKIN[1], hair = '#2B2118', style = 'short', top = P.purple, bottom = P.navy, skirt = false, shoe = '#1E2433', pose = 'down', item = '' }) {
    const arm = (d, hx, hy) => `<path d="${d}" stroke="${top}" stroke-width="10" stroke-linecap="round" fill="none"/><circle cx="${hx}" cy="${hy}" r="5.2" fill="${skin}"/>`;
    const L = { down: arm('M-19 -124 Q-27 -104 -26 -84', -26, -82), hold: arm('M-19 -124 Q-31 -104 -9 -98', -9, -98), cheer: arm('M-19 -124 Q-36 -142 -31 -168', -31, -171) };
    const R = { down: arm('M19 -124 Q27 -104 26 -84', 26, -82), wave: arm('M19 -124 Q37 -130 35 -160', 35, -163), hold: arm('M19 -124 Q31 -104 9 -98', 9, -98),
      phone: arm('M19 -124 Q34 -112 13 -140', 13, -141), point: arm('M19 -124 Q40 -126 60 -134', 61, -134), cheer: arm('M19 -124 Q36 -142 31 -168', 31, -171), folder: arm('M19 -124 Q27 -104 26 -86', 26, -84) };
    const left = L[pose] || L[pose === 'cheer' ? 'cheer' : (pose === 'hold' ? 'hold' : 'down')] || L.down, right = R[pose] || R.down;
    const legs = skirt
      ? `<rect x="-10" y="-44" width="7" height="40" rx="3.5" fill="${skin}"/><rect x="3" y="-44" width="7" height="40" rx="3.5" fill="${skin}"/><path d="M-17 -80 L-25 -40 Q0 -34 25 -40 L17 -80 Z" fill="${bottom}"/>`
      : `<path d="M-16 -80 L-17 -6 L-3 -6 L0 -58 L3 -6 L17 -6 L16 -80 Z" fill="${bottom}"/>`;
    const hairBack = style === 'long' ? `<path d="M-18 -156 Q-21 -122 -15 -110 L15 -110 Q21 -122 18 -156 Z" fill="${hair}"/>` : '';
    const hairTop = {
      short: `<path d="M-15.5 -155 Q-16 -174 0 -174 Q16 -174 15.5 -155 Q13 -165 1 -165 Q-9 -165 -15.5 -155 Z" fill="${hair}"/>`,
      long: `<path d="M-16 -150 Q-17 -175 0 -175 Q17 -175 16 -150 Q14 -166 2 -166 Q-12 -164 -16 -150 Z" fill="${hair}"/>`,
      bun: `<circle cx="0" cy="-177" r="7" fill="${hair}"/><path d="M-15.5 -154 Q-16 -174 0 -174 Q16 -174 15.5 -154 Q12 -166 0 -166 Q-12 -166 -15.5 -154 Z" fill="${hair}"/>`,
      curly: [[-13, -163], [-7, -170], [1, -172], [9, -169], [14, -162], [-16, -155], [16, -155]].map(([a, b]) => `<circle cx="${a}" cy="${b}" r="6.5" fill="${hair}"/>`).join(''),
      hijab: ''
    }[style] || '';
    const head = style === 'hijab'
      ? `<path d="M-19 -150 Q-19 -177 0 -177 Q19 -177 19 -150 L22 -124 Q0 -116 -22 -124 Z" fill="${hair}"/><ellipse cx="0" cy="-152" rx="11.5" ry="13.5" fill="${skin}"/>`
      : `<rect x="-5" y="-141" width="10" height="13" rx="3" fill="${skin}"/><ellipse cx="0" cy="-154" rx="15" ry="17" fill="${skin}"/>`;
    const face = `<circle cx="-5" cy="-155" r="1.8" fill="#1B2233"/><circle cx="5" cy="-155" r="1.8" fill="#1B2233"/><path d="M-4.5 -147.5 Q0 -143.5 4.5 -147.5" stroke="#1B2233" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="-9" cy="-149" r="2.6" fill="#F27C6B" opacity=".22"/><circle cx="9" cy="-149" r="2.6" fill="#F27C6B" opacity=".22"/>`;
    const held = pose === 'hold' && item === 'laptop' ? `<rect x="-26" y="-116" width="52" height="32" rx="4" fill="#E6EBF5" stroke="#C9D3EA" stroke-width="1.5"/><circle cx="0" cy="-100" r="3.5" fill="#C9D3EA"/>`
      : pose === 'hold' && item === 'doc' ? `<g transform="rotate(-6 0 -110)"><rect x="-24" y="-142" width="48" height="62" rx="5" fill="#fff" stroke="#C9D3EA" stroke-width="1.5"/><rect x="-16" y="-133" width="22" height="5" rx="2.5" fill="${P.purple}"/>${[0, 1, 2, 3].map(i => `<rect x="-16" y="${-123 + i * 9}" width="${i === 3 ? 18 : 32}" height="3.5" rx="1.75" fill="#C9D3EA"/>`).join('')}</g>`
      : pose === 'phone' ? `<rect x="7" y="-153" width="11" height="19" rx="2.5" fill="#1E2433"/>`
      : pose === 'folder' ? `<rect x="22" y="-104" width="22" height="28" rx="3" fill="${P.gold}" transform="rotate(8 33 -90)"/>` : '';
    const body = `<path d="M-21 -128 Q-25 -116 -22 -80 L22 -80 Q25 -116 21 -128 Q0 -137 -21 -128 Z" fill="${top}"/>`;
    return `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})">${hairBack}${legs}<ellipse cx="-9" cy="-4" rx="11" ry="5" fill="${shoe}"/><ellipse cx="9" cy="-4" rx="11" ry="5" fill="${shoe}"/>${body}${head}${hairTop}${face}${left}${right}${held}</g>`;
  }
  const shadow = (x, y, w) => `<ellipse cx="${x}" cy="${y}" rx="${w}" ry="7" fill="#1B2A4A" opacity=".08"/>`;
  const spark = (x, y, r = 8, c = P.gold) => `<path d="M${x} ${y - r}l${r * .3} ${r * .7} ${r * .7} ${r * .3}-${r * .7} ${r * .3}-${r * .3} ${r * .7}-${r * .3}-${r * .7}-${r * .7}-${r * .3} ${r * .7}-${r * .3}z" fill="${c}"/>`;
  const card = (x, y, w, h, inner = '') => `<g transform="translate(${x} ${y})"><rect width="${w}" height="${h}" rx="12" fill="${C.paper}" stroke="${C.line}" stroke-width="1.5"/>${inner}</g>`;
  const big = (body, label) => svg(`<defs><radialGradient id="pg" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="${C.soft}"/><stop offset="1" stop-color="${C.soft}" stop-opacity="0"/></radialGradient></defs><ellipse cx="200" cy="140" rx="190" ry="120" fill="url(#pg)"/>${body}`, label, '0 0 400 260');
  const plant = (x, y) => `<g transform="translate(${x} ${y})"><path d="M0 0 Q-14 -30 -4 -56 M0 0 Q12 -26 6 -50 M0 0 Q-2 -34 2 -66" stroke="${P.teal}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M-12 0 h24 l-4 22 h-16 z" fill="${P.coral}"/></g>`;

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
      <path d="M268 50l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="${C.c}"/>`, 'Your details kept private and ready for application forms'),

    // ---- people: job seekers working with their AI helper ----
    seeker: () => svg(`${blob(C.soft)}
      <rect x="190" y="62" width="92" height="70" rx="8" fill="${C.paper}" stroke="${C.line}" stroke-width="2"/>
      <rect x="200" y="72" width="38" height="6" rx="3" fill="${C.a}"/>
      ${[0, 1, 2, 3].map(i => `<rect x="200" y="${86 + i * 9}" width="${i === 3 ? 40 : 64}" height="4" rx="2" fill="${C.line}"/>`).join('')}
      <circle cx="262" cy="116" r="9" fill="${C.d}"/><path d="M257 116l3 3 6-6" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <rect x="230" y="132" width="12" height="14" fill="${C.line}"/>
      <rect x="40" y="146" width="250" height="8" rx="4" fill="${C.ink}" opacity=".85"/>
      <rect x="168" y="138" width="56" height="7" rx="3" fill="${C.line}"/>
      ${person(118, 50, { shirt: C.a, skin: C.skin2, hair: C.ink })}
      <path d="M134 100c14 10 26 24 38 38" stroke="${C.a}" stroke-width="12" stroke-linecap="round" fill="none"/><circle cx="174" cy="139" r="6" fill="${C.skin2}"/>
      <circle cx="258" cy="36" r="17" fill="${C.c}"/><path d="M258 25l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#fff"/>
      <path d="M246 50l-8 10" stroke="${C.c}" stroke-width="3" stroke-linecap="round" stroke-dasharray="3 5"/>`, 'A job seeker tailoring a CV with an AI helper'),
    phone: () => svg(`${blob(C.soft)}
      ${person(112, 48, { shirt: C.d, skin: C.skin, hair: '#6B3E26' })}
      <path d="M128 96c12 6 22 14 30 24" stroke="${C.d}" stroke-width="12" stroke-linecap="round" fill="none"/>
      <rect x="152" y="98" width="28" height="48" rx="6" fill="${C.ink}"/><rect x="156" y="104" width="20" height="34" rx="3" fill="${C.paper}"/>
      <circle cx="160" cy="126" r="6" fill="${C.skin}"/>
      ${[0, 1, 2].map(i => `<g transform="translate(${196 + (i % 2) * 14} ${42 + i * 40})"><rect width="88" height="30" rx="8" fill="${C.paper}" stroke="${C.line}" stroke-width="2"/><rect x="10" y="9" width="44" height="5" rx="2.5" fill="${C.ink}" opacity=".7"/><rect x="10" y="18" width="30" height="4" rx="2" fill="${C.line}"/><circle cx="72" cy="15" r="9" fill="${i === 2 ? C.c : C.d}"/></g>`).join('')}
      <path d="M182 110c6-2 10-6 14-12" stroke="${C.b}" stroke-width="3" fill="none" stroke-dasharray="3 5" stroke-linecap="round"/>
      <rect x="70" y="146" width="84" height="10" rx="5" fill="${C.ink}" opacity=".15"/>`, 'A job seeker browsing matched jobs on a phone'),
    coach: () => svg(`${blob(C.soft)}
      <rect x="40" y="152" width="240" height="8" rx="4" fill="${C.ink}" opacity=".85"/>
      ${person(88, 64, { shirt: C.b, skin: C.skin, hair: C.c })}${person(232, 60, { shirt: C.a, skin: C.skin2, hair: C.ink })}
      ${doc(132, 84, 56, 66, 5, C.d)}
      <path d="M172 118l8 8 14-16" stroke="${C.d}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="44" y="22" width="58" height="30" rx="11" fill="${C.paper}" stroke="${C.line}" stroke-width="2"/><path d="M66 52l-4 10 12-10" fill="${C.paper}" stroke="${C.line}" stroke-width="2"/>
      <rect x="54" y="32" width="38" height="4" rx="2" fill="${C.line}"/><rect x="54" y="40" width="26" height="4" rx="2" fill="${C.line}"/>
      <rect x="208" y="16" width="60" height="32" rx="12" fill="${C.a}"/><path d="M230 48l2 10 10-10" fill="${C.a}"/>
      <path d="M238 23l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fff"/>`, 'An expert coach reviewing a CV with a job seeker'),
    celebrate: () => svg(`${blob(C.soft)}
      ${person(160, 66, { shirt: C.d, skin: C.skin, hair: '#3B2A20' })}
      <path d="M140 108l-20-40M180 108l22-42" stroke="${C.d}" stroke-width="12" stroke-linecap="round"/>
      <circle cx="119" cy="66" r="7" fill="${C.skin}"/><circle cx="203" cy="64" r="7" fill="${C.skin}"/>
      <g transform="rotate(12 222 46)"><rect x="200" y="18" width="44" height="54" rx="6" fill="${C.paper}" stroke="${C.line}" stroke-width="2"/><rect x="208" y="28" width="22" height="5" rx="2.5" fill="${C.a}"/><rect x="208" y="38" width="28" height="4" rx="2" fill="${C.line}"/><rect x="208" y="46" width="20" height="4" rx="2" fill="${C.line}"/><circle cx="230" cy="60" r="6" fill="${C.d}"/></g>
      ${[[70, 40, C.c], [96, 26, C.a], [260, 96, C.b], [250, 140, C.c], [62, 110, C.d], [280, 60, C.a], [44, 76, C.b]].map(([x, y, c], i) => `<rect x="${x}" y="${y}" width="9" height="5" rx="2" fill="${c}" transform="rotate(${i * 37} ${x} ${y})"/>`).join('')}
      <path d="M60 178h200" stroke="${C.ink}" stroke-width="6" stroke-linecap="round" opacity=".8"/>`, 'A job seeker celebrating a job offer'),

    // ---- detailed people scenes ----
    team: () => big(`${plant(44, 236)}
      ${card(18, 34, 96, 74, `<rect x="12" y="12" width="40" height="7" rx="3.5" fill="${P.purple}"/>${[0, 1, 2].map(i => `<rect x="12" y="${28 + i * 10}" width="${i === 2 ? 44 : 70}" height="4" rx="2" fill="${C.line}"/>`).join('')}<circle cx="80" cy="60" r="9" fill="${P.teal}"/><path d="M75.5 60l3 3 6-6" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>`)}
      ${card(288, 22, 96, 50, `<circle cx="26" cy="25" r="16" fill="${P.teal}"/><text x="26" y="30" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="800" fill="#fff">92%</text><rect x="50" y="16" width="34" height="5" rx="2.5" fill="${C.ink}" opacity=".7"/><rect x="50" y="27" width="24" height="4" rx="2" fill="${C.line}"/>`)}
      <g transform="translate(176 14)"><rect width="58" height="34" rx="14" fill="${P.purple}"/><path d="M18 34l-2 10 10-10" fill="${P.purple}"/>${spark(29, 17, 8, '#fff')}</g>
      ${shadow(130, 242, 34)}${shadow(212, 244, 36)}${shadow(292, 242, 34)}
      ${fig({ x: 130, y: 240, s: .92, skin: SKIN[0], hair: '#3B2A20', style: 'long', top: P.coral, bottom: P.navy, pose: 'hold', item: 'laptop' })}
      ${fig({ x: 212, y: 242, s: 1.02, skin: SKIN[3], hair: '#1B1612', style: 'short', top: P.teal, bottom: P.grey, pose: 'wave' })}
      ${fig({ x: 292, y: 240, s: .92, skin: SKIN[2], hair: '#5A3A22', style: 'curly', top: P.gold, bottom: P.purple, skirt: true, pose: 'folder' })}
      ${spark(360, 118, 7, P.coral)}${spark(28, 140, 6, P.purple)}`, 'Job seekers working with their AI career helper'),
    searcher: () => big(`${shadow(150, 244, 38)}
      ${fig({ x: 150, y: 242, s: 1, skin: SKIN[2], hair: '#2A1C14', style: 'bun', top: P.purple, bottom: P.navy, pose: 'phone' })}
      ${[0, 1, 2].map(i => card(212 + (i % 2) * 16, 40 + i * 62, 150, 48, `<rect x="14" y="14" width="66" height="6" rx="3" fill="${C.ink}" opacity=".7"/><rect x="14" y="27" width="46" height="4" rx="2" fill="${C.line}"/><circle cx="124" cy="24" r="13" fill="${i === 2 ? P.gold : P.teal}"/><text x="124" y="28.5" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" font-weight="800" fill="#fff">${[94, 88, 71][i]}</text>`)).join('')}
      <path d="M176 92 Q196 80 210 66" stroke="${P.sky}" stroke-width="3" fill="none" stroke-dasharray="4 6" stroke-linecap="round"/>
      ${plant(66, 236)}${spark(70, 70, 8, P.gold)}`, 'A job seeker finding matched jobs on a phone'),
    writer2: () => big(`${shadow(150, 244, 38)}
      ${fig({ x: 150, y: 242, s: 1.05, skin: SKIN[4], hair: '#151110', style: 'short', top: P.sky, bottom: P.navy, pose: 'hold', item: 'doc' })}
      <circle cx="292" cy="78" r="38" fill="${P.purple}" opacity=".14"/><circle cx="292" cy="78" r="26" fill="${P.purple}"/>${spark(292, 78, 13, '#fff')}
      <path d="M262 98 Q222 116 186 108" stroke="${P.purple}" stroke-width="3" fill="none" stroke-dasharray="4 6" stroke-linecap="round"/>
      ${card(246, 134, 128, 72, `<rect x="12" y="12" width="70" height="5" rx="2.5" fill="${P.teal}"/><rect x="12" y="24" width="100" height="4" rx="2" fill="${C.line}"/><rect x="12" y="34" width="86" height="4" rx="2" fill="${C.line}"/><rect x="12" y="48" width="44" height="12" rx="6" fill="${P.teal}" opacity=".18"/><rect x="62" y="48" width="44" height="12" rx="6" fill="${P.purple}" opacity=".18"/>`)}
      ${plant(52, 236)}`, 'A job seeker with a CV improved by an AI writer'),
    interviewer: () => big(`${shadow(130, 244, 34)}${shadow(272, 244, 34)}
      ${fig({ x: 130, y: 242, s: .98, skin: SKIN[1], hair: P.plum, style: 'hijab', top: P.teal, bottom: P.navy, pose: 'hold', item: 'doc' })}
      ${fig({ x: 272, y: 242, s: 1, flip: true, skin: SKIN[3], hair: '#1B1612', style: 'short', top: P.navy, bottom: P.grey, pose: 'point' })}
      <g transform="translate(70 30)"><rect width="74" height="38" rx="14" fill="${C.paper}" stroke="${C.line}" stroke-width="1.5"/><path d="M30 38l-4 11 14-11" fill="${C.paper}" stroke="${C.line}" stroke-width="1.5"/><rect x="12" y="12" width="48" height="4" rx="2" fill="${C.line}"/><rect x="12" y="22" width="34" height="4" rx="2" fill="${C.line}"/></g>
      <g transform="translate(258 26)"><rect width="74" height="38" rx="14" fill="${P.purple}"/><path d="M40 38l2 11 10-11" fill="${P.purple}"/>${[0, 1, 2].map(i => `<circle cx="${24 + i * 13}" cy="19" r="4" fill="#fff"/>`).join('')}</g>`, 'A job interview with a confident candidate'),
    winner: () => big(`${shadow(200, 244, 40)}
      ${fig({ x: 200, y: 242, s: 1.05, skin: SKIN[2], hair: '#24180F', style: 'long', top: P.teal, bottom: P.navy, pose: 'cheer' })}
      <g transform="rotate(10 300 70)">${card(270, 30, 66, 84, `<rect x="10" y="12" width="30" height="6" rx="3" fill="${P.purple}"/><rect x="10" y="26" width="46" height="4" rx="2" fill="${C.line}"/><rect x="10" y="35" width="38" height="4" rx="2" fill="${C.line}"/><circle cx="46" cy="64" r="10" fill="${P.teal}"/><path d="M41 64l3 3 6-6" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>`)}</g>
      ${[[90, 60, P.coral], [120, 34, P.purple], [306, 150, P.sky], [334, 196, P.gold], [76, 150, P.teal], [150, 80, P.gold], [258, 28, P.coral], [62, 104, P.purple]].map(([x, y, c], i) => `<rect x="${x}" y="${y}" width="11" height="6" rx="2" fill="${c}" transform="rotate(${i * 41} ${x} ${y})"/>`).join('')}
      ${spark(108, 120, 9, P.gold)}`, 'A job seeker celebrating a job offer'),
    formfill: () => big(`${shadow(120, 244, 36)}
      ${fig({ x: 120, y: 242, s: 1, skin: SKIN[0], hair: '#C9853F', style: 'bun', top: P.coral, bottom: P.navy, skirt: true, pose: 'point' })}
      ${card(196, 46, 168, 168, `<rect x="16" y="16" width="64" height="7" rx="3.5" fill="${P.purple}"/>${[0, 1, 2, 3, 4].map(i => `<rect x="16" y="${38 + i * 24}" width="100" height="12" rx="4" fill="${C.soft}" stroke="${C.line}"/><circle cx="140" cy="${44 + i * 24}" r="7" fill="${i < 4 ? P.teal : C.line}"/>${i < 4 ? `<path d="M136.5 ${44 + i * 24}l2.5 2.5 5-5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>` : ''}`).join('')}`)}
      <path d="M352 40l18 6v12c0 12-8 20-18 24-10-4-18-12-18-24V46z" fill="${P.teal}"/><path d="M345 58l5 5 9-10" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>`, 'A job seeker filling in an application form quickly')
  };

  // ---- side rails: illustrated helpers that fill the empty space on wide screens (hidden on smaller ones) ----
  const CARDS = {
    writer: ['writer2', 'Your AI CV writer', 'Paste any advert. A senior CV writer fits the job into your own Word CV, a recruiter-reviewer checks it is realistic, and it is written in your voice.', 'Tailor for an advert', '#/new'],
    robot: ['searcher', 'Your job robot', 'Every morning it gathers new roles in your field, including LinkedIn, Totaljobs and Reed adverts via Google Jobs.', 'See jobs for you', '#/jobs'],
    match: ['team', 'Scored against your CVs', 'Every job is matched to the skills on all your CVs, with your town first. Pick one and press Tailor.', 'Paste an advert', '#/new'],
    forms: ['formfill', 'Workday-ready', 'Fill in your details and work history once, then copy them into Workday, Taleo or SuccessFactors in seconds.', 'Career profile', '#/profile'],
    prep: ['interviewer', 'Interview prep', 'Likely questions, STAR stories and a mock interviewer for each application.', 'Open Prep', '#/prep'],
    track: ['winner', 'Track every application', 'Follow-ups, interviews and offers in one pipeline, with reminders.', 'Pipeline', '#/pipeline'],
    ask: ['writer2', 'Ask AI', 'Ask anything about a job, your CV or the company, with answers from your own documents.', 'Applications', '#/pipeline']
  };
  const RAILS = { dashboard: ['writer', 'robot'], jobs: ['robot', 'match'], profile: ['forms', 'writer'], app: ['writer', 'prep'], pipeline: ['track', 'prep'], prep: ['prep', 'ask'], settings: ['forms', 'robot'] };
  const TIPS = ['Tailor the CV for every application: recruiters spend seconds on the first page.', 'Apply within 3 days of a job being posted: early applicants get read first.', 'Follow up 5 working days after applying, briefly and politely.', 'Keep one CV per skill set: Applywise picks the best one for each job.', 'Tick a new bullet only if you really did that work: it will come up at interview.', 'A short, specific cover letter beats a long generic one.'];
  const PH_RAIL = { writer: 'aiwriter', robot: 'search', match: 'match', forms: 'seeker', prep: 'interview', track: 'celebrate', ask: 'ask' };
  function rails(view) {
    const pair = RAILS[view] || ['writer', 'match'];
    const tip = TIPS[(new Date().getDate() + pair[0].length) % TIPS.length];
    return pair.map((k, i) => {
      const [scene, title, text, cta, href] = CARDS[k];
      const el = document.createElement('aside');
      el.className = 'rail ' + (i ? 'rail-r' : 'rail-l'); el.setAttribute('aria-label', title);
      el.innerHTML = `<div class="rail-card"><div class="rail-art">${photo(PH_RAIL[k] || scene, scene)}</div><h3>${title}</h3><p>${text}</p><a class="btn ghost small" href="${href}">${cta}</a></div>`
        + (i ? '' : `<div class="rail-tip"><span class="rail-tip-h">Tip of the day</span><p>${tip}</p></div>`);
      return el;
    });
  }

  window.CVT = window.CVT || {};
  /** A person illustration for each page's header. */
  const HEAD = { dashboard: 'team', jobs: 'searcher', pipeline: 'winner', prep: 'interviewer', profile: 'formfill', settings: 'writer2', help: 'team', autopilot: 'searcher' };
  // ---- real photographs (free Unsplash licence: free to use, no payment, no sign-up) ----
  // Loaded from Unsplash's image CDN without sending which page you are on. If a photo cannot load
  // (offline, blocked), the drawn illustration of the same scene takes its place automatically.
  const PH = {
    team: ['1739298061757-7a3339cee982', 'A group of smiling colleagues standing together'],
    searcher: ['1730210730648-4c0618bb3e11', 'A man looking through job adverts on his laptop'],
    winner: ['1600880292203-757bb62b4baf', 'Two colleagues giving a high five at their desk'],
    interviewer: ['1698047682091-782b1e5c6536', 'A candidate shaking hands at an interview'],
    formfill: ['1686984096026-23d6e82f9749', 'A man filling in an application on his laptop'],
    writer2: ['1648412868424-9bee5023a257', 'A smiling woman working on her laptop in an office'],
    welcome: ['1713947505775-4e3af92a4ee7', 'A man celebrating good news at his laptop'],
    search: ['1612299273045-362a39972259', 'A smiling man browsing on his laptop'],
    growth: ['1576267423048-15c0040fec78', 'A happy team celebrating around a laptop'],
    aiwriter: ['1562071707-7249ab429b2a', 'A woman writing on her laptop'],
    match: ['1573164574572-cb89e39749b4', 'A team meeting around a table in a bright office'],
    robot: ['1570215171424-f74325192b55', 'Someone checking results on a laptop'],
    shield: ['1615791242458-caf8ff6245ac', 'A professional working calmly at a desk'],
    seeker: ['1590650153855-d9e808231d41', 'A woman working at her laptop'],
    phone: ['1577864662891-c7b77f10f638', 'A man on a video call on his phone'],
    coach: ['1758518727077-ffb66ffccced', 'A mentor talking with two colleagues'],
    celebrate: ['1758691737492-48e8fdd336f7', 'Colleagues celebrating together in the office'],
    help: ['1616587226960-4a03badbe8bf', 'A man on a video call at his laptop'],
    interview: ['1686771416282-3888ddaf249b', 'An interviewer and a candidate shaking hands'],
    handshake: ['1521791136064-7986c2920216', 'Two people shaking hands'],
    cv: ['1434030216411-0b793f4b4173', 'Someone writing notes at a desk'],
    calendar: ['1488190211105-8b0e65b80b4e', 'A notebook and laptop on a desk'],
    ask: ['1586985564150-11ee04838034', 'Two people talking on a video call']
  };
  const src = (id, w, h) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&crop=faces,entropy&w=${w}&h=${h}&q=72`;
  function photo(name, fb) {
    const p = PH[name]; if (!p) return (S[fb || name] || S.search)();
    const [id, alt] = p;
    return `<figure class="photo" data-fb="${fb || name}"><img src="${src(id, 640, 416)}" srcset="${src(id, 640, 416)} 1x, ${src(id, 1100, 715)} 2x" alt="${alt}" width="640" height="416" loading="lazy" decoding="async" referrerpolicy="no-referrer" onload="this.parentNode.classList.add('in')" onerror="window.CVT.art._fb(this)"></figure>`;
  }
  function _fb(img) { const f = img.closest('.photo'); if (!f) return; const k = f.dataset.fb; f.outerHTML = (S[k] || S.search)(); }

  function headArt(view) { const k = HEAD[view]; return k ? photo(view === 'help' ? 'help' : view === 'autopilot' ? 'robot' : k, k) : ''; }
  // The welcome / getting-started picture uses the drawn people when offline.
  S.welcome = S.winner;
  window.CVT.art = { scene: name => photo(name), drawn: name => (S[name] || S.search)(), names: Object.keys(S), rails, headArt, photo, _fb };
})();
