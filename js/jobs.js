/*
 * jobs.js — live job feed, market insights and company intel.
 *   Live pull : Indeed, through the viewer's Indeed connector in claude.ai (no key, no cost).
 *   Anywhere  : one-click searches on other UK boards, and paste-an-advert import.
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
  // Skills lexicon. "Display|alias|alias". Short all-caps aliases match case-sensitively.
  // ---------------------------------------------------------------------
  const LEXICON = [
    'SAP Ariba|Ariba', 'Ariba Buying|Ariba Buying and Invoicing|ABI', 'Guided Buying', 'Ariba Sourcing|Strategic Sourcing',
    'Ariba Contracts|Contract lifecycle management|CLM', 'SLP|Supplier Lifecycle and Performance|Supplier Lifecycle',
    'Supplier Risk', 'Ariba Network|SAP Business Network', 'Catalogues|Catalog|Catalogue|punchout|punch-out',
    'Spend Analysis|Spend visibility', 'CIG|Cloud Integration Gateway', 'SAP Integration Suite|CPI|Cloud Platform Integration',
    'SAP BTP|BTP|Business Technology Platform', 'S/4HANA|S4HANA|S/4 HANA|S4 HANA|S4',
    'S/4HANA Public Cloud|Public Cloud|GROW with SAP', 'RISE with SAP|RISE', 'Central Procurement',
    'SAP MM|Materials Management|MM', 'SAP SRM|SRM', 'SAP ECC|ECC', 'SAP FI/CO|FICO|FI/CO|SAP FI',
    'Source-to-Pay|S2P|Source to Pay', 'Procure-to-Pay|P2P|Procure to Pay|Purchase to Pay',
    'Invoice automation|Invoice Management|VIM|OpenText', 'GR/IR', 'UK VAT|VAT',
    'Vendor master|Supplier master|Business Partner|vendor onboarding|supplier onboarding', 'MDG|Master Data Governance',
    'SAP Fieldglass|Fieldglass', 'SAP Concur|Concur', 'Coupa', 'Jaggaer', 'Oracle Procurement|Oracle', 'Ivalua', 'Basware', 'Tungsten',
    'Signavio', 'Solution Manager|SolMan|Cloud ALM', 'SAP Activate|Activate methodology',
    'Fit-to-standard|fit to standard|fit-gap|fit gap', 'Global template', 'Data migration|Migration Cockpit|LTMC',
    'Cutover', 'SIT|System integration testing', 'UAT|User acceptance testing', 'Hypercare', 'Fiori', 'ABAP', 'IDoc|IDocs',
    'cXML', 'EDI', 'APIs|API', 'Approval workflow|Workflow', 'Agile|Scrum', 'PMP', 'PRINCE2', 'Stakeholder management|stakeholders',
    'Design authority', 'Solution architecture|Solution architect', 'Pre-sales|presales', 'Workshops', 'Business case',
    'Change management', 'Team leadership|team lead|lead a team|line management', 'Offshore delivery|offshore',
    'Procurement transformation', 'Category management', 'Sustainability|ESG', 'AI|Artificial intelligence|Joule|machine learning',
    'SAP Analytics Cloud|SAC', 'Power BI', 'Security clearance|SC clearance|SC cleared|DV clearance', 'Public sector',
    'Business analysis|Business analyst|requirements gathering|requirements analysis', 'Process mapping|BPMN|as-is|to-be', 'User stories|acceptance criteria|backlog',
    'Jira|Confluence', 'SQL', 'Product owner', 'Gap analysis', 'Functional specifications|functional specs|functional design'
  ];
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  const TERMS = LEXICON.map(entry => {
    const names = entry.split('|');
    const cs = names.filter(n => /^[A-Z0-9\/]{2,5}$/.test(n)), ci = names.filter(n => !/^[A-Z0-9\/]{2,5}$/.test(n));
    const b = x => `(?<![A-Za-z0-9])(?:${x})(?![A-Za-z0-9])`;
    return {
      name: names[0],
      ci: ci.length ? new RegExp(b(ci.map(escRe).join('|')), 'i') : null,
      cs: cs.length ? new RegExp(b(cs.map(escRe).join('|'))) : null
    };
  });
  const hasTerm = (t, text) => (t.ci && t.ci.test(text)) || (t.cs && t.cs.test(text));
  const termsIn = text => TERMS.filter(t => hasTerm(t, text || '')).map(t => t.name);

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
  // Only IT and business-analysis roles belong in N's feed.
  const IT_STRONG = /\b(sap|ariba|s\/?4\s?hana|s4|erp|coupa|jaggaer|ivalua|oracle|workday|dynamics|salesforce|servicenow|it|ict|digital|systems?|technology|technical|software|data|integration|platform|applications?|business analyst|business analysis|product owner|solution|p2p|s2p|procure[- ]to[- ]pay|source[- ]to[- ]pay|ai|cloud)\b/i;
  const IT_GENERIC = /\b(analyst|consultant|architect|transformation|programme|project|lead|manager|specialist|owner)\b/i;
  const NON_IT = /\b(buyer|driver|warehouse operative|operative|nurse|carer|care assistant|chef|cleaner|forensics?|account executive|sales executive|business development|recruitment consultant|teacher|mechanic|electrician|labourer|retail|cashier|commercial lead|security officer)\b/i;
  function isItRole(j) {
    const t = j.title || '';
    if (NON_IT.test(t)) return false;
    if (IT_STRONG.test(t)) return true;
    return IT_GENERIC.test(t) && IT_STRONG.test(j.jd || '');
  }
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
    server_not_connected: 'Indeed is not connected to your Claude account. Add it in claude.ai → Settings → Connectors, then reload.',
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
  function mergeCollected(feed, data) {
    let added = 0;
    for (const c of data.jobs || []) {
      if (!c || !c.title) continue;
      const k = keyOf(c);
      const old = feed.items[k];
      if (old) {
        old.sources = [...new Set([...(old.sources || [old.source]), ...(c.sources || [c.source])])];
        if (!old.pay && c.pay) old.pay = c.pay;
        if (!old.jd && c.snippet) { old.jd = c.snippet; old.snippetOnly = true; }
        if (!old.posted && c.posted) old.posted = c.posted;
        continue;
      }
      feed.items[k] = { key: k, title: c.title, company: c.company || '', location: c.location || '', type: c.type || '', pay: c.pay || '', url: c.url || '', posted: c.posted || '',
        source: c.source || 'Web', sources: c.sources || [c.source || 'Web'], jd: c.snippet || '', snippetOnly: true, query: c.query || '',
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
          robots.push({ id: 'claude', name: 'Claude job robot', updated: d.updated, sources: d.sources || [], errors: d.errors || [], count: (d.jobs || []).length });
        }
      }
    } catch (_) {}
    // 2. GitHub robot (optional)
    const onPages = /github\.io$/.test(location.hostname);
    for (const url of onPages ? ['data/jobs.json', COLLECTED_URL] : [COLLECTED_URL]) {
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

  const CORE_SEARCHES = ['SAP Ariba', 'SAP S2P P2P', 'S/4HANA Procurement', 'SAP Business Analyst', 'IT Business Analyst', 'ERP Business Analyst'];
  /** Every search list keeps at least one business-analyst search. */
  const withBA = qs => { const q = qs.slice(0, 6); if (!q.some(x => /analyst/i.test(x))) { if (q.length >= 6) q.pop(); q.push('IT Business Analyst'); } return q; };
  async function defaultSearches() {
    const p = await S.getProfile();
    const roles = (p.targetRoles || []).filter(Boolean).slice(0, 3);
    return withBA([...new Set(roles.concat(CORE_SEARCHES))].slice(0, 6));
  }
  async function searchesOf(feed) {
    if (feed.searches && feed.searches.queries && feed.searches.queries.length) return Object.assign({}, feed.searches, { queries: withBA(feed.searches.queries) });
    const p = await S.getProfile();
    return { queries: await defaultSearches(), location: (p.targetLocations || [])[0] || 'United Kingdom', remote: true, type: p.workPreference === 'Contract' ? 'contract' : '' };
  }

  let evidenceCache = null;
  /** Everything that proves a skill: the default CV, extra skills and achievements from the profile. */
  async function evidence() {
    const [p, masters] = await Promise.all([S.getProfile(), S.listMasters()]);
    const def = masters.find(m => m.isDefault) || masters[0];
    const sig = (def ? def.id : '') + '|' + p.extraSkills + '|' + (p.achievements || []).join('|') + '|' + p.currentTitle;
    if (evidenceCache && evidenceCache.sig === sig) return evidenceCache;
    let cv = '';
    try { const mm = def ? await masterModel(def.id) : null; if (mm) cv = D.plainText(mm.model); } catch (_) {}
    const text = [cv, p.extraSkills, (p.achievements || []).join('\n'), p.currentTitle].join('\n');
    evidenceCache = { sig, text, hasCv: !!cv, terms: new Set(termsIn(text)) };
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
    return { score: Math.max(0, Math.min(100, s)), quick: !(j.jd && asked.length >= 3), have, miss, flags, age };
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
      const locs = [cfg.location || 'United Kingdom'].concat(cfg.remote ? ['remote'] : []);
      const plan = [];
      cfg.queries.slice(0, 6).forEach(q => locs.forEach(l => plan.push({ q, l })));
      const errors = []; let added = 0, found = 0;
      for (let i = 0; i < plan.length; i++) {
        const { q, l } = plan[i];
        onStep && onStep(i, plan.length, q, l);
        try {
          const res = await call('search_jobs', { search: q, location: l, country_code: 'GB', job_type: cfg.type || null });
          const jobs = parseSearch(res.result || res.text || '');
          found += jobs.length;
          for (const j of jobs) {
            const k = keyOf(j);
            const old = feed.items[k];
            if (old) { Object.assign(old, { url: j.url || old.url, jobId: j.jobId, posted: j.posted || old.posted, pay: old.pay || j.pay, lastSeen: new Date().toISOString() }); if (l === 'remote') old.remote = true; }
            else { feed.items[k] = Object.assign(j, { key: k, query: q, remote: l === 'remote', firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), status: 'new' }); added++; }
          }
        } catch (e) {
          errors.push({ code: e.code || 'error', text: errText(e) });
          if (['server_not_connected', 'needs_reauth', 'not_in_manifest', 'no_mcp', 'blocked_by_policy', 'not_granted', 'capability_disabled', 'approval_required'].includes(e.code)) break;
        }
      }
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
  async function details(key) {
    const feed = await loadFeed();
    const j = feed.items[key]; if (!j) throw new Error('This job is no longer in the feed.');
    if (j.jd) return j;
    if (!j.jobId) throw new Error('Open the advert and paste it instead.');
    const res = await call('get_job_details', { job_id: j.jobId });
    const d = parseDetails(res.result || res.text || '');
    if (!d.jd || (d.title && jaccard(d.title, j.title) < 0.5)) { const e = new Error('Indeed returned a different advert. Refresh the feed and try again, or open the advert.'); e.code = 'mismatch'; throw e; }
    Object.assign(j, { jd: d.jd.slice(0, 20000), pay: j.pay || d.pay, type: j.type || d.type, detailsAt: new Date().toISOString() });
    if (d.url) j.url = d.url;
    await saveFeed(feed);
    return j;
  }

  async function setStatus(key, status) {
    const feed = await loadFeed();
    if (feed.items[key]) { feed.items[key].status = status; await saveFeed(feed); }
  }

  const typeMap = t => /contract|fixed/i.test(t || '') ? (/fixed/i.test(t) ? 'Fixed-term' : 'Contract') : /perm|full/i.test(t || '') ? 'Permanent' : '';
  async function importJob(key) {
    const feed = await loadFeed();
    const j = feed.items[key]; if (!j) throw new Error('This job is no longer in the feed.');
    if (j.appId && await S.getApp(j.appId)) return j.appId;
    const masters = await S.listMasters();
    const a = S.newApp((masters.find(m => m.isDefault) || masters[0] || {}).id);
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
      location: { country: 'GB', usState: null, usStateCode: null, usCity: null },
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
  // Other UK boards (deep links; they don't offer free open APIs)
  // ---------------------------------------------------------------------
  function boards(q, loc) {
    const s = x => String(x).toLowerCase().replace(/\//g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const uk = !loc || /united kingdom|^uk$/i.test(loc);
    return [
      { name: 'LinkedIn', note: 'last 24h', href: `https://www.linkedin.com/jobs/search/?keywords=${enc(q)}&location=${enc(uk ? 'United Kingdom' : loc)}&f_TPR=r86400` },
      { name: 'Indeed', note: 'last 3 days', href: `https://uk.indeed.com/jobs?q=${enc(q)}&l=${enc(uk ? '' : loc)}&fromage=3` },
      { name: 'Reed', href: `https://www.reed.co.uk/jobs/${s(q)}-jobs${uk ? '' : '-in-' + s(loc)}` },
      { name: 'Totaljobs', href: `https://www.totaljobs.com/jobs/${s(q)}${uk ? '' : '/in-' + s(loc)}` },
      { name: 'CWJobs', note: 'IT', href: `https://www.cwjobs.co.uk/jobs/${s(q)}${uk ? '' : '/in-' + s(loc)}` },
      { name: 'Jobserve', note: 'contracts', href: `https://www.jobserve.com/gb/en/JobSearch.aspx?shid=&q=${enc(q)}` },
      { name: 'CV-Library', href: `https://www.cv-library.co.uk/${s(q)}-jobs${uk ? '' : '-in-' + s(loc)}` },
      { name: 'Adzuna', href: `https://www.adzuna.co.uk/jobs/search?q=${enc(q)}${uk ? '' : '&w=' + enc(loc)}` },
      { name: 'Glassdoor', href: `https://www.glassdoor.co.uk/Job/jobs.htm?sc.keyword=${enc(q)}` },
      { name: 'Google Jobs', href: `https://www.google.com/search?q=${enc(q + ' jobs ' + (uk ? 'UK' : loc))}&ibp=htl;jobs` }
    ];
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
          ${j.url ? html`<a class="job-title" href="${j.url}" target="_blank" rel="noopener">${j.title}</a>` : html`<span class="job-title">${j.title}</span>`}
          ${j.status === 'new' ? html`<span class="chip accent">New</span>` : ''}
          ${j.status === 'imported' ? html`<span class="chip ok">In pipeline</span>` : ''}
        </div>
        <div class="job-srcs">${srcOf(j).map(x => html`<span class="src-badge">${x}</span>`)}${srcOf(j).length > 1 ? html`<span class="chip ok" title="The same job is advertised on several sites, a sign it is live and funded">Seen on ${srcOf(j).length} sites</span>` : ''}${modeOf(j) ? html`<span class="chip muted">${MODE_LABEL[modeOf(j)]}</span>` : ''}</div>
        <div class="job-meta">${j.company || 'Company not shown'}${j.location ? ' · ' + j.location : ''}${j.remote ? ' · remote option' : ''}${j.type ? ' · ' + j.type : ''}${j.pay ? ' · ' + j.pay : ''}${age != null ? html` · <span class="${age > 30 ? 'warn-text' : ''}">${age === 0 ? 'today' : age + 'd ago'}</span>` : ''}</div>
        ${compact ? '' : html`<div class="job-chips">
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
        <div><p class="eyebrow">${[avail ? 'Indeed live · ' + relTime(feed.lastRun) : '', col && col.ok ? 'Job robot · ' + relTime(col.robots[0].updated) : ''].filter(Boolean).join('  ·  ') || 'Job search'}</p><h1>Jobs for you</h1></div>
        <div class="row gap wrap">
          ${avail ? html`<button class="btn primary" id="jb-refresh" type="button">Refresh jobs</button>` : ''}
          <a class="btn ghost" href="#/autopilot">Autopilot</a>
          <a class="btn ghost" href="#/new">Paste an advert</a>
        </div>
      </header>
      ${!avail ? html`<section class="panel callout">
        <h2>Live job feed</h2>
        <p class="hint">Jobs are pulled from Indeed through your Claude account's Indeed connector, at no cost. Open Applywise inside claude.ai to switch it on. Here you can still search every UK board in one click (below) and paste any advert into a new application.</p>
      </section>` : ''}
      <p class="error" id="jb-err" role="alert" ${feed.errors && feed.errors.length ? '' : raw('hidden')}>${feed.errors && feed.errors[0] ? feed.errors[0].text : ''}</p>
      <ol class="progress" id="jb-prog" hidden></ol>

      <div class="jobs-grid">
        <section class="panel jobs-feed">
          <div class="filters">
            <input id="f-q" type="search" placeholder="Filter by title, company, skill" value="${ui.q}" aria-label="Filter jobs">
            <label class="inline-field">Min match <select id="f-min">${[0, 40, 50, 60, 70].map(n => html`<option value="${n}" ${ui.min == n ? raw('selected') : ''}>${n ? n + '+' : 'Any'}</option>`)}</select></label>
            <label class="inline-field">Posted <select id="f-days">${[[3, '3 days'], [7, '7 days'], [14, '14 days'], [30, '30 days'], [9999, 'Any time']].map(([v, l]) => html`<option value="${v}" ${ui.days == v ? raw('selected') : ''}>${l}</option>`)}</select></label>
            <label class="check-line"><input id="f-all" type="checkbox" ${ui.allRoles ? raw('checked') : ''}> Show non-IT roles</label>
            <label class="inline-field">Sort <select id="f-sort"><option value="score" ${ui.sort === 'score' ? raw('selected') : ''}>Best match</option><option value="date" ${ui.sort === 'date' ? raw('selected') : ''}>Newest</option><option value="pay" ${ui.sort === 'pay' ? raw('selected') : ''}>Highest pay</option></select></label>
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
            <div class="panel-head"><h2>Searches</h2></div>
            <p class="hint">One job title or skill per line. The feed runs each search for your location${cfg.remote ? ' and for remote roles' : ''}.</p>
            <label class="field"><span class="sr">Searches</span><textarea id="s-q" rows="5">${cfg.queries.join('\n')}</textarea></label>
            <div class="grid-2">
              <label class="field"><span>Location</span><input id="s-loc" type="text" value="${cfg.location}"></label>
              <label class="field"><span>Job type</span><select id="s-type">${Object.entries(TYPE_LABEL).map(([v, l]) => html`<option value="${v}" ${cfg.type === v ? raw('selected') : ''}>${l}</option>`)}</select></label>
            </div>
            <label class="check-line"><input id="s-remote" type="checkbox" ${cfg.remote ? raw('checked') : ''}> Also search remote roles</label>
            <button class="btn small mt" id="s-save" type="button">Save searches</button>
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Job robot</h2>${col && col.ok ? html`<span class="chip ok">Ready</span>` : html`<span class="chip muted">Not run yet</span>`}</div>
            ${col && col.ok ? col.robots.map(r => html`<p class="hint"><strong>${r.name}</strong>: ${r.count} jobs from ${r.sources.join(', ') || 'job sites'}, last run ${relTime(r.updated)}.</p>
              ${r.errors && r.errors.length ? html`<p class="muted small">Note: ${r.errors[0]}</p>` : ''}`)
            : ''}
            <p class="hint">Runs only when you ask. In any Claude chat, type <strong>“run my job robot”</strong>: Claude searches Indeed, SimplyHired, Reed, ContractorUK and consultancy career pages (Deloitte, PwC, KPMG, EY, Accenture, Capgemini) for SAP, S2P/P2P and IT business-analyst roles, removes duplicates across sites and adds new matches here. LinkedIn, Totaljobs and CWJobs block automated reading; set up their free job-alert emails instead. For Indeed only, press <strong>Refresh jobs</strong> above.</p>
            <details class="small"><summary>Optional: add Reed and Adzuna feeds</summary>
              <ol class="tight small mt">
                <li>Get a free key at <a class="link" href="https://www.reed.co.uk/developers/jobseeker" target="_blank" rel="noopener">reed.co.uk/developers</a> and a free app ID and key at <a class="link" href="https://developer.adzuna.com/signup" target="_blank" rel="noopener">developer.adzuna.com</a>.</li>
                <li>In <a class="link" href="${REPO_URL}/settings/secrets/actions" target="_blank" rel="noopener">GitHub → Settings → Secrets → Actions</a>, add <code>REED_API_KEY</code>, <code>ADZUNA_APP_ID</code> and <code>ADZUNA_APP_KEY</code>, then <a class="link" href="${REPO_URL}/actions/workflows/fetch-jobs.yml" target="_blank" rel="noopener">run the workflow</a> once.</li>
              </ol>
            </details>
          </section>

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
            <div class="panel-head"><h2>Search other UK boards</h2></div>
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
        .sort((a, b) => ui.sort === 'pay' ? payValue(b.j) - payValue(a.j) || b.sc.score - a.sc.score : ui.sort === 'date' ? (b.j.posted || '').localeCompare(a.j.posted || '') : b.sc.score - a.sc.score || (b.j.posted || '').localeCompare(a.j.posted || ''));
      $('#f-src', root).innerHTML = Object.keys(counts).length > 1 ? [html`<button type="button" class="src-pill ${!ui.src ? 'on' : ''}" data-src="">All sites <b>${base.length}</b></button>`, ...Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => html`<button type="button" class="src-pill ${ui.src === k ? 'on' : ''}" data-src="${k}">${k} <b>${n}</b></button>`)].map(String).join('') : '';
      const strong = rows.filter(r => r.sc.score >= 70).length, fresh = rows.filter(r => r.j.status === 'new').length, multi = rows.filter(r => srcOf(r.j).length > 1).length;
      $('#jb-sum', root).innerHTML = rows.length ? String(html`<span><b>${rows.length}</b> jobs</span><span><b>${strong}</b> strong matches</span><span><b>${fresh}</b> new</span><span><b>${Object.keys(counts).length}</b> sites</span>${multi ? html`<span><b>${multi}</b> on several sites</span>` : ''}`) : '';
      shown = rows;
      const list = $('#jb-list', root);
      if (!Object.keys(f.items).length) {
        list.innerHTML = String(html`<div class="empty-state"><h2>No jobs yet</h2><p class="hint">${avail ? 'Press Refresh jobs. The first time, claude.ai asks you to allow the Indeed connector for this page.' : 'Open Applywise inside claude.ai to pull live jobs, or use the board links.'}</p></div>`);
      } else if (!rows.length) {
        list.innerHTML = String(html`<p class="empty-note">No jobs match these filters. Lower the minimum match or widen the date range.</p>`);
      } else list.innerHTML = rows.map(r => String(jobCard(r.j, r.sc, r.dups))).join('');
      const hidden = Object.values(f.items).filter(j => j.status === 'hidden').length;
      const nonIt = ui.allRoles ? 0 : Object.values(f.items).filter(j => j.status !== 'hidden' && !isItRole(j)).length;
      $('#jb-foot', root).textContent = `${rows.length} shown · ${Object.keys(f.items).length} in feed${hidden ? ` · ${hidden} hidden` : ''}${nonIt ? ` · ${nonIt} non-IT roles filtered out` : ''}. The match score compares the skills in each advert with your CV and career profile; “~” means only the title was checked.`;
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
        const r = await refresh((i, n, q, l) => { prog.innerHTML = String(html`<li class="active">Searching “${q}” in ${l} (${i + 1} of ${n})</li>`); });
        prog.hidden = true;
        if (r.errors.length) { err.textContent = r.errors[0].text; err.hidden = false; }
        toast(r.added ? `${r.added} new job${r.added > 1 ? 's' : ''} found` : r.found ? 'No new jobs since last time' : 'No jobs returned', r.added ? 'ok' : 'warn');
        await checkTop(4);
        window.CVT.app.rerender();
      } catch (e2) { prog.hidden = true; err.textContent = errText(e2); err.hidden = false; rb.disabled = false; rb.textContent = 'Refresh jobs'; }
    });

    // ---- searches ----
    $('#s-save', root).addEventListener('click', async () => {
      const f = await loadFeed();
      f.searches = {
        queries: $('#s-q', root).value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 6),
        location: $('#s-loc', root).value.trim() || 'United Kingdom', remote: $('#s-remote', root).checked, type: $('#s-type', root).value
      };
      if (!f.searches.queries.length) { toast('Add at least one search', 'warn'); return; }
      await saveFeed(f); toast('Searches saved' + (avail ? '. Press Refresh jobs.' : '')); window.CVT.app.rerender();
    });

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
    const drawBoards = () => { $('#b-links', root).innerHTML = boards($('#b-q', root).value, cfg.location).map(l => String(html`<a class="pill-link" href="${l.href}" target="_blank" rel="noopener">${l.name}${l.note ? html` <small>${l.note}</small>` : ''}</a>`)).join(''); };
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
    const items = Object.values(feed.items).filter(j => (j.status === 'new' || j.status === 'seen') && isItRole(j))
      .map(j => ({ j, sc: score(j, ev, cfg.queries), dups: duplicates(j, apps) }))
      .filter(r => r.sc.age == null || r.sc.age <= 30)
      .sort((a, b) => b.sc.score - a.sc.score);
    return { feed, items: items.slice(0, n), newCount: items.filter(r => r.j.status === 'new' && r.sc.score >= 60).length, total: items.length };
  }

  window.CVT.jobs = { isItRole, syncCollected, view, refresh, top, jobCard, details, importJob, setStatus, available, duplicates, companyIntel, intelCard, boards, termsIn, parsePay, parseSearch, parseDetails, rateCalc, resetEvidence, relTime, checkTop, errText };
})();
