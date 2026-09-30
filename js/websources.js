/*
 * websources.js — live jobs straight from the browser, no keys and no server:
 *   • company career portals on Greenhouse, Lever, Ashby and SmartRecruiters (their public job APIs)
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
    return null;
  }

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
    return [];
  }

  async function ghDetail(j) {
    try { const d = await getJSON(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(j._gh[0])}/jobs/${j._gh[1]}`, 10000); j.jd = textOf(d.content).slice(0, 4000); } catch (_) {}
    delete j._gh; return j;
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
  async function search({ queries, portals, relevant, onStep, country }) {
    const cc = K().list[country] ? country : 'GB';
    const out = [], errors = [], bySource = {};
    const add = (list, source) => { const keep = list.filter(j => j && j.title && relevant(j)); keep.forEach(j => { j.source = source; j.sources = [source]; j.country = cc; }); out.push(...keep); bySource[source] = (bySource[source] || 0) + keep.length; };
    const list = (portals && portals.length ? portals : portalsFor(cc)).map(detect).filter(Boolean);
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
  window.CVT.websources = { search, detect, DEFAULT_PORTALS, portalsFor, nice };
})();
