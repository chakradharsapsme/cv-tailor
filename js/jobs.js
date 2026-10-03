/*
 * jobs.js — live job feed, market insights and company intel.
 *   Live pull : Indeed, through the viewer's Indeed connector in claude.ai (no key, no cost).
 *   Anywhere  : one-click searches on other boards in your country, and paste-an-advert import.
 * Scoring is local and instant: skills in the advert vs. skills your CV already shows.
 */
(function () {
  const { html, raw, esc, $, $$, toast, today, ukDate, daysBetween, scoreCls, masterModel } = window.CVT.ui;
  const S = window.CVT.store, D = window.CVT.docx;
  const enc = encodeURIComponent;
  const SERVER = 'Indeed';
  const FEED_KEY = 'feed';
  const MAX_ITEMS = 400;

  // ---------------------------------------------------------------------
  // Skills vocabulary: the user's field (fields.js) + skills shared by every field + their own "extra skills".
  // "Display|alias|alias". Short all-caps aliases match case-sensitively.
  // ---------------------------------------------------------------------
  const FL = () => window.CVT.fields;
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  const compile = entry => {
    const names = entry.split('|').map(x => x.trim()).filter(Boolean);
    const cs = names.filter(n => /^[A-Z0-9\/&]{2,5}$/.test(n)), ci = names.filter(n => !/^[A-Z0-9\/&]{2,5}$/.test(n));
    const b = x => `(?<![A-Za-z0-9])(?:${x})(?![A-Za-z0-9])`;
    return { name: names[0], ci: ci.length ? new RegExp(b(ci.map(escRe).join('|')), 'i') : null, cs: cs.length ? new RegExp(b(cs.map(escRe).join('|'))) : null };
  };
  let TERMS = [], termsSig = '';
  /** Rebuild the vocabulary when the field or the user's own skills change. */
  function vocab(extra) {
    const f = FL().current(), own = String(extra || '').split(/[\n,;•]+/).map(x => x.trim()).filter(x => x.length > 1 && x.length <= 40 && x.split(/\s+/).length <= 5);
    const sig = f.id + '|' + own.join('|');
    if (sig === termsSig && TERMS.length) return;
    const seen = new Set();
    TERMS = f.lexicon.concat(FL().GENERAL, own.map(escLex)).map(compile).filter(t => { const k = t.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    termsSig = sig;
  }
  const escLex = x => x.replace(/\|/g, ' ');
  const hasTerm = (t, text) => (t.ci && t.ci.test(text)) || (t.cs && t.cs.test(text));
  const termsIn = text => { if (!TERMS.length) vocab(''); return termsIn2(text); };
  const termsIn2 = text => TERMS.filter(t => hasTerm(t, text || '')).map(t => t.name);

  // ---------------------------------------------------------------------
  // Small text helpers
  // ---------------------------------------------------------------------
  const STOP = new Set('the a an and or of for in to with at on by sap uk senior lead junior consultant ii iii'.split(' '));
  const tokens = s => String(s || '').toLowerCase().replace(/s\/4\s?hana/g, 's4hana').split(/[^a-z0-9]+/).filter(w => w.length > 1 && !STOP.has(w));
  function jaccard(a, b) {
    const A = new Set(tokens(a)), B = new Set(tokens(b));
    if (!A.size || !B.size) return 0;
    let n = 0; A.forEach(w => { if (B.has(w)) n++; });
    return n / (A.size + B.size - n);
  }
  const norm = s => String(s || '').toLowerCase().replace(/\b(ltd|limited|plc|llp|uk|group|inc)\b/g, '').replace(/[^a-z0-9]+/g, '');
  const keyOf = j => norm(j.title) + '|' + norm(j.company);

  const AGENCY = /recruit|resourc|staffing|talent|selection|personnel|search|hays|harvey nash|nigel frank|tenth revolution|frank group|eursap|oliver james|robert walters|robert half|michael page|page personnel|randstad|adecco|hudson|montash|intaso|lorien|spinks|computer futures|progressive|experis|la fosse|sanderson|hanson|ampersand|jonathan lee|gibbs|conexus|square one|sap people|hunter|jobs|careers|associates/i;
  const isAgency = c => AGENCY.test(c || '');
  // Only roles in the user's own field belong in the feed (IT / BA for an IT profile, nursing for a nurse, ...).
  const isItRole = j => FL().current().fits(j);
  const JUNIOR = /\b(junior|graduate|trainee|apprentice|assistant|coordinator|co-ordinator|entry[- ]level|intern)\b/i;

  /** "£60,000.00-£65,000.00 per year" → { kind: 'year', value: 62500 }. */
  function parsePay(s) {
    if (!s || /^(n\/a|none)$/i.test(String(s).trim())) return null;
    const nums = (String(s).match(/£\s?\d[\d,]*(?:\.\d+)?k?/gi) || []).map(x => { const v = parseFloat(x.replace(/[£,\sk]/gi, '')); return /k$/i.test(x) ? v * 1000 : v; });
    if (!nums.length) return null;
    const v = nums.reduce((a, b) => a + b, 0) / nums.length;
    if (/day|daily|p\/d|per diem/i.test(s) || (v >= 150 && v <= 2000)) return { kind: 'day', value: Math.round(v) };
    if (/hour|p\/h/i.test(s) || v < 150) return { kind: 'day', value: Math.round(v * 7.5) };
    return { kind: 'year', value: Math.round(v) };
  }
  const money = n => '£' + Math.round(n).toLocaleString('en-GB');

  // ---------------------------------------------------------------------
  // Connector access
  // ---------------------------------------------------------------------
  let mcpP = null;
  function mcp() {
    if (!(window.claude && window.claude.use)) return Promise.resolve(null);
    if (!mcpP) mcpP = window.claude.use('mcp').catch(() => null);
    return mcpP;
  }
  const available = async () => !!(await mcp());
  const ERR = {
    server_not_connected: 'Indeed is not connected to your account. Add the Indeed connector in your account settings, then reload.',
    needs_reauth: 'Your Indeed connection has expired. Reconnect it in claude.ai → Settings → Connectors.',
    not_in_manifest: 'You turned Indeed off for this page. Reload and choose Allow to pull jobs.',
    selection_required: 'Choose which Indeed connection to use in the prompt claude.ai showed, then try again.',
    blocked_by_policy: 'Your organisation blocks the Indeed connector.',
    approval_required: 'Your organisation needs approval for each Indeed call, which pages cannot request yet.',
    not_granted: 'Connectors are not enabled for this page.',
    capability_disabled: 'Connectors are not available in this view.',
    server_unavailable: 'Indeed did not answer in time. Try again in a minute.'
  };
  const errText = e => (e && ERR[e.code]) || (e && e.message) || 'Indeed could not be reached.';
  async function call(tool, input) {
    const m = await mcp();
    if (!m) { const e = new Error('Live job search works when Applywise is opened inside claude.ai with the Indeed connector.'); e.code = 'no_mcp'; throw e; }
    let r;
    try { r = await m.callTool(SERVER, tool, input); }
    catch (e) {
      if (e && e.retryable) { await new Promise(res => setTimeout(res, Math.min(e.retryAfterMs || 1500, 8000) + Math.random() * 600)); r = await m.callTool(SERVER, tool, input); }
      else throw e;
    }
    const p = r.payload;
    if (p && typeof p === 'object') return p;
    const text = typeof p === 'string' ? p : (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    try { return JSON.parse(text); } catch (_) { return { result: text }; }
  }

  // ---------------------------------------------------------------------
  // Indeed parsing
  // ---------------------------------------------------------------------
  const FIELD = /\*\*(Job Id|Company|Location|Posted on|Job Type|Compensation|View Job URL):\*\*\s*([^\n]*)/g;
  function fields(block) {
    const f = {}; let m; FIELD.lastIndex = 0;
    while ((m = FIELD.exec(block))) f[m[1]] = m[2].trim();
    return f;
  }
  const clean = v => (!v || /^(n\/a|none|null)$/i.test(v) ? '' : v);
  function parseSearch(md) {
    return String(md || '').split(/\*\*Job Title:\*\*/).slice(1).map(chunk => {
      const title = chunk.split('\n')[0].trim();
      const f = fields(chunk);
      const posted = Date.parse(f['Posted on'] || '');
      return {
        title, company: clean(f.Company), location: clean(f.Location), type: clean(f['Job Type']),
        pay: clean(f.Compensation), url: clean(f['View Job URL']), jobId: clean(f['Job Id']),
        posted: isNaN(posted) ? '' : new Date(posted).toISOString().slice(0, 10), source: 'Indeed'
      };
    }).filter(j => j.title);
  }
  function parseDetails(md) {
    const s = String(md || '');
    const title = ((s.match(/^\s*#+\s*(.+)$/m) || [])[1] || '').trim();
    const f = fields(s);
    const lastField = Math.max(...['Job Id', 'Company', 'Location', 'Posted on', 'Job Type', 'Compensation', 'View Job URL'].map(k => { const i = s.indexOf(`**${k}:**`); return i < 0 ? -1 : s.indexOf('\n', i); }));
    let body = lastField > 0 ? s.slice(lastField) : s;
    body = body.replace(/^\s*[*-]\s+/gm, '• ').replace(/\*\*?|__|#+\s*/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const payLine = (body.match(/^\s*(?:Pay|Salary|Rate|Day rate)\s*:\s*(.+)$/im) || [])[1] || '';
    return { title, company: clean(f.Company), location: clean(f.Location), type: clean(f['Job Type']), pay: clean(f.Compensation) || payLine.trim(), url: clean(f['View Job URL']), jd: body };
  }

  // ---------------------------------------------------------------------
  // Feed state and scoring
  // ---------------------------------------------------------------------
  async function loadFeed() {
    const f = await S.getKV(FEED_KEY, null);
    return Object.assign({ items: {}, lastRun: '', searches: null, errors: [] }, f || {});
  }
  const saveFeed = f => S.setKV(FEED_KEY, f);

  // ---------------------------------------------------------------------
  // Daily collector (GitHub Actions → data/jobs.json): Reed and Adzuna official free APIs.
  // ---------------------------------------------------------------------
  const COLLECTED_URL = 'https://chakradharsapsme.github.io/cv-tailor/data/jobs.json';
  const REPO_URL = 'https://github.com/chakradharsapsme/cv-tailor';
  let collectedAt = 0, collectedInfo = null;
  /** A job found by a search you have since removed. */
  function isExcluded(feed, j) {
    const ex = (feed.searches && feed.searches.excluded) || [];
    const q = String(j.query || '').toLowerCase();
    return !!q && ex.some(x => x && (q === x || q.startsWith(x + ' ')));
  }
  function mergeCollected(feed, data) {
    let added = 0;
    for (const c of data.jobs || []) {
      if (!c || !c.title || isExcluded(feed, c)) continue;
      const k = keyOf(c);
      const old = feed.items[k];
      if (old) {
        old.sources = [...new Set([...(old.sources || [old.source]), ...(c.sources || [c.source])])];
        if (!old.pay && c.pay) old.pay = c.pay;
        if (c.snippet && (!old.jd || (old.snippetOnly && c.snippet.length > old.jd.length))) { old.jd = c.snippet; old.snippetOnly = c.snippet.length < 1200; }
        if (!old.posted && c.posted) old.posted = c.posted;
        continue;
      }
      feed.items[k] = { key: k, title: c.title, company: c.company || '', location: c.location || '', type: c.type || '', pay: c.pay || '', url: c.url || '', posted: c.posted || '',
        source: c.source || 'Web', sources: c.sources || [c.source || 'Web'], jd: c.snippet || '', snippetOnly: (c.snippet || '').length < 1200, query: c.query || '',
        firstSeen: new Date().toISOString(), lastSeen: c.lastSeen || new Date().toISOString(), status: 'new' };
      added++;
    }
    return added;
  }
  /** Jobs gathered while you're away: the Claude daily robot (this page's shared store, doc robot/latest)
   *  and, optionally, the GitHub robot (data/jobs.json, Reed + Adzuna with free keys). */
  async function syncCollected(force) {
    if (!force && Date.now() - collectedAt < 10 * 60e3) return collectedInfo;
    collectedAt = Date.now();
    const robots = [];
    const feed = await loadFeed(); let added = 0;
    // 1. Claude daily robot
    try {
      const db = window.claude && window.claude.use ? await window.claude.use('db') : null;
      if (db) {
        const snap = await db.doc('robot/latest').get();
        if (snap.exists) {
          const d = snap.data();
          added += mergeCollected(feed, d);
          robots.push({ id: 'claude', name: 'Job robot', updated: d.updated, sources: d.sources || [], errors: d.errors || [], count: (d.jobs || []).length });
        }
      }
    } catch (_) {}
    // 2. GitHub robot (optional)
    const onPages = /github\.io$/.test(location.hostname);
    // The site owner's robot collects UK IT / business-analysis roles only: other visitors don't get them.
    const itUk = ['it', 'any'].includes(FL().current().id) && (window.CVT.countries ? window.CVT.countries.current() === 'GB' : true);
    for (const url of !itUk ? [] : onPages ? ['data/jobs.json', COLLECTED_URL] : [COLLECTED_URL]) {
      try {
        const r = await fetch(url + '?t=' + Math.floor(Date.now() / 600e3), { cache: 'no-store' });
        if (!r.ok) continue;
        const d = await r.json();
        if ((d.jobs || []).length || (d.sources || []).length) {
          added += mergeCollected(feed, d);
          robots.push({ id: 'github', name: 'GitHub robot', updated: d.updated, sources: d.sources || [], errors: d.errors || [], count: (d.jobs || []).length });
        }
        break;
      } catch (_) {}
    }
    feed.robots = robots;
    await saveFeed(feed);
    collectedInfo = { ok: robots.length > 0, added, robots };
    return collectedInfo;
  }

  /** An IT / business-analysis profile always keeps one business-analyst search. */
  const withBA = qs => { const q = qs.slice(0, 6); if (FL().current().id === 'it' && !q.some(x => /analyst/i.test(x))) { if (q.length >= 6) q.pop(); q.push('IT Business Analyst'); } return q; };
  // Skills that make useful searches on their own (not soft skills or methods).
  const GENERIC_TERMS = new Set(['Workshops', 'Agile', 'Stakeholder management', 'Change management', 'Business case', 'Team leadership', 'APIs', 'Approval workflow', 'PMP', 'PRINCE2',
    'Offshore delivery', 'Design authority', 'Pre-sales', 'Global template', 'Cutover', 'SIT', 'UAT', 'Hypercare', 'Gap analysis', 'User stories', 'Process mapping', 'Jira', 'Public sector', 'Security clearance',
    'Sustainability', 'AI', 'EDI', 'cXML', 'IDoc', 'UK VAT', 'GR/IR', 'Workflow', 'Catalogues', 'Functional specifications', 'Fit-to-standard', 'SAP Activate', 'Data migration',
    'Communication skills', 'Microsoft Office', 'Problem solving', 'Customer service', 'Training', 'Budget management', 'Data analysis', 'Negotiation', 'Driving licence', 'Health and safety', 'Project management', 'Git', 'Agile', 'Safeguarding', 'KPIs']);
  /** Searches built from your target job titles first, then the strongest skills on your CV. */
  async function defaultSearches() {
    const p = await S.getProfile();
    const roles = (p.targetRoles || []).filter(Boolean).slice(0, 4);
    let skills = [];
    try {
      const ev = await evidence();
      const pick = set => TERMS.map(t => t.name).filter(n => set.has(n) && !GENERIC_TERMS.has(n));
      if (ev.perCv && ev.perCv.length > 1) {
        // Several CVs: take the strongest skills from each, so every skill set gets searched.
        const lists = ev.perCv.map(c => pick(c.terms));
        for (let i = 0; skills.length < 4 && i < 6; i++) lists.forEach(l => { if (l[i] && !skills.includes(l[i]) && skills.length < 4) skills.push(l[i]); });
      } else skills = pick(ev.terms).slice(0, 4);
    } catch (_) {}
    if (!roles.length && p.currentTitle) roles.push(p.currentTitle);
    const qs = [...new Set(roles.concat(skills))];
    return withBA((qs.length ? qs : FL().current().titles).slice(0, 6));
  }
  const CO = () => window.CVT.countries;
  /** A place in the country: your target location if it is there, else the country itself. */
  const inOther = (code, loc) => Object.entries(CO().list).some(([k, c]) => k !== code && c.re.test(loc) && !CO().list[code].re.test(loc));
  const placeIn = (code, loc) => (loc && !/^(remote|anywhere)$/i.test(loc.trim()) && (CO().inCountry(code, loc) || CO().get(code).name === loc || !inOther(code, loc))) ? loc : CO().get(code).name;
  // Your town or city (and other preferred places in the country): jobs there rank first.
  const ALIAS = { bangalore: 'bengaluru', bengaluru: 'bangalore', bombay: 'mumbai', mumbai: 'bombay', gurgaon: 'gurugram', gurugram: 'gurgaon', madras: 'chennai', chennai: 'madras', calcutta: 'kolkata', kolkata: 'calcutta', nyc: 'new york', 'new york': 'nyc' };
  let NEAR = [];
  function setNear(code, locs) {
    const names = Object.values(CO().list).map(c => c.name.toLowerCase());
    const out = new Set();
    (locs || []).forEach(l => String(l || '').split(/[,/;]| or /).map(x => x.trim().toLowerCase()).filter(x => x.length > 2 && !names.includes(x) && !/^(remote|anywhere|hybrid|uk|usa|us|england|scotland|wales)$/.test(x) && !inOther(code, x)).forEach(x => { out.add(x); if (ALIAS[x]) out.add(ALIAS[x]); }));
    NEAR = [...out].map(x => new RegExp('\\b' + x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'));
    return [...out];
  }
  const isNear = j => !!(j.location && NEAR.some(re => re.test(j.location)));
  /** Jobs found for the country you are searching now (older results had no country and were UK). */
  const inCountryNow = (j, cfg) => (j.country || 'GB') === cfg.country || j.status === 'imported' || j.status === 'saved';
  /** Fingerprint of what the searches are built from: the default CV and the target titles. */
  async function cvSig() {
    const [p, masters] = await Promise.all([S.getProfile(), S.listMasters()]);
    const def = masters.find(m => m.isDefault) || masters[0];
    return [def ? def.id + ':' + ((def.data && def.data.byteLength) || 0) : '', (p.targetRoles || []).join('|'), String(p.extraSkills || '').length, p.field || ''].join('#');
  }
  async function searchesOf(feed) {
    const code = (feed.searches && CO().list[feed.searches.country]) ? feed.searches.country : CO().current();
    // Searches you didn't write yourself follow your latest CV and target titles automatically.
    if (feed.searches && feed.searches.auto) {
      const sig = await cvSig();
      if (sig !== feed.searches.cvSig) {
        resetEvidence();
        const before = (feed.searches.queries || []).join('|');
        feed.searches.queries = await defaultSearches(); feed.searches.cvSig = sig;
        if (before && before !== feed.searches.queries.join('|')) feed.searches.updatedFromCv = new Date().toISOString();
        await saveFeed(feed);
      }
    }
    const p = await S.getProfile();
    if (feed.searches && feed.searches.queries && feed.searches.queries.length) {
      const loc = placeIn(code, feed.searches.location || (p.targetLocations || [])[0]);
      return Object.assign({}, feed.searches, { country: code, location: loc, near: setNear(code, [loc].concat(p.targetLocations || [])), queries: feed.searches.auto ? withBA(feed.searches.queries) : feed.searches.queries.slice(0, 6) });
    }
    const loc = placeIn(code, (p.targetLocations || [])[0]);
    return { country: code, queries: await defaultSearches(), location: loc, near: setNear(code, [loc].concat(p.targetLocations || [])), remote: true, type: p.workPreference === 'Contract' ? 'contract' : '' };
  }

  let evidenceCache = null;
  /** Everything that proves a skill: the default CV, extra skills and achievements from the profile. */
  async function evidence() {
    const [p, masters] = await Promise.all([S.getProfile(), S.listMasters()]);
    FL().use(p); vocab(p.extraSkills);
    const def = masters.find(m => m.isDefault) || masters[0];
    const sig = termsSig + '|' + masters.map(m => m.id + ':' + ((m.data && m.data.byteLength) || 0)).join(',') + '|' + p.extraSkills + '|' + (p.achievements || []).join('|') + '|' + p.currentTitle;
    if (evidenceCache && evidenceCache.sig === sig) return evidenceCache;
    // Every CV counts: someone with an "SAP consultant" CV and a "business analyst" CV is matched on both skill sets.
    let cv = ''; const perCv = [];
    for (const m of masters) {
      try { const mm = await masterModel(m.id); if (mm) { const t = D.plainText(mm.model); cv += '\n' + t; perCv.push({ id: m.id, name: m.name, isDefault: !!m.isDefault, terms: new Set(termsIn(t)) }); } } catch (_) {}
    }
    void def;
    // Blank profile (no target roles or skills)? Your CVs decide the field: an SAP CV gets SAP / IT matching and searches.
    FL().setHint(cv.slice(0, 30000), 'cv'); FL().use(p);
    const text = [cv, p.extraSkills, (p.achievements || []).join('\n'), p.currentTitle].join('\n');
    evidenceCache = { sig, text, hasCv: !!cv.trim(), terms: new Set(termsIn(text)), perCv };
    return evidenceCache;
  }
  const resetEvidence = () => { evidenceCache = null; };

  function score(j, ev, queries) {
    const rel = Math.max(0, ...queries.map(q => {
      const qt = tokens(q); if (!qt.length) return 0;
      const tt = new Set(tokens(j.title + ' ' + (j.jd ? j.jd.slice(0, 600) : '')));
      return qt.filter(w => tt.has(w)).length / qt.length;
    }));
    const flags = [];
    let s;
    const asked = j.jd ? termsIn(j.jd) : termsIn(j.title);
    const have = asked.filter(t => ev.terms.has(t)), miss = asked.filter(t => !ev.terms.has(t));
    if (j.jd && asked.length >= 3) s = Math.round(25 * rel + 75 * (have.length / asked.length));
    else s = Math.round(35 + 40 * rel + Math.min(20, 8 * have.length) - Math.min(15, 5 * miss.length));
    if (JUNIOR.test(j.title)) { s -= 25; flags.push({ cls: 'warn', text: 'Below your level' }); }
    const age = j.posted ? daysBetween(j.posted) : null;
    if (age != null && age > 30) flags.push({ cls: 'warn', text: `Posted ${age}d ago: may be filled` });
    if (isAgency(j.company)) flags.push({ cls: 'muted', text: 'Agency' });
    const near = isNear(j);
    if (near) { s += 8; flags.unshift({ cls: 'ok', text: '📍 Near you' }); }
    // With several CVs: which one covers this advert best.
    let best = null;
    if (ev.perCv && ev.perCv.length > 1 && asked.length) {
      const r = ev.perCv.map(c => ({ c, n: asked.filter(t => c.terms.has(t)).length })).sort((x, y) => y.n - x.n || (y.c.isDefault ? 1 : 0) - (x.c.isDefault ? 1 : 0))[0];
      if (r && r.n) best = { id: r.c.id, name: r.c.name, n: r.n };
    }
    return { score: Math.max(0, Math.min(100, s)), quick: !(j.jd && asked.length >= 3), have, miss, flags, age, best, near };
  }

  /** Pipeline duplicates: same company and similar role, or a similar role via an agency in the last 45 days. */
  function duplicates(j, apps, selfId) {
    const out = [];
    for (const a of apps) {
      if (a.id === selfId) continue;
      const sim = jaccard(j.title || j.role, a.role);
      const sameCo = norm(j.company) && norm(j.company) === norm(a.company);
      const recent = daysBetween(a.created) <= 45;
      if (sameCo && sim >= 0.5) out.push({ app: a, why: 'same company and role' });
      else if (sim >= 0.75 && recent && (isAgency(j.company) || isAgency(a.company) || isAgency(a.agency))) out.push({ app: a, why: 'a very similar role via an agency: it may be the same job' });
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // Refresh (search) and details
  // ---------------------------------------------------------------------
  let running = null;
  async function refresh(onStep) {
    if (running) return running;
    running = (async () => {
      const feed = await loadFeed();
      const cfg = await searchesOf(feed);
      if (!cfg.queries.length) return { added: 0, found: 0, errors: [{ code: 'no_searches', text: 'Add the job titles you want in Career profile (or pick your field) so Applywise knows what to search for.' }] };
      const cc = CO().get(cfg.country);
      const locs = [cfg.location || cc.name].concat(cfg.remote ? ['remote'] : []);
      const plan = [];
      cfg.queries.slice(0, 6).forEach(q => locs.forEach(l => plan.push({ q, l })));
      const errors = []; let added = 0, found = 0;
      const useIndeed = await available();
      for (let i = 0; useIndeed && i < plan.length; i++) {
        const { q, l } = plan[i];
        onStep && onStep(i, plan.length, q, l);
        try {
          const res = await call('search_jobs', { search: q, location: l, country_code: cc.indeed, job_type: cfg.type || null });
          const jobs = parseSearch(res.result || res.text || '');
          found += jobs.length;
          for (const j of jobs) {
            const k = keyOf(j);
            const old = feed.items[k];
            if (old) { Object.assign(old, { url: j.url || old.url, jobId: j.jobId, posted: j.posted || old.posted, pay: old.pay || j.pay, lastSeen: new Date().toISOString() }); if ((old.country || 'GB') !== cfg.country) Object.assign(old, { country: cfg.country, location: j.location || old.location }); if (l === 'remote') old.remote = true; }
            else { feed.items[k] = Object.assign(j, { key: k, query: q, country: cfg.country, remote: l === 'remote', firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), status: 'new' }); added++; }
          }
        } catch (e) {
          errors.push({ code: e.code || 'error', text: errText(e) });
          if (['server_not_connected', 'needs_reauth', 'not_in_manifest', 'no_mcp', 'blocked_by_policy', 'not_granted', 'capability_disabled', 'approval_required'].includes(e.code)) break;
        }
      }
      // Career portals and remote boards, straight from the browser (no keys).
      try {
        const ev = await evidence();
        const qt = cfg.queries.map(tokens).filter(x => x.length);
        const frac = (q, set) => q.filter(w => set.has(w)).length / q.length;
        const relevant = j => {
          if (!isItRole(j)) return false;
          const tt = new Set(tokens(j.title)), bt = new Set(tokens(j.title + ' ' + (j.jd || '').slice(0, 1500)));
          const titleRel = Math.max(0, ...qt.map(q => frac(q, tt))), bodyRel = Math.max(0, ...qt.map(q => frac(q, bt)));
          const skills = termsIn(j.title + ' ' + (j.jd || '')).filter(t => ev.terms.has(t)).length;
          // The title must fit what you're looking for; the advert body alone is only enough for analyst/consultant-type titles that ask for your skills.
          const fl = FL().current(), offTrack = !!(fl.offTrack && fl.offTrack.test(j.title));
          const titleSkill = termsIn(j.title).some(t => ev.terms.has(t) && !GENERIC_TERMS.has(t));
          return titleRel >= 0.5 || (!offTrack && titleSkill && skills >= 3) || (!offTrack && bodyRel >= 0.67 && skills >= 3 && (fl.analyst ? fl.analyst.test(j.title) : fl.fits(j)));
        };
        const W = window.CVT.websources;
        const r = await W.search({ queries: cfg.queries, portals: cfg.portals, extraPortals: window.CVT.employers ? await window.CVT.employers.portals() : [], country: cfg.country, city: (cfg.near || [])[0] || '', field: FL().current().id, relevant, onStep: t => onStep && onStep(-1, 0, t) });
        found += r.jobs.length;
        for (const j of r.jobs) {
          const k = keyOf(j), old = feed.items[k];
          if (old) { old.sources = [...new Set([...(old.sources || [old.source]), j.source])]; if ((old.country || 'GB') !== j.country) Object.assign(old, { country: j.country, location: j.location, url: j.url || old.url }); if (!old.jd && j.jd) old.jd = j.jd; if (!old.pay && j.pay) old.pay = j.pay; old.lastSeen = new Date().toISOString(); }
          else { feed.items[k] = Object.assign(j, { key: k, query: '', firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), status: 'new' }); added++; }
        }
        // Drop earlier web results that no longer fit your searches (untouched ones only).
        Object.values(feed.items).forEach(j => { if (j.status === 'new' && /^(Careers · |Remotive|Jobicy|The Muse|Arbeitnow)/.test(j.source || '') && (!relevant(j) || (j.country || 'GB') !== cfg.country)) delete feed.items[j.key]; });
        feed.webRun = { at: new Date().toISOString(), bySource: r.bySource };
        if (r.errors.length) feed.webErrors = r.errors.slice(0, 5); else delete feed.webErrors;
      } catch (e) { errors.push({ code: 'web', text: 'Job sites: ' + (e.message || e) }); }
      // Keep the feed small: drop hidden/old items first.
      const all = Object.values(feed.items).sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''));
      if (all.length > MAX_ITEMS) all.slice(MAX_ITEMS).forEach(j => { if (j.status !== 'imported') delete feed.items[j.key]; });
      feed.lastRun = new Date().toISOString(); feed.errors = errors; feed.lastAdded = added;
      await saveFeed(feed);
      return { added, found, errors, feed };
    })();
    try { return await running; } finally { running = null; }
  }

  /** Full advert for one feed item. Indeed ids are short-lived, so the answer is checked against the title. */
  async function details(key, force) {
    const feed = await loadFeed();
    const j = feed.items[key]; if (!j) throw new Error('This job is no longer in the feed.');
    if (j.jd && !(force && j.snippetOnly)) return j;
    if (!j.jobId) throw new Error('Open the advert and paste it instead.');
    const res = await call('get_job_details', { job_id: j.jobId });
    const d = parseDetails(res.result || res.text || '');
    if (!d.jd || (d.title && jaccard(d.title, j.title) < 0.5)) { const e = new Error('Indeed returned a different advert. Refresh the feed and try again, or open the advert.'); e.code = 'mismatch'; throw e; }
    Object.assign(j, { jd: d.jd.slice(0, 20000), snippetOnly: false, pay: j.pay || d.pay, type: j.type || d.type, detailsAt: new Date().toISOString() });
    if (d.url) j.url = d.url;
    await saveFeed(feed);
    return j;
  }

  async function setStatus(key, status) {
    const feed = await loadFeed();
    if (feed.items[key]) { feed.items[key].status = status; await saveFeed(feed); }
  }

  const typeMap = t => /contract|fixed/i.test(t || '') ? (/fixed/i.test(t) ? 'Fixed-term' : 'Contract') : /perm|full/i.test(t || '') ? 'Permanent' : '';
  /** Which of your CVs fits this job best (most of the job's skills shown). */
  async function bestCv(j) {
    const ev = await evidence();
    if (!ev.perCv || !ev.perCv.length) return null;
    const want = termsIn((j.title || j.role || '') + ' ' + (j.jd || ''));
    const ranked = ev.perCv.map(c => ({ c, n: want.filter(t => c.terms.has(t)).length })).sort((x, y) => y.n - x.n || (y.c.isDefault ? 1 : 0) - (x.c.isDefault ? 1 : 0));
    return ranked[0] && (ranked[0].n > 0 || ranked.length === 1) ? Object.assign({ hits: ranked[0].n, of: want.length }, ranked[0].c) : null;
  }
  async function importJob(key) {
    let feed = await loadFeed();
    let j = feed.items[key]; if (!j) throw new Error('This job is no longer in the feed.');
    if (j.appId && await S.getApp(j.appId)) return j.appId;
    // Fetch the full advert first when only a summary is held, so the responsibilities come across.
    if (j.jobId && (!j.jd || j.snippetOnly)) { try { await details(key, true); feed = await loadFeed(); j = feed.items[key] || j; } catch (_) {} }
    const masters = await S.listMasters();
    const best = masters.length > 1 ? await bestCv(j) : null;
    const a = S.newApp((best && best.id) || (masters.find(m => m.isDefault) || masters[0] || {}).id);
    const p = parsePay(j.pay);
    Object.assign(a, {
      company: j.company, role: j.title, location: j.location + (j.remote ? ' (remote option)' : ''), url: j.url,
      contractType: typeMap(j.type), pay: j.pay || '', jd: j.jd || '',
      workMode: j.remote ? 'Remote' : /hybrid/i.test(j.jd || '') ? 'Hybrid' : '',
      notes: `Found on ${j.source} ${j.posted ? '(posted ' + ukDate(j.posted) + ')' : ''} by the job feed.${p ? ' Pay parsed as ' + money(p.value) + (p.kind === 'day' ? '/day.' : '/year.') : ''}${j.snippetOnly ? ' Only the advert summary was available: open the advert and paste the full text above for the best tailoring.' : ''}`
    });
    await S.saveApp(a);
    j.status = 'imported'; j.appId = a.id; await saveFeed(feed);
    return a.id;
  }

  // ---------------------------------------------------------------------
  // Company intel (Indeed company pages)
  // ---------------------------------------------------------------------
  async function companyIntel(name, title) {
    const ck = 'intel:' + norm(name) + ':' + norm(title);
    const cached = await S.getKV(ck, null);
    if (cached && daysBetween(cached.at) < 7) return cached.d;
    const res = await call('get_company_data', {
      companyName: name, jobTitle: title || undefined, language: 'en',
      location: { country: CO().get(CO().current()).indeed, usState: null, usStateCode: null, usCity: null },
      knowledgeCategories: { metadata: true, ratings: true, salaries: true }
    });
    const e = res.employerData || {}, det = ((e.dossier || {}).employerDetails) || {}, u = e.ugcStats || {}, sal = e.salaries || {};
    const pct = (y, n) => (y + n) ? Math.round(100 * y / (y + n)) : null;
    const rf = u.recommendFriend || {}, ss = u.salarySatisfaction || {};
    const iv = u.interview || {};
    const words = x => x ? String(x).toLowerCase().replace(/_/g, ' ') : '';
    const d = {
      name, url: e.companyPageUrl || '',
      sector: ((det.sectors || {}).results || []).map(x => x.localizedLabel).join(', '),
      size: det.employeesLocalizedLabel || '', revenue: det.revenueLocalizedLabel || '', founded: det.foundationDate && det.foundationDate.year,
      about: det.briefDescription || '',
      recommend: pct(rf.yesCount || 0, rf.noCount || 0), recommendN: (rf.yesCount || 0) + (rf.noCount || 0),
      salaryHappy: pct(ss.yesCount || 0, ss.noCount || 0),
      ceo: u.ceo_approval_percentage && u.ceo_approval_percentage.approval_percentage != null ? Math.round(100 * u.ceo_approval_percentage.approval_percentage) : null,
      interview: [words(iv.difficulty) && words(iv.difficulty) + ' difficulty', words(iv.experience) && words(iv.experience) + ' experience', words(iv.processLength) && 'about ' + words(iv.processLength)].filter(Boolean).join(', '),
      salary: sal.averageSalary ? { title: sal.forJobTitle, avg: sal.averageSalary, n: sal.count, type: sal.salaryType } : null
    };
    await S.setKV(ck, { at: new Date().toISOString(), d });
    return d;
  }
  function intelCard(d) {
    const rows = [
      d.sector && ['Sector', d.sector], d.size && ['Employees', d.size], d.revenue && ['Revenue', d.revenue], d.founded && ['Founded', d.founded],
      d.recommend != null && d.recommendN >= 5 && ['Would recommend', `${d.recommend}% of ${d.recommendN} reviewers`],
      d.salaryHappy != null && ['Happy with pay', d.salaryHappy + '%'], d.ceo != null && ['CEO approval', d.ceo + '%'],
      d.interview && ['Interviews', d.interview],
      d.salary && ['Avg. salary', `${money(d.salary.avg)} ${d.salary.type === 'YEARLY' ? 'a year' : ''} for “${d.salary.title}” (${d.salary.n} report${d.salary.n === 1 ? '' : 's'})`]
    ].filter(Boolean);
    return html`<div class="intel">
      ${d.about ? html`<p class="small">${d.about}</p>` : ''}
      ${rows.length ? html`<dl class="intel-list">${rows.map(r => html`<dt>${r[0]}</dt><dd>${r[1]}</dd>`)}</dl>` : html`<p class="muted small">Indeed has little public data on this employer. It may be small, new or an agency.</p>`}
      ${d.url ? html`<a class="link small" href="${d.url}" target="_blank" rel="noopener">Company page and reviews on Indeed</a>` : ''}
    </div>`;
  }

  // ---------------------------------------------------------------------
  // Other job boards in the country (deep links; they don't offer free open APIs)
  // ---------------------------------------------------------------------
  function boards(q, loc, code) {
    const c = CO().list[code] ? code : CO().current();
    return CO().get(c).boards(q, loc && loc !== CO().get(c).name ? loc : '');
  }

  // ---------------------------------------------------------------------
  // Market insights from every advert the app has seen
  // ---------------------------------------------------------------------
  async function market() {
    const [feed, apps, ev] = await Promise.all([loadFeed(), S.listApps(), evidence()]);
    const ads = Object.values(feed.items).filter(j => j.jd).map(j => j.jd).concat(apps.filter(a => (a.jd || '').length > 200).map(a => a.jd));
    const count = new Map();
    ads.forEach(t => termsIn(t).forEach(n => count.set(n, (count.get(n) || 0) + 1)));
    const skills = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n, pct: Math.round(100 * n / ads.length), onCv: ev.terms.has(name) }));
    const pays = Object.values(feed.items).map(j => parsePay(j.pay)).filter(Boolean).concat(apps.map(a => parsePay(a.pay)).filter(Boolean));
    const med = arr => { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    const day = pays.filter(p => p.kind === 'day').map(p => p.value), year = pays.filter(p => p.kind === 'year').map(p => p.value);
    return { ads: ads.length, skills, day: { n: day.length, med: med(day), lo: day.length ? Math.min(...day) : null, hi: day.length ? Math.max(...day) : null }, year: { n: year.length, med: med(year), lo: year.length ? Math.min(...year) : null, hi: year.length ? Math.max(...year) : null }, hasCv: ev.hasCv };
  }

  // ---------------------------------------------------------------------
  // Rate calculator (rough guide, not tax advice)
  // ---------------------------------------------------------------------
  function rateCalc({ rate, days = 220, benefits = 20, inside = false }) {
    const gross = rate * days;
    const umbrella = inside ? gross * (0.15 + 0.005) / 1.155 : 0; // employer NI 15% and apprenticeship levy 0.5% taken from the assignment rate
    const comparable = (gross - umbrella) / (1 + benefits / 100);
    return { gross, umbrella, comparable };
  }
  const salaryToRate = ({ salary, days = 220, benefits = 20 }) => salary * (1 + benefits / 100) / days;

  // =====================================================================
  // VIEW: Jobs
  // =====================================================================
  const TYPE_LABEL = { '': 'Any type', contract: 'Contract', fulltime: 'Full-time', parttime: 'Part-time', temporary: 'Temporary' };
  const relTime = iso => { if (!iso) return 'never'; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };

  const srcOf = j => [...new Set(j.sources && j.sources.length ? j.sources : [j.source || 'Indeed'])];
  const kindOf = j => { const t = (j.type + ' ' + j.title + ' ' + (j.pay || '')).toLowerCase(); return /contract|fixed.?term|ftc|temporary|interim|per day|\/day|day rate|inside ir35|outside ir35/.test(t) ? 'contract' : /permanent|full.?time|per annum|a year/.test(t) ? 'perm' : ''; };
  const modeOf = j => { const t = (j.location + ' ' + j.type + ' ' + (j.remote ? 'remote' : '') + ' ' + (j.jd || '').slice(0, 600)).toLowerCase(); return /\bhybrid\b/.test(t) ? 'hybrid' : /\bremote\b|work from home|wfh/.test(t) ? 'remote' : /on.?site|office based/.test(t) ? 'onsite' : ''; };
  const payValue = j => { const p = parsePay(j.pay); if (!p) return 0; return p.kind === 'day' ? p.value * 220 : p.value; };
  const MODE_LABEL = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' };

  function jobCard(j, sc, dups, compact) {
    const age = sc.age;
    return html`<article class="job ${j.status === 'new' ? 'is-new' : ''}" data-key="${j.key}">
      <div class="job-score"><span class="score-pill ${scoreCls(sc.score)}" title="${sc.quick ? 'Quick match from the title. Open details for a full check.' : 'Skills in the advert that your CV shows'}">${sc.score}${sc.quick ? raw('<small>~</small>') : ''}</span></div>
      <div class="job-main">
        <div class="job-title-row">
          <span class="co-logo" style="--h:${[...String(j.company || '?')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)}" aria-hidden="true">${(String(j.company || '?').replace(/^the\s+/i, '').trim()[0] || '?').toUpperCase()}</span>
          ${j.url ? html`<a class="job-title" href="${j.url}" target="_blank" rel="noopener">${j.title}</a>` : html`<span class="job-title">${j.title}</span>`}
          ${j.status === 'new' ? html`<span class="chip accent">New</span>` : ''}
          ${j.status === 'imported' ? html`<span class="chip ok">In pipeline</span>` : ''}
        </div>
        <div class="job-srcs">${srcOf(j).map(x => html`<span class="src-badge">${x}</span>`)}${srcOf(j).length > 1 ? html`<span class="chip ok" title="The same job is advertised on several sites, a sign it is live and funded">Seen on ${srcOf(j).length} sites</span>` : ''}${modeOf(j) ? html`<span class="chip muted">${MODE_LABEL[modeOf(j)]}</span>` : ''}</div>
        <div class="job-meta">${j.company || 'Company not shown'}${j.location ? ' · ' + j.location : ''}${j.remote ? ' · remote option' : ''}${j.type ? ' · ' + j.type : ''}${j.pay ? ' · ' + j.pay : ''}${age != null ? html` · <span class="${age > 30 ? 'warn-text' : ''}">${age === 0 ? 'today' : age + 'd ago'}</span>` : ''}</div>
        ${compact ? '' : html`<div class="job-chips">
          ${sc.best ? html`<span class="chip accent" title="The CV that shows most of this advert's skills; it is picked automatically when you start the application">Best CV: ${sc.best.name}</span>` : ''}
          ${sc.flags.map(f => html`<span class="chip ${f.cls}">${f.text}</span>`)}
          ${dups.length ? html`<span class="chip bad" title="${dups.map(d => d.app.role + ' at ' + d.app.company + ': ' + d.why).join('; ')}">Possible duplicate in pipeline</span>` : ''}
          ${!sc.quick && sc.miss.length ? html`<span class="chip muted" title="${sc.miss.join(', ')}">Gaps: ${sc.miss.slice(0, 4).join(', ')}${sc.miss.length > 4 ? '…' : ''}</span>` : ''}
        </div>`}
        <div class="job-extra" hidden></div>
      </div>
      <div class="job-actions">
        ${j.status === 'imported' && j.appId ? html`<a class="btn small ghost" href="#/app/${j.appId}/job">Open</a>` : html`<button class="btn small primary" data-j="import" type="button">Tailor</button>`}
        ${compact ? '' : html`<button class="btn small ghost" data-j="details" type="button">${j.jd ? 'Details' : 'Check match'}</button>
        <button class="icon-btn" data-j="hide" type="button" title="Not interested" aria-label="Not interested">✕</button>`}
      </div>
    </article>`;
  }

  async function view(root) {
    const col = await syncCollected();
    const [feed, apps, profile, avail, ev] = await Promise.all([loadFeed(), S.listApps(), S.getProfile(), available(), evidence()]);
    const cfg = await searchesOf(feed);
    const ui = Object.assign({ min: 0, days: 30, type: '', q: '', sort: 'score', showHidden: false, allRoles: false, src: '', kind: '', mode: '' }, S.local.get('cvt.jobsUi', {}));
    if (window.CVT._jobQuery) { ui.q = window.CVT._jobQuery; window.CVT._jobQuery = null; }

    root.innerHTML = String(html`
      <header class="page-head">
        <div><p class="eyebrow">${[feed.lastRun ? 'Searched ' + relTime(feed.lastRun) : '', col && col.ok ? 'Job robot · ' + relTime(col.robots[0].updated) : ''].filter(Boolean).join('  ·  ') || 'Job search'}</p><h1>Jobs for you</h1></div>
        <div class="row gap wrap">
          <button class="btn primary" id="jb-refresh" type="button">Find jobs now</button>
          <a class="btn ghost" href="#/autopilot">Autopilot</a>
          <a class="btn ghost" href="#/new">Paste an advert</a>
        </div>
      </header>
      ${cfg.queries.length ? '' : html`<section class="panel callout warn-callout"><h2>Tell us what you're looking for</h2><p class="hint">Add your target job titles and your field in <a class="link" href="#/profile">Career profile</a>, or type searches in the Searches box. Applywise then finds matching jobs in your country.</p></section>`}
      <section class="panel callout jobs-intro" ${cfg.queries.length ? '' : raw('hidden')}>
        <div class="ji-art" aria-hidden="true">${raw(window.CVT.art ? window.CVT.art.scene('team') : '')}</div>
        <h2>Matched to your target titles and CV</h2>
        ${feed.searches && feed.searches.updatedFromCv && daysBetween(feed.searches.updatedFromCv) <= 3 ? html`<p class="chip ok">Searches updated from your latest CV ${relTime(feed.searches.updatedFromCv)}</p>` : ''}
        <p class="hint">Find jobs now searches ${avail ? 'Indeed, ' : ''}The Muse, company career portals and remote job boards for: <strong>${cfg.queries.join(' · ')}</strong>, in <strong>${CO().get(cfg.country).flag} ${CO().get(cfg.country).name}</strong> (plus remote roles open to it) <button class="linkish" type="button" id="jb-country">change country</button>. Only roles that match these titles or several skills on your CV are kept, then scored against your CV.${feed.webRun ? ` Last run found ${Object.entries(feed.webRun.bySource || {}).filter(([, n]) => n).map(([k, n]) => `${n} on ${k}`).join(', ') || 'no new matches'}.` : ''} Big boards such as LinkedIn and ${CO().get(cfg.country).boards('x', '').filter(b => b.name !== 'LinkedIn' && b.name !== 'Google Jobs').slice(0, 2).map(b => b.name).join(' and ')} don't allow other sites to read them: use the one-click searches below for those.</p>
      <button class="linkish more" type="button" id="jb-more">Show details</button>
      </section>
      <p class="error" id="jb-err" role="alert" ${feed.errors && feed.errors.length ? '' : raw('hidden')}>${feed.errors && feed.errors[0] ? feed.errors[0].text : ''}</p>
      <ol class="progress" id="jb-prog" hidden></ol>

      <div class="jobs-grid">
        <section class="panel jobs-feed">
          <div class="filters">
            <input id="f-q" type="search" placeholder="Filter by title, company, skill" value="${ui.q}" aria-label="Filter jobs">
            <button class="btn ghost small f-toggle" type="button" id="f-toggle" aria-expanded="false">Filters${Number(ui.min) || ui.days != 30 || ui.kind || ui.mode || ui.allRoles || ui.sort !== 'score' ? ' •' : ''}</button>
            <label class="inline-field">Min match <select id="f-min">${[0, 40, 50, 60, 70].map(n => html`<option value="${n}" ${ui.min == n ? raw('selected') : ''}>${n ? n + '+' : 'Any'}</option>`)}</select></label>
            <label class="inline-field">Posted <select id="f-days">${[[3, '3 days'], [7, '7 days'], [14, '14 days'], [30, '30 days'], [9999, 'Any time']].map(([v, l]) => html`<option value="${v}" ${ui.days == v ? raw('selected') : ''}>${l}</option>`)}</select></label>
            <label class="check-line"><input id="f-all" type="checkbox" ${ui.allRoles ? raw('checked') : ''}> Show roles outside my field</label>
            <label class="inline-field">Sort <select id="f-sort"><option value="score" ${ui.sort === 'score' ? raw('selected') : ''}>Best match</option><option value="date" ${ui.sort === 'date' ? raw('selected') : ''}>Newest</option><option value="pay" ${ui.sort === 'pay' ? raw('selected') : ''}>Highest pay</option><option value="near" ${ui.sort === 'near' ? raw('selected') : ''}>Near me first</option></select></label>
            <label class="inline-field">Type <select id="f-kind">${[['', 'Any'], ['contract', 'Contract'], ['perm', 'Permanent']].map(([v, l]) => html`<option value="${v}" ${ui.kind === v ? raw('selected') : ''}>${l}</option>`)}</select></label>
            <label class="inline-field">Work <select id="f-mode">${[['', 'Any'], ['remote', 'Remote'], ['hybrid', 'Hybrid'], ['onsite', 'On-site']].map(([v, l]) => html`<option value="${v}" ${ui.mode === v ? raw('selected') : ''}>${l}</option>`)}</select></label>
          </div>
          <div class="src-bar" id="f-src" role="group" aria-label="Filter by job site"></div>
          <div class="feed-sum" id="jb-sum"></div>
          <div id="jb-list" class="job-list"></div>
          <div class="row gap wrap mt"><p class="muted small grow" id="jb-foot"></p><button class="btn small ghost" id="jb-csv" type="button">Export shortlist (CSV)</button></div>
        </section>

        <aside class="jobs-side">
          <section class="panel">
            <div class="panel-head"><h2>Searches</h2><span class="row gap"><span class="chip warn" id="s-dirty" hidden>Not saved</span><button class="btn primary small" data-s-save type="button">Save</button></span></div>
            <p class="hint">One job title or skill per line (up to 6). Add or change a role, then press <strong>Save</strong> (or Ctrl+Enter). The feed runs each search for your location${cfg.remote ? ' and for remote roles' : ''}.</p>
            <label class="field"><span class="sr">Searches</span><textarea id="s-q" rows="5">${cfg.queries.join('\n')}</textarea></label>
            <label class="field"><span>Country</span><select id="s-country">${Object.entries(CO().list).map(([k, c]) => html`<option value="${k}" ${cfg.country === k ? raw('selected') : ''}>${c.flag} ${c.name}</option>`)}</select></label>
            <p class="muted small">Detected from your browser: ${CO().get(CO().detect()).name}. Pick another to search there.</p>
            <div class="grid-2">
              <label class="field"><span>Location</span><input id="s-loc" type="text" value="${cfg.location}"></label>
              <label class="field"><span>Job type</span><select id="s-type">${Object.entries(TYPE_LABEL).map(([v, l]) => html`<option value="${v}" ${cfg.type === v ? raw('selected') : ''}>${l}</option>`)}</select></label>
            </div>
            <label class="check-line"><input id="s-remote" type="checkbox" ${cfg.remote ? raw('checked') : ''}> Also search remote roles</label>
            <label class="field mt"><span>Company career portals (one careers-page link per line)</span><textarea id="s-portals" rows="4" placeholder="https://boards.greenhouse.io/company">${(cfg.portals && cfg.portals.length ? cfg.portals : window.CVT.websources.portalsFor(cfg.country)).join('\n')}</textarea></label>
            <p class="muted small">Works with careers pages hosted on Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee, Personio, Teamtailor, Breezy and Rippling.</p>
            <div class="row gap wrap mt"><button class="btn small" id="s-save" data-s-save type="button">Save searches</button><button class="btn small ghost" id="s-auto" type="button">Rebuild from my titles and CV</button></div>
          </section>

          <section class="panel emp-panel" id="emp-panel" aria-live="polite"></section>

          ${!(col && col.ok) && !(window.claude && window.claude.use) ? '' : html`<section class="panel">
            <div class="panel-head"><h2>Job robot</h2>${col && col.ok ? html`<span class="chip ok">Ready</span>` : html`<span class="chip muted">Not run yet</span>`}</div>
            ${col && col.ok ? col.robots.map(r => html`<p class="hint"><strong>${r.name}</strong>: ${r.count} jobs from ${r.sources.join(', ') || 'job sites'}, last run ${relTime(r.updated)}.</p>
              ${r.errors && r.errors.length ? html`<p class="muted small">Note: ${r.errors[0]}</p>` : ''}`)
            : ''}
            <p class="hint">Runs only when you ask. Tell your AI assistant <strong>“run my job robot”</strong>: it searches Indeed, SimplyHired, Reed, ContractorUK and consultancy career pages (Deloitte, PwC, KPMG, EY, Accenture, Capgemini) for SAP, S2P/P2P and IT business-analyst roles, removes duplicates across sites and adds new matches here. LinkedIn, Totaljobs and CWJobs block automated reading; set up their free job-alert emails instead. For Indeed only, press <strong>Refresh jobs</strong> above.</p>
            <details class="small"><summary>Optional: add more free job feeds (Reed, Adzuna, Jooble, Google Jobs)</summary>
              <ol class="tight small mt">
                <li>Free keys: <a class="link" href="https://www.reed.co.uk/developers/jobseeker" target="_blank" rel="noopener">Reed</a>, <a class="link" href="https://developer.adzuna.com/signup" target="_blank" rel="noopener">Adzuna</a> (app ID and key), <a class="link" href="https://jooble.org/api/about" target="_blank" rel="noopener">Jooble</a>, and your <a class="link" href="https://console.apify.com/settings/integrations" target="_blank" rel="noopener">Apify API token</a> for Google Jobs (which also brings LinkedIn adverts, without scraping LinkedIn).</li>
                <li>In <a class="link" href="${REPO_URL}/settings/secrets/actions" target="_blank" rel="noopener">GitHub → Settings → Secrets → Actions</a>, add any of <code>REED_API_KEY</code>, <code>ADZUNA_APP_ID</code>, <code>ADZUNA_APP_KEY</code>, <code>JOOBLE_API_KEY</code>, <code>APIFY_TOKEN</code>, then <a class="link" href="${REPO_URL}/actions/workflows/fetch-jobs.yml" target="_blank" rel="noopener">run the workflow</a> once.</li>
                <li>Each feed has a built-in limit that keeps it free: Jooble 1 request a day; Google Jobs about 20 jobs a day (about $2 a month), and it pauses if your Apify usage reaches $3.50 of the free $5 monthly credit.</li>
              </ol>
            </details>
          </section>`}

          <section class="panel" id="mk"></section>

          <section class="panel">
            <div class="panel-head"><h2>Day rate or salary?</h2></div>
            <p class="hint">Compare a contract rate with a permanent package. A rough guide, not tax advice.</p>
            <div class="grid-2">
              <label class="field"><span>Day rate (£)</span><input id="rc-rate" type="number" min="0" step="25" value="${S.local.get('cvt.rc', {}).rate || 550}"></label>
              <label class="field"><span>Billable days/yr</span><input id="rc-days" type="number" min="100" max="260" value="${S.local.get('cvt.rc', {}).days || 220}"></label>
              <label class="field"><span>Perm benefits (%)</span><input id="rc-ben" type="number" min="0" max="60" value="${S.local.get('cvt.rc', {}).ben || 20}"></label>
              <label class="field"><span>IR35</span><select id="rc-ir"><option value="out">Outside</option><option value="in" ${S.local.get('cvt.rc', {}).inside ? raw('selected') : ''}>Inside (umbrella)</option></select></label>
            </div>
            <div class="calc-out" id="rc-out" aria-live="polite"></div>
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Search other boards in ${CO().get(cfg.country).name}</h2></div>
            <label class="field"><span class="sr">Search</span><select id="b-q">${cfg.queries.map(q => html`<option>${q}</option>`)}</select></label>
            <div class="board-links" id="b-links"></div>
          </section>
        </aside>
      </div>`);

    // ---- list ----
    let shown = [];
    const draw = async () => {
      const f = await loadFeed();
      const allApps = await S.listApps();
      const q = ui.q.toLowerCase();
      const base = Object.values(f.items)
        .filter(j => j.status !== 'hidden')
        .filter(j => inCountryNow(j, cfg))
        .filter(j => ui.allRoles || isItRole(j))
        .filter(j => !q || (j.title + ' ' + j.company + ' ' + j.location + ' ' + (j.jd || '')).toLowerCase().includes(q))
        .filter(j => !ui.kind || kindOf(j) === ui.kind)
        .filter(j => !ui.mode || modeOf(j) === ui.mode)
        .map(j => ({ j, sc: score(j, ev, cfg.queries), dups: j.status === 'imported' ? [] : duplicates(j, allApps) }))
.filter(r => r.sc.score >= ui.min && (r.sc.age == null || r.sc.age <= ui.days));
      // source counts use every other filter, so the numbers always add up
      const counts = {}; base.forEach(r => srcOf(r.j).forEach(x => { counts[x] = (counts[x] || 0) + 1; }));
      if (ui.src && !counts[ui.src]) ui.src = '';
      const rows = base.filter(r => !ui.src || srcOf(r.j).includes(ui.src))
        .sort((a, b) => ui.sort === 'pay' ? payValue(b.j) - payValue(a.j) || b.sc.score - a.sc.score : ui.sort === 'near' ? (b.sc.near ? 1 : 0) - (a.sc.near ? 1 : 0) || b.sc.score - a.sc.score : ui.sort === 'date' ? (b.j.posted || '').localeCompare(a.j.posted || '') : b.sc.score - a.sc.score || (b.j.posted || '').localeCompare(a.j.posted || ''));
      $('#f-src', root).innerHTML = Object.keys(counts).length > 1 ? [html`<button type="button" class="src-pill ${!ui.src ? 'on' : ''}" data-src="">All sites <b>${base.length}</b></button>`, ...Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => html`<button type="button" class="src-pill ${ui.src === k ? 'on' : ''}" data-src="${k}">${k} <b>${n}</b></button>`)].map(String).join('') : '';
      const nearN = rows.filter(r => r.sc.near).length;
      const strong = rows.filter(r => r.sc.score >= 70).length, fresh = rows.filter(r => r.j.status === 'new').length, multi = rows.filter(r => srcOf(r.j).length > 1).length;
      $('#jb-sum', root).innerHTML = rows.length ? String(html`<span><b>${rows.length}</b> jobs</span><span><b>${strong}</b> strong matches</span><span><b>${fresh}</b> new</span>${nearN ? html`<span><b>${nearN}</b> near you</span>` : ''}<span><b>${Object.keys(counts).length}</b> sites</span>${multi ? html`<span><b>${multi}</b> on several sites</span>` : ''}`) : '';
      shown = rows;
      const list = $('#jb-list', root);
      if (!Object.keys(f.items).length) {
        list.innerHTML = String(html`<div class="empty-state"><div class="empty-art">${raw(window.CVT.art ? window.CVT.art.scene('search') : '')}</div><h2>No jobs yet</h2><p class="hint">Press Find jobs now to search career portals and job boards for your target titles and skills.</p></div>`);
      } else if (!rows.length) {
        list.innerHTML = String(html`<p class="empty-note">No jobs match these filters. Lower the minimum match or widen the date range.</p>`);
      } else list.innerHTML = rows.map(r => String(jobCard(r.j, r.sc, r.dups))).join('');
      const hidden = Object.values(f.items).filter(j => j.status === 'hidden').length;
      const nonIt = ui.allRoles ? 0 : Object.values(f.items).filter(j => j.status !== 'hidden' && !isItRole(j)).length;
      $('#jb-foot', root).textContent = `${rows.length} shown · ${Object.keys(f.items).length} in feed${hidden ? ` · ${hidden} hidden` : ''}${nonIt ? ` · ${nonIt} roles outside your field filtered out` : ''}. The match score compares the skills in each advert with your CV and career profile; “~” means only the title was checked.`;
    };
    await draw();
    const saveUi = () => S.local.set('cvt.jobsUi', ui);
    $('#f-q', root).addEventListener('input', e => { ui.q = e.target.value; saveUi(); draw(); });
    $('#f-min', root).addEventListener('change', e => { ui.min = Number(e.target.value); saveUi(); draw(); });
    $('#f-days', root).addEventListener('change', e => { ui.days = Number(e.target.value); saveUi(); draw(); });
    $('#f-sort', root).addEventListener('change', e => { ui.sort = e.target.value; saveUi(); draw(); });
    $('#f-all', root).addEventListener('change', e => { ui.allRoles = e.target.checked; saveUi(); draw(); });
    $('#f-kind', root).addEventListener('change', e => { ui.kind = e.target.value; saveUi(); draw(); });
    $('#f-mode', root).addEventListener('change', e => { ui.mode = e.target.value; saveUi(); draw(); });
    $('#f-src', root).addEventListener('click', e => { const b = e.target.closest('[data-src]'); if (!b) return; ui.src = b.dataset.src; saveUi(); draw(); });
    $('#jb-csv', root).addEventListener('click', () => {
      const cell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const head = ['Match', 'Title', 'Company', 'Location', 'Type', 'Work', 'Pay', 'Posted', 'Sites', 'Status', 'Link'];
      const lines = [head.map(cell).join(',')].concat(shown.map(({ j, sc }) => [sc.score, j.title, j.company, j.location, j.type || (kindOf(j) === 'perm' ? 'Permanent' : kindOf(j) === 'contract' ? 'Contract' : ''), MODE_LABEL[modeOf(j)] || '', j.pay, j.posted, srcOf(j).join(' + '), j.status, j.url].map(cell).join(',')));
      window.CVT.ui.download(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv' }), `Job_shortlist_${new Date().toISOString().slice(0, 10)}.csv`);
    });

    // ---- actions on a job ----
    $('#jb-list', root).addEventListener('click', async e => {
      const b = e.target.closest('[data-j]'); if (!b) return;
      const card = b.closest('[data-key]'); const key = card.dataset.key;
      const act = b.dataset.j;
      if (act === 'hide') { await setStatus(key, 'hidden'); card.remove(); toast('Hidden. It won’t come back.'); return; }
      if (act === 'import') {
        b.disabled = true; b.textContent = 'Adding…';
        try { await details(key).catch(() => null); const id = await importJob(key); toast('Added to your pipeline'); window.CVT.app.go(`#/app/${id}/job`); }
        catch (err) { toast(err.message, 'bad'); b.disabled = false; b.textContent = 'Tailor'; }
        return;
      }
      if (act === 'details') {
        const box = $('.job-extra', card);
        if (!box.hidden && box.dataset.loaded) { box.hidden = true; return; }
        box.hidden = false; box.innerHTML = '<p class="muted small">Loading the advert and company data…</p>';
        let j;
        try {
          j = await details(key);
        } catch (err) {
          box.innerHTML = String(html`<p class="error small">${err.code ? errText(err) : err.message}</p>`); return;
        }
        await draw();
        const card2 = $(`[data-key="${CSS.escape(key)}"]`, root); if (!card2) return;
        const box2 = $('.job-extra', card2); box2.hidden = false;
        const sc = score(j, ev, cfg.queries);
        box2.dataset.loaded = '1';
        box2.innerHTML = String(html`
          <div class="job-detail">
            <div class="kw-cols">
              <div><h3>You show</h3><p class="small">${sc.have.length ? sc.have.join(', ') : '—'}</p></div>
              <div><h3>Not on your CV</h3><p class="small">${sc.miss.length ? sc.miss.join(', ') : 'Nothing major'}</p></div>
            </div>
            ${j.snippetOnly ? html`<p class="muted small">Scored from the advert summary. ${j.url ? html`<a class="link" href="${j.url}" target="_blank" rel="noopener">Open the full advert</a>` : ''} and paste it into the application for the best tailoring.</p>` : ''}
            <details><summary>${j.snippetOnly ? 'Read the summary' : 'Read the advert'}</summary><div class="jd-text pre small">${j.jd}</div></details>
            <div class="intel-box" data-intel><button class="btn small ghost" data-j="intel" type="button">Company intel</button></div>
          </div>`);
        return;
      }
      if (act === 'intel') {
        const feedNow = await loadFeed(); const j = feedNow.items[key];
        const box = b.closest('[data-intel]'); box.innerHTML = '<p class="muted small">Asking Indeed…</p>';
        try { box.innerHTML = String(intelCard(await companyIntel(j.company, j.title))); }
        catch (err) { box.innerHTML = String(html`<p class="error small">${errText(err)}</p>`); }
      }
    });

    // ---- refresh ----
    const rb = $('#jb-refresh', root);
    if (rb) rb.addEventListener('click', async () => {
      rb.disabled = true; rb.textContent = 'Searching…';
      const err = $('#jb-err', root); err.hidden = true;
      const prog = $('#jb-prog', root); prog.hidden = false;
      try {
        const r = await refresh((i, n, q, l) => { prog.innerHTML = String(i < 0 ? html`<li class="active">${q}</li>` : html`<li class="active">Searching Indeed for “${q}” in ${l} (${i + 1} of ${n})</li>`); });
        prog.hidden = true;
        if (r.errors.length) { err.textContent = r.errors[0].text; err.hidden = false; }
        toast(r.added ? `${r.added} new job${r.added > 1 ? 's' : ''} found` : r.found ? 'No new jobs since last time' : 'No jobs returned', r.added ? 'ok' : 'warn');
        await checkTop(4);
        window.CVT.app.rerender();
      } catch (e2) { prog.hidden = true; err.textContent = errText(e2); err.hidden = false; rb.disabled = false; rb.textContent = 'Find jobs now'; }
    });

    if (window.CVT._autoFind && rb) { window.CVT._autoFind = false; setTimeout(() => rb.click(), 50); }
    $('#f-toggle', root).addEventListener('click', e => { const f = e.currentTarget.closest('.filters'); f.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', f.classList.contains('open')); });
    $('#jb-more', root).addEventListener('click', e => { const box = e.target.closest('.jobs-intro'); box.classList.toggle('open'); e.target.textContent = box.classList.contains('open') ? 'Show less' : 'Show details'; });
    // Straight after first-run setup: start the first search automatically.
    if (window.CVT._autoFind) { window.CVT._autoFind = false; setTimeout(() => { const b = $('#jb-refresh', root); if (b && document.body.contains(b)) b.click(); }, 300); }
    // ---- searches ----
    const portalsOf = code => window.CVT.websources.portalsFor(code).join('\n');
    const readPortals = () => $('#s-portals', root).value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 30);
    let shownCountry = cfg.country;
    $('#s-country', root).addEventListener('change', () => {
      const code = $('#s-country', root).value, was = CO().get(shownCountry);
      const locEl = $('#s-loc', root), pEl = $('#s-portals', root);
      if (!locEl.value.trim() || locEl.value.trim() === was.name || !CO().inCountry(code, locEl.value)) locEl.value = CO().get(code).name;
      if (pEl.value.trim() === portalsOf(shownCountry).trim()) pEl.value = portalsOf(code);
      shownCountry = code;
    });
    $('#jb-country', root).addEventListener('click', () => { const sel = $('#s-country', root); sel.scrollIntoView({ block: 'center', behavior: 'smooth' }); sel.focus(); });
    // Unsaved changes: show "Not saved" next to the Save button; Ctrl+Enter saves.
    const dirty = on => { const d = $('#s-dirty', root); if (d) d.hidden = !on; };
    ['#s-q', '#s-loc', '#s-portals'].forEach(sel => { const el = $(sel, root); if (!el) return; el.addEventListener('input', () => dirty(true)); el.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveSearches(); } }); });
    ['#s-type', '#s-remote', '#s-country'].forEach(sel => { const el = $(sel, root); if (el) el.addEventListener('change', () => dirty(true)); });
    $$('[data-s-save]', root).forEach(b => b.addEventListener('click', () => saveSearches()));
    async function saveSearches() {
      const f = await loadFeed();
      const country = $('#s-country', root).value, ps = readPortals();
      const prevExcl = (f.searches && f.searches.excluded) || [];
      f.searches = {
        country,
        queries: $('#s-q', root).value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 6),
        location: $('#s-loc', root).value.trim() || CO().get(country).name, remote: $('#s-remote', root).checked, type: $('#s-type', root).value,
        // Left empty when it is just the country's default list, so it follows the country if you change it later.
        portals: ps.join('\n') === portalsOf(country).trim() ? [] : ps
      };
      const auto = f.searches.queries.join('|') === (await defaultSearches()).join('|');
      Object.assign(f.searches, { auto, cvSig: auto ? await cvSig() : '' });
      // Searches you deleted: forget their jobs (unless you saved or imported one) and keep the job robot from adding them back.
      const lc = x => String(x || '').toLowerCase().trim();
      const kept = new Set(f.searches.queries.map(lc));
      const removed = cfg.queries.map(lc).filter(q => q && !kept.has(q));
      f.searches.excluded = [...new Set(prevExcl.map(lc).filter(q => !kept.has(q)).concat(removed))].slice(0, 30);
      let dropped = 0;
      Object.keys(f.items || {}).forEach(k => { const j = f.items[k]; if (j && isExcluded(f, j) && (j.status === 'new' || j.status === 'seen')) { delete f.items[k]; dropped++; } });
      if (dropped) f.droppedNote = `${dropped} job${dropped > 1 ? 's' : ''} from removed searches cleared`;
      const moved = country !== cfg.country;
      CO().remember(country);
      const bad = f.searches.portals.filter(u => !window.CVT.websources.detect(u));
      if (bad.length) toast(`Skipped ${bad.length} link${bad.length > 1 ? 's' : ''} that isn't a careers page Applywise can read`, 'warn');
      if (!f.searches.queries.length) { toast('Add at least one search', 'warn'); return; }
      dirty(false);
      await saveFeed(f);
      // Run the new searches straight away, so the list matches what you just saved.
      window.CVT._autoFind = true;
      toast(moved ? `Now searching ${CO().get(country).name}…` : `Searches saved${dropped ? `; ${dropped} job${dropped > 1 ? 's' : ''} from removed searches cleared` : ''}. Finding jobs for them now…`);
      window.CVT.app.rerender();
    }
    $('#s-auto', root).addEventListener('click', async () => {
      const f = await loadFeed(); resetEvidence();
      const qs = await defaultSearches();
      const ql = qs.map(x => String(x).toLowerCase().trim());
      f.searches = Object.assign({}, f.searches || {}, { queries: qs, auto: true, cvSig: await cvSig(), excluded: ((f.searches || {}).excluded || []).filter(x => !ql.includes(x)) });
      await saveFeed(f); window.CVT._autoFind = true; toast('Searches rebuilt from your target titles and CV. Finding jobs now…'); window.CVT.app.rerender();
    });

    // ---- careers sites linked to your CV ----
    const E = window.CVT.employers;
    const KIND = { greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', smartrecruiters: 'SmartRecruiters', workable: 'Workable', recruitee: 'Recruitee', personio: 'Personio', teamtailor: 'Teamtailor', breezy: 'Breezy', rippling: 'Rippling' };
    const empBox = $('#emp-panel', root);
    let empBusy = '';
    async function drawEmployers(note = '') {
      const d = await E.load();
      empBox.innerHTML = String(html`
        <div class="panel-head"><h2>Careers sites from your CV</h2>${d.list.length ? html`<span class="muted small">${d.list.filter(x => x.on !== false).length} searched</span>` : ''}</div>
        <p class="hint">Applywise finds the careers sites of employers and clients named on your CV, companies you applied to and companies posting matching jobs, then searches them every time you press Find jobs now.</p>
        <div class="row gap wrap"><button class="btn small" type="button" id="emp-find" ${empBusy ? raw('disabled') : ''}>Find from my CV</button>
          <button class="btn small ghost" type="button" id="emp-ai" ${empBusy ? raw('disabled') : ''} title="Uses your AI engine">Suggest similar employers</button></div>
        ${empBusy ? html`<p class="small muted mt">${empBusy}</p>` : note ? html`<p class="small mt">${note}</p>` : ''}
        ${d.list.length ? html`<ul class="emp-list">${d.list.map(x => html`<li>
          <label class="check-line"><input type="checkbox" data-emp-on="${x.url}" ${x.on !== false ? raw('checked') : ''}> <span><strong>${x.name}</strong> <span class="muted small">· ${KIND[x.kind] || x.kind} · ${x.jobs} open roles worldwide</span><br><span class="muted small">${x.from || ''}</span></span></label>
          <span class="row gap"><a class="link small" href="${x.url}" target="_blank" rel="noopener">Open</a><button class="icon-btn" type="button" data-emp-del="${x.url}" aria-label="Remove ${x.name}">×</button></span></li>`)}</ul>` : ''}
        <div class="row gap mt emp-add"><input id="emp-name" type="text" placeholder="Add an employer by name, e.g. Deloitte" aria-label="Employer name"><button class="btn small ghost" type="button" id="emp-add">Add</button></div>`);
    }
    const runEmp = async (fn, doneText) => {
      if (empBusy) return;
      try {
        empBusy = 'Starting…'; await drawEmployers();
        const r = await fn(t => { empBusy = t; const p = empBox.querySelector('.small.muted.mt'); if (p) p.textContent = t; });
        empBusy = ''; await drawEmployers(doneText(r));
      } catch (e) { empBusy = ''; await drawEmployers(errText(e)); }
    };
    empBox.addEventListener('click', async e => {
      if (e.target.closest('#emp-find')) return runEmp(async onStep => {
        const names = await E.candidates({ useAI: true, onStep });
        if (!names.length) return { none: true };
        return E.discover({ names, onStep });
      }, r => r.none ? 'No employer names found yet. Add your CV in Career profile, or add employers by name below.' : `Checked ${r.checked} employer${r.checked === 1 ? '' : 's'}: ${r.found} careers site${r.found === 1 ? '' : 's'} found. Press Find jobs now to search them.`);
      if (e.target.closest('#emp-ai')) return runEmp(onStep => E.suggest({ onStep }), r => `Checked ${r.checked} suggested employer${r.checked === 1 ? '' : 's'}: ${r.found} careers site${r.found === 1 ? '' : 's'} found.`);
      const del = e.target.closest('[data-emp-del]');
      if (del) { await E.remove(del.dataset.empDel); return drawEmployers(); }
      if (e.target.closest('#emp-add')) {
        const inp = $('#emp-name', root), name = inp.value.trim(); if (!name) return inp.focus();
        return runEmp(async onStep => { onStep(`Looking for ${name}'s careers site…`); return { hit: await E.addByName(name), name }; },
          r => r.hit ? `${r.hit.name}: found on ${KIND[r.hit.kind]}. It will be searched from now on.` : `Couldn't find a careers site for ${r.name} that Applywise can read. Paste its careers-page link into the portals box above if it uses a supported system.`);
      }
    });
    empBox.addEventListener('change', async e => { const cb = e.target.closest('[data-emp-on]'); if (cb) { await E.toggle(cb.dataset.empOn, cb.checked); drawEmployers(); } });
    empBox.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'emp-name') { e.preventDefault(); $('#emp-add', root).click(); } });
    drawEmployers();

    // ---- market insights ----
    const mk = await market();
    const mkBox = $('#mk', root);
    mkBox.innerHTML = String(html`
      <div class="panel-head"><h2>Market pulse</h2><span class="muted small">${mk.ads} advert${mk.ads === 1 ? '' : 's'} read</span></div>
      ${mk.ads < 3 ? html`<p class="hint">Open “Check match” on a few jobs (or add applications with adverts). The skills employers ask for most will appear here, marked against your CV.</p>` : html`
        <p class="hint">Skills employers ask for most${mk.hasCv ? ', and whether your CV shows them' : ''}. If you have one that's missing, add it to your profile so the tailoring agent can place it.</p>
        <ul class="radar">${mk.skills.slice(0, 12).map(s => html`<li>
          <span class="radar-name">${s.name}</span>
          <span class="radar-bar" aria-hidden="true"><span style="width:${s.pct}%"></span></span>
          <span class="radar-pct">${s.pct}%</span>
          ${s.onCv ? html`<span class="chip ok" title="Your CV or profile shows this">On CV</span>` : html`<button class="chip-btn" data-add="${s.name}" type="button" title="Add to “Skills not on my CV” in your profile">I have this</button>`}
        </li>`)}</ul>`}
      ${mk.day.n || mk.year.n ? html`<div class="pay-bench">
        ${mk.day.n ? html`<div><span class="kpi-label">Day rates seen</span><span class="pay-num">${money(mk.day.med)}</span><span class="muted small">median of ${mk.day.n} · ${money(mk.day.lo)}–${money(mk.day.hi)}</span></div>` : ''}
        ${mk.year.n ? html`<div><span class="kpi-label">Salaries seen</span><span class="pay-num">${money(mk.year.med)}</span><span class="muted small">median of ${mk.year.n} · ${money(mk.year.lo)}–${money(mk.year.hi)}</span></div>` : ''}
      </div>` : ''}`);
    mkBox.addEventListener('click', async e => {
      const b = e.target.closest('[data-add]'); if (!b) return;
      const p = await S.getProfile();
      const have = (p.extraSkills || '').split(/[,\n]/).map(s => s.trim().toLowerCase());
      if (!have.includes(b.dataset.add.toLowerCase())) p.extraSkills = [p.extraSkills, b.dataset.add].filter(Boolean).join(', ');
      await S.saveProfile(p); resetEvidence();
      b.outerHTML = '<span class="chip ok">Added to profile</span>';
      toast(`${b.dataset.add} added to your profile. The agent can now place it in tailored CVs.`);
    });

    // ---- rate calculator ----
    const calc = () => {
      const rate = Number($('#rc-rate', root).value) || 0, days = Number($('#rc-days', root).value) || 220, ben = Number($('#rc-ben', root).value) || 0, inside = $('#rc-ir', root).value === 'in';
      S.local.set('cvt.rc', { rate, days, ben, inside });
      const r = rateCalc({ rate, days, benefits: ben, inside });
      $('#rc-out', root).innerHTML = String(html`
        <p><strong>${money(r.gross)}</strong> a year gross at ${money(rate)} × ${days} days.</p>
        ${inside ? html`<p class="small muted">Inside IR35 via an umbrella, about ${money(r.umbrella)} of employer NI and levy usually comes out of the rate first.</p>` : ''}
        <p>Roughly like a permanent salary of <strong>${money(r.comparable)}</strong> with ${ben}% benefits (pension, holiday, bonus).</p>
        ${profile.salary ? html`<p class="small muted">Your target salary ${profile.salary} ≈ ${money(salaryToRate({ salary: Number(String(profile.salary).replace(/[^\d.]/g, '')) * (/k/i.test(profile.salary) ? 1000 : 1), days, benefits: ben }))}/day.</p>` : ''}`);
    };
    ['#rc-rate', '#rc-days', '#rc-ben', '#rc-ir'].forEach(s => $(s, root).addEventListener('input', calc));
    calc();

    // ---- other boards ----
    const drawBoards = () => { $('#b-links', root).innerHTML = boards($('#b-q', root).value, cfg.location, cfg.country).map(l => String(html`<a class="pill-link" href="${l.href}" target="_blank" rel="noopener">${l.name}${l.note ? html` <small>${l.note}</small>` : ''}</a>`)).join(''); };
    $('#b-q', root).addEventListener('change', drawBoards); drawBoards();

    // Mark as seen once viewed.
    const f2 = await loadFeed(); let changed = false;
    Object.values(f2.items).forEach(j => { if (j.status === 'new' && daysBetween(j.firstSeen) >= 1) { j.status = 'seen'; changed = true; } });
    if (changed) await saveFeed(f2);
  }

  /** Fetch the full advert for the best quick matches so their scores become real. */
  async function checkTop(n) {
    const [feed, ev] = await Promise.all([loadFeed(), evidence()]);
    const cfg = await searchesOf(feed);
    const todo = Object.values(feed.items).filter(j => !j.jd && j.jobId && j.status !== 'hidden')
      .map(j => ({ j, s: score(j, ev, cfg.queries).score })).sort((a, b) => b.s - a.s).slice(0, n);
    for (const t of todo) { try { await details(t.j.key); } catch (_) { /* keep the quick score */ } }
  }

  /** Top matches for the dashboard. */
  async function top(n = 6) {
    await syncCollected();
    const [feed, ev, apps] = await Promise.all([loadFeed(), evidence(), S.listApps()]);
    const cfg = await searchesOf(feed);
    const items = Object.values(feed.items).filter(j => (j.status === 'new' || j.status === 'seen') && isItRole(j) && inCountryNow(j, cfg))
      .map(j => ({ j, sc: score(j, ev, cfg.queries), dups: duplicates(j, apps) }))
      .filter(r => r.sc.age == null || r.sc.age <= 30)
      .sort((a, b) => b.sc.score - a.sc.score);
    return { feed, items: items.slice(0, n), newCount: items.filter(r => r.j.status === 'new' && r.sc.score >= 60).length, total: items.length };
  }

  window.CVT.jobs = { bestCv, evidence, isItRole, syncCollected, view, refresh, top, jobCard, details, importJob, setStatus, available, duplicates, companyIntel, intelCard, boards, termsIn, parsePay, parseSearch, parseDetails, rateCalc, resetEvidence, relTime, checkTop, errText };
})();
