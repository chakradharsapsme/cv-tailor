/*
 * websources.js — live jobs straight from the browser, no keys and no server:
 *   • company career portals on Greenhouse, Lever, Ashby and SmartRecruiters (their public job APIs)
 *   • The Muse (every profession, by your field's categories)
 *   • remote-job boards Remotive and Jobicy (roles open to people in your country)
 * Everything is limited to the chosen country (plus remote roles open to it), then filtered against your
 * searches (target titles + skills from your CV) before it reaches the feed.
 */
(function () {
  const K = () => window.CVT.countries;
  /** Career portals for a country (UK list kept as the export for older callers). */
  const DEFAULT_PORTALS = window.CVT.countries ? window.CVT.countries.portals('GB') : [];
  const portalsFor = code => K().portals(code);
  // A loose first look at a title, used to decide which Greenhouse adverts to open in full.
  const MAYBE = /analyst|consultant|sap|ariba|procure|sourc|purchas|business|functional|erp|product owner|project|programme|program|implementation|solution|finance|supply|systems|process/i;

  const textOf = h => { if (!h) return ''; const d = new DOMParser().parseFromString(String(h).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'), 'text/html'); return (d.body.textContent || '').replace(/\s+/g, ' ').trim(); };
  const day = v => { if (!v) return ''; const t = typeof v === 'number' ? v : Date.parse(v); return isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10); };
  const nice = s => String(s || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  async function getJSON(url, ms = 15000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error(r.status + ' ' + r.statusText); return await r.json(); }
    finally { clearTimeout(t); }
  }

  /** "https://boards.greenhouse.io/monzo" → { kind: 'greenhouse', slug: 'monzo' } */
  function detect(url) {
    const u = String(url || '').trim(); let m;
    if ((m = u.match(/greenhouse\.io\/(?:embed\/job_board\?for=)?([A-Za-z0-9_-]+)/i))) return { kind: 'greenhouse', slug: m[1] };
    if ((m = u.match(/lever\.co\/([A-Za-z0-9_.-]+)/i))) return { kind: 'lever', slug: m[1] };
    if ((m = u.match(/ashbyhq\.com\/([A-Za-z0-9_.%-]+)/i))) return { kind: 'ashby', slug: decodeURIComponent(m[1]) };
    if ((m = u.match(/smartrecruiters\.com\/([A-Za-z0-9_-]+)/i))) return { kind: 'smartrecruiters', slug: m[1] };
    if ((m = u.match(/apply\.workable\.com\/(?:api\/v\d\/widget\/accounts\/)?([A-Za-z0-9_-]+)/i)) && m[1] !== 'j') return { kind: 'workable', slug: m[1] };
    if ((m = u.match(/\/\/([A-Za-z0-9-]+)\.recruitee\.com/i))) return { kind: 'recruitee', slug: m[1] };
    if ((m = u.match(/\/\/([A-Za-z0-9-]+)\.jobs\.personio\.(com|de)/i))) return { kind: 'personio', slug: m[1], tld: m[2].toLowerCase() };
    if ((m = u.match(/\/\/([A-Za-z0-9-]+)\.teamtailor\.com/i))) return { kind: 'teamtailor', slug: m[1] };
    if ((m = u.match(/\/\/([A-Za-z0-9-]+)\.breezy\.hr/i))) return { kind: 'breezy', slug: m[1] };
    if ((m = u.match(/rippling\.com\/(?:platform\/api\/ats\/v1\/board\/)?([A-Za-z0-9_-]+)/i)) && !/^(platform|api)$/i.test(m[1])) return { kind: 'rippling', slug: m[1] };
    return null;
  }
  /** The careers-page link people can open for a detected portal. */
  function urlOf(p) {
    return ({ greenhouse: `https://boards.greenhouse.io/${p.slug}`, lever: `https://jobs.lever.co/${p.slug}`, ashby: `https://jobs.ashbyhq.com/${p.slug}`,
      smartrecruiters: `https://jobs.smartrecruiters.com/${p.slug}`, workable: `https://apply.workable.com/${p.slug}`, recruitee: `https://${p.slug}.recruitee.com`,
      personio: `https://${p.slug}.jobs.personio.${p.tld || 'com'}`, teamtailor: `https://${p.slug}.teamtailor.com`, breezy: `https://${p.slug}.breezy.hr`, rippling: `https://ats.rippling.com/${p.slug}/jobs` })[p.kind] || '';
  }
  async function getText(url, ms = 15000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error(r.status + ' ' + r.statusText); return await r.text(); }
    finally { clearTimeout(t); }
  }
  const xmlDoc = t => new DOMParser().parseFromString(t, 'application/xml');
  const tag = (el, name) => { const x = el.getElementsByTagName(name)[0] || [...el.getElementsByTagName('*')].find(n => n.localName === name); return x ? x.textContent.trim() : ''; };

  async function portal(p, cc) {
    const co = nice(p.slug);
    if (p.kind === 'greenhouse') {
      // Listing without adverts (big employers have thousands); the adverts worth reading are fetched after filtering.
      const d = await getJSON(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(p.slug)}/jobs?content=false`);
      return (d.jobs || []).map(j => ({ title: j.title, company: co, location: (j.location || {}).name || '', url: j.absolute_url, posted: day(j.updated_at || j.first_published), jd: '', _gh: [p.slug, j.id] }));
    }
    if (p.kind === 'lever') {
      const d = await getJSON(`https://api.lever.co/v0/postings/${encodeURIComponent(p.slug)}?mode=json`);
      return (d || []).map(j => ({ title: j.text, company: co, location: (j.categories || {}).location || '', type: (j.categories || {}).commitment || '', url: j.hostedUrl, posted: day(j.createdAt),
        jd: [j.descriptionPlain, ...(j.lists || []).map(l => l.text + ': ' + textOf(l.content))].join('\n').slice(0, 4000) }));
    }
    if (p.kind === 'ashby') {
      const d = await getJSON(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(p.slug)}?includeCompensation=true`);
      return (d.jobs || []).map(j => ({ title: j.title, company: co, location: j.location || '', type: j.employmentType || '', url: j.jobUrl, posted: day(j.publishedAt), pay: (j.compensation || {}).compensationTierSummary || '', jd: (j.descriptionPlain || '').slice(0, 4000) }));
    }
    if (p.kind === 'smartrecruiters') {
      const d = await getJSON(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(p.slug)}/postings?limit=100&country=${K().get(cc).sr}`);
      return (d.content || []).map(j => ({ title: j.name, company: (j.company || {}).name || co, location: [(j.location || {}).city, (j.location || {}).remote ? 'Remote' : ''].filter(Boolean).join(', ') + ', ' + K().get(cc).name,
        type: (j.typeOfEmployment || {}).label || '', url: `https://jobs.smartrecruiters.com/${p.slug}/${j.id}`, posted: day(j.releasedDate), jd: [(j.function || {}).label, (j.department || {}).label, (j.experienceLevel || {}).label].filter(Boolean).join(' · ') }));
    }
    if (p.kind === 'workable') {
      const d = await getJSON(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(p.slug)}`);
      const name = d.name || co;
      return (d.jobs || []).map(j => ({ title: j.title, company: name, location: [j.city, j.state, j.country].filter(Boolean).join(', ') + (j.telecommuting ? ' (remote)' : ''), type: j.employment_type || '',
        url: j.url || j.shortlink, posted: day(j.published_on || j.created_at), jd: [j.function, j.department, j.industry, j.experience].filter(Boolean).join(' · ') }));
    }
    if (p.kind === 'recruitee') {
      const d = await getJSON(`https://${p.slug}.recruitee.com/api/offers/`);
      return (d.offers || []).map(j => ({ title: j.title, company: j.company_name || co, location: [j.location || j.city, j.country].filter(Boolean).join(', ') + (j.remote ? ' (remote)' : ''),
        type: (j.employment_type_code || '').replace(/_/g, ' '), url: j.careers_url, posted: day(j.published_at || j.created_at), jd: textOf((j.description || '') + ' ' + (j.requirements || '')).slice(0, 4000) }));
    }
    if (p.kind === 'personio') {
      const doc = xmlDoc(await getText(`https://${p.slug}.jobs.personio.${p.tld || 'com'}/xml?language=en`));
      return [...doc.getElementsByTagName('position')].map(el => {
        const id = tag(el, 'id');
        const jd = [...el.getElementsByTagName('jobDescription')].map(x => tag(x, 'name') + ': ' + textOf(tag(x, 'value'))).join('\n');
        return { title: tag(el, 'name'), company: tag(el, 'subcompany') || co, location: tag(el, 'office'), type: [tag(el, 'employmentType'), tag(el, 'schedule')].filter(Boolean).join(', '),
          url: `https://${p.slug}.jobs.personio.${p.tld || 'com'}/job/${id}`, posted: day(tag(el, 'createdAt')), jd: jd.slice(0, 4000) };
      });
    }
    if (p.kind === 'teamtailor') {
      const doc = xmlDoc(await getText(`https://${p.slug}.teamtailor.com/jobs.rss`));
      const title = tag(doc, 'title').replace(/\s*-\s*(career|jobs).*$/i, '');
      return [...doc.getElementsByTagName('item')].map(el => {
        const locs = [...el.getElementsByTagName('*')].filter(n => n.localName === 'location').map(n => [tag(n, 'city'), tag(n, 'country')].filter(Boolean).join(', ')).filter(Boolean);
        return { title: tag(el, 'title'), company: title || co, location: locs.join(' / ') || tag(el, 'locations'), url: tag(el, 'link'), posted: day(tag(el, 'pubDate')), jd: textOf(tag(el, 'description')).slice(0, 4000),
          remote: /remote/i.test(tag(el, 'remoteStatus')) };
      });
    }
    if (p.kind === 'breezy') {
      const d = await getJSON(`https://${p.slug}.breezy.hr/json`);
      return (Array.isArray(d) ? d : []).map(j => ({ title: j.name, company: (j.company || {}).name || co,
        location: ((j.locations && j.locations.length ? j.locations : [j.location || {}]).map(l => [l.name, (l.country || {}).name].filter(Boolean).join(', ')).join(' / ')) + ((j.location || {}).is_remote ? ' (remote)' : ''),
        type: (j.type || {}).name || '', pay: j.salary || '', url: j.url, posted: day(j.published_date), jd: j.department || '' }));
    }
    if (p.kind === 'rippling') {
      const d = await getJSON(`https://api.rippling.com/platform/api/ats/v1/board/${encodeURIComponent(p.slug)}/jobs`);
      return (Array.isArray(d) ? d : []).map(j => ({ title: j.name, company: co, location: (j.workLocation || {}).label || '', url: j.url, posted: '', jd: (j.department || {}).label || '' }));
    }
    return [];
  }

  /**
   * Does this employer publish jobs on one of the careers systems we can read? Tries likely account names
   * (e.g. "Version 1" → version1, version-1, Version1) on each system; returns the first that answers with jobs.
   */
  const KINDS = ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable', 'recruitee', 'personio', 'teamtailor', 'breezy'];
  function slugsFor(name) {
    const base = String(name || '').replace(/\((.*?)\)/g, ' ').replace(/\b([A-Za-z])\.(?=[A-Za-z]\.)/g, '$1').replace(/\./g, '').replace(/\b(ltd|limited|plc|llp|llc|inc|gmbh|ag|bv|pvt|private|pte|corp|corporation|group|holdings|company|co|the|uk|india|international)\b\.?/gi, ' ').replace(/&/g, 'and').trim();
    const words = base.split(/[^A-Za-z0-9]+/).filter(Boolean);
    if (!words.length) return [];
    const joined = words.join('').toLowerCase(), dashed = words.join('-').toLowerCase(), camel = words.map(w => w[0].toUpperCase() + w.slice(1)).join('');
    // The full name with "Group", "Ltd"... kept, as some employers register that way (e.g. BoschGroup).
    const full = String(name || '').replace(/\((.*?)\)/g, ' ').replace(/\./g, '').split(/[^A-Za-z0-9]+/).filter(Boolean);
    const fullCamel = full.map(w => w[0].toUpperCase() + w.slice(1)).join('');
    return [...new Set([joined, camel, words.length > 1 && words[0].length >= 5 ? words[0].toLowerCase() : '', fullCamel, dashed])].filter(x => x.length >= 2).slice(0, 5);
  }
  async function exists(kind, slug) {
    try {
      if (kind === 'smartrecruiters') { const d = await getJSON(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=1`, 8000); return d.totalFound > 0 ? d.totalFound : 0; }
      if (kind === 'greenhouse') { const d = await getJSON(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=false`, 8000); return (d.jobs || []).length; }
      if (kind === 'lever') { const d = await getJSON(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json&limit=200`, 8000); return (d || []).length; }
      if (kind === 'ashby') { const d = await getJSON(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`, 8000); return (d.jobs || []).length; }
      if (kind === 'workable') { const d = await getJSON(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}`, 8000); return (d.jobs || []).length; }
      if (kind === 'recruitee') { const d = await getJSON(`https://${slug.toLowerCase()}.recruitee.com/api/offers/`, 8000); return (d.offers || []).length; }
      if (kind === 'personio') { const t = await getText(`https://${slug.toLowerCase()}.jobs.personio.com/xml`, 8000); return (t.match(/<position>/g) || []).length; }
      if (kind === 'teamtailor') { const t = await getText(`https://${slug.toLowerCase()}.teamtailor.com/jobs.rss`, 8000); return (t.match(/<item>/g) || []).length; }
      if (kind === 'breezy') { const d = await getJSON(`https://${slug.toLowerCase()}.breezy.hr/json`, 8000); return Array.isArray(d) ? d.length : 0; }
    } catch (_) { return 0; }
    return 0;
  }
  async function probe(name) {
    for (const slug of slugsFor(name)) {
      // Mixed-case names only matter to SmartRecruiters; every other system uses lower case.
      const kinds = /[A-Z]/.test(slug) ? ['smartrecruiters'] : KINDS;
      const hits = await Promise.all(kinds.map(async kind => ({ kind, slug, jobs: await exists(kind, slug) })));
      const best = hits.filter(h => h.jobs > 0).sort((a, b) => b.jobs - a.jobs)[0];
      if (best) return Object.assign(best, { name, url: urlOf(best) });
    }
    return null;
  }

  async function ghDetail(j) {
    try { const d = await getJSON(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(j._gh[0])}/jobs/${j._gh[1]}`, 10000); j.jd = textOf(d.content).slice(0, 4000); } catch (_) {}
    delete j._gh; return j;
  }

  /** The Muse: a free public jobs API covering every profession (strongest in the US and UK). */
  async function muse(cats, cc) {
    const c = K().get(cc), out = [];
    const locs = (c.muse || []).map(l => '&location=' + encodeURIComponent(l)).join('');
    for (const cat of cats.length ? cats : ['']) {
      for (let page = 0; page < 3; page++) {
        const d = await getJSON(`https://www.themuse.com/api/public/jobs?page=${page}${cat ? '&category=' + encodeURIComponent(cat) : ''}${locs}`);
        (d.results || []).forEach(j => {
          const here = (j.locations || []).map(l => l.name).filter(n => K().inCountry(cc, n));
          if (!here.length) return;
          out.push({ title: j.name, company: (j.company || {}).name || '', location: here.join(' / '), type: (j.levels || []).map(l => l.name).join(', '),
            url: (j.refs || {}).landing_page || '', posted: day(j.publication_date), jd: textOf(j.contents).slice(0, 4000) });
        });
        if (page + 1 >= (d.page_count || 0)) break;
      }
    }
    return out;
  }

  /** Arbeitnow: a free German job board with an open API (jobs in Germany, plus remote). */
  async function arbeitnow() {
    const out = [];
    for (let page = 1; page <= 2; page++) {
      const d = await getJSON(`https://www.arbeitnow.com/api/job-board-api?page=${page}`, 20000);
      (d.data || []).forEach(j => out.push({ title: j.title, company: j.company_name, location: (j.location || '') + ', Germany' + (j.remote ? ' (remote)' : ''), type: (j.job_types || []).join(', '),
        url: j.url && /arbeitnow/.test(j.url) ? j.url : `https://www.arbeitnow.com/jobs/companies/${j.slug}`, posted: day((j.created_at || 0) * 1000), jd: [(j.tags || []).join(', '), textOf(j.description)].join('\n').slice(0, 4000), remote: !!j.remote }));
      if (!(d.links || {}).next) break;
    }
    return out;
  }

  async function remotive(q, cc) {
    const d = await getJSON(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q)}&limit=50`);
    return (d.jobs || []).filter(j => K().remoteOk(cc, j.candidate_required_location || 'Worldwide'))
      .map(j => ({ title: j.title, company: j.company_name, location: 'Remote · ' + (j.candidate_required_location || 'Worldwide'), type: j.job_type || '', pay: j.salary || '', url: j.url, posted: day(j.publication_date), jd: textOf(j.description).slice(0, 4000), remote: true }));
  }
  async function jobicy(q, cc) {
    const c = K().get(cc);
    const d = await getJSON(`https://jobicy.com/api/v2/remote-jobs?count=50&geo=${c.jobicy}&tag=${encodeURIComponent(q)}`);
    return (d.jobs || []).map(j => ({ title: textOf(j.jobTitle), company: j.companyName, location: 'Remote · ' + (j.jobGeo || c.name), type: [].concat(j.jobType || []).join(', '),
      pay: j.annualSalaryMin ? `${j.salaryCurrency === 'GBP' ? '£' : j.salaryCurrency === 'USD' ? '$' : j.salaryCurrency === 'EUR' ? '€' : j.salaryCurrency === 'INR' ? '₹' : (j.salaryCurrency || '') + ' '}${j.annualSalaryMin}${j.annualSalaryMax ? '-' + j.annualSalaryMax : ''} per year` : '', url: j.url, posted: day(j.pubDate), jd: textOf(j.jobDescription || j.jobExcerpt).slice(0, 4000), remote: true }));
  }

  /**
   * Search every source. relevant(job) decides what is kept (title/skill match against your searches).
   * onStep(label) reports progress. Returns { jobs, errors, bySource }.
   */
  async function search({ queries, portals, extraPortals, relevant, onStep, country, field }) {
    const cc = K().list[country] ? country : 'GB';
    const out = [], errors = [], bySource = {};
    const add = (list, source) => { const keep = list.filter(j => j && j.title && relevant(j)); keep.forEach(j => { j.source = source; j.sources = [source]; j.country = cc; }); out.push(...keep); bySource[source] = (bySource[source] || 0) + keep.length; };
    // The built-in employer lists are tech and business firms: skip them for fields they don't hire in (your own list always runs).
    const noPortals = ['healthcare', 'education', 'trades', 'hospitality'].includes(field);
    const seen = new Set();
    const list = (portals && portals.length ? portals : noPortals ? [] : portalsFor(cc)).concat(extraPortals || []).map(detect).filter(Boolean)
      .filter(p => { const k = p.kind + ':' + p.slug.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    // Career portals: one call each, limited to the country and your searches.
    for (let i = 0; i < list.length; i += 4) {
      const batch = list.slice(i, i + 4);
      onStep && onStep(`Checking career portals in ${K().get(cc).name}: ${batch.map(p => nice(p.slug)).join(', ')}`);
      await Promise.all(batch.map(async p => {
        try {
          let jobs = (await portal(p, cc)).filter(j => p.kind === 'smartrecruiters' || K().inCountry(cc, j.location));
          if (p.kind === 'greenhouse') {
            // Open only the adverts whose titles look like a fit, then judge them on the full text.
            const pick = jobs.filter(j => relevant(j) || MAYBE.test(j.title)).slice(0, 30);
            jobs = await Promise.all(pick.map(ghDetail));
          }
          add(jobs, 'Careers · ' + nice(p.slug));
        } catch (e) { errors.push(`${nice(p.slug)} careers: ${e.message}`); }
      }));
    }
    // Every profession: The Muse, by the categories that match your field.
    const cats = (window.CVT.fields ? window.CVT.fields.get(field || window.CVT.fields.current().id) : { muse: [] }).muse || [];
    if ((K().get(cc).muse || []).length || cc === 'US') {
      onStep && onStep(`Searching The Muse in ${K().get(cc).name}`);
      try { add(await muse(cats, cc), 'The Muse'); } catch (e) { errors.push(`The Muse: ${e.message}`); }
    }
    if (cc === 'DE') {
      onStep && onStep('Searching Arbeitnow (Germany)');
      try { add(await arbeitnow(), 'Arbeitnow'); } catch (e) { errors.push(`Arbeitnow: ${e.message}`); }
    }
    // Remote boards, per search.
    for (const q of queries.slice(0, 6)) {
      onStep && onStep(`Searching remote boards for “${q}”`);
      await Promise.all([['Remotive', remotive], ['Jobicy', jobicy]].map(async ([name, fn]) => {
        try { add(await fn(q, cc), name); } catch (e) { errors.push(`${name}: ${e.message}`); }
      }));
    }
    return { jobs: out, errors, bySource };
  }

  window.CVT = window.CVT || {};
  window.CVT.websources = { search, detect, urlOf, probe, slugsFor, DEFAULT_PORTALS, portalsFor, nice };
})();
