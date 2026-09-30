/*
 * websources.js — live jobs straight from the browser, no keys and no server:
 *   • company career portals on Greenhouse, Lever, Ashby and SmartRecruiters (their public job APIs)
 *   • remote-job boards Remotive and Jobicy (UK-eligible roles)
 * Every result is filtered against your searches (target titles + skills from your CV) before it reaches the feed.
 */
(function () {
  const UK = /\b(uk|u\.k\.|united kingdom|england|scotland|wales|northern ireland|london|manchester|birmingham|leeds|glasgow|edinburgh|bristol|reading|cambridge|oxford|liverpool|newcastle|sheffield|nottingham|cardiff|belfast|milton keynes|preston|remote|anywhere|emea|europe)\b/i;
  /** Career portals checked to publish UK roles. Anyone can add more (paste the careers page link). */
  const DEFAULT_PORTALS = [
    'https://jobs.smartrecruiters.com/Version1', 'https://boards.greenhouse.io/monzo', 'https://boards.greenhouse.io/tide',
    'https://boards.greenhouse.io/gocardless', 'https://boards.greenhouse.io/deliveroo', 'https://jobs.lever.co/palantir',
    'https://jobs.lever.co/matillion', 'https://jobs.lever.co/spotify'
  ];

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

  async function portal(p) {
    const co = nice(p.slug);
    if (p.kind === 'greenhouse') {
      const d = await getJSON(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(p.slug)}/jobs?content=true`);
      return (d.jobs || []).map(j => ({ title: j.title, company: co, location: (j.location || {}).name || '', url: j.absolute_url, posted: day(j.updated_at || j.first_published), jd: textOf(j.content).slice(0, 4000) }));
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
      const d = await getJSON(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(p.slug)}/postings?limit=100&country=gb`);
      return (d.content || []).map(j => ({ title: j.name, company: (j.company || {}).name || co, location: [(j.location || {}).city, (j.location || {}).remote ? 'Remote' : ''].filter(Boolean).join(', ') || 'United Kingdom',
        type: (j.typeOfEmployment || {}).label || '', url: `https://jobs.smartrecruiters.com/${p.slug}/${j.id}`, posted: day(j.releasedDate), jd: [(j.function || {}).label, (j.department || {}).label, (j.experienceLevel || {}).label].filter(Boolean).join(' · ') }));
    }
    return [];
  }

  async function remotive(q) {
    const d = await getJSON(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q)}&limit=50`);
    return (d.jobs || []).filter(j => UK.test(j.candidate_required_location || 'worldwide') || /worldwide/i.test(j.candidate_required_location || ''))
      .map(j => ({ title: j.title, company: j.company_name, location: 'Remote · ' + (j.candidate_required_location || 'Worldwide'), type: j.job_type || '', pay: j.salary || '', url: j.url, posted: day(j.publication_date), jd: textOf(j.description).slice(0, 4000), remote: true }));
  }
  async function jobicy(q) {
    const d = await getJSON(`https://jobicy.com/api/v2/remote-jobs?count=50&geo=uk&tag=${encodeURIComponent(q)}`);
    return (d.jobs || []).map(j => ({ title: textOf(j.jobTitle), company: j.companyName, location: 'Remote · ' + (j.jobGeo || 'UK'), type: [].concat(j.jobType || []).join(', '),
      pay: j.annualSalaryMin ? `${j.salaryCurrency === 'GBP' ? '£' : (j.salaryCurrency || '') + ' '}${j.annualSalaryMin}${j.annualSalaryMax ? '-' + j.annualSalaryMax : ''} per year` : '', url: j.url, posted: day(j.pubDate), jd: textOf(j.jobDescription || j.jobExcerpt).slice(0, 4000), remote: true }));
  }

  /**
   * Search every source. relevant(job) decides what is kept (title/skill match against your searches).
   * onStep(label) reports progress. Returns { jobs, errors, bySource }.
   */
  async function search({ queries, portals, relevant, onStep }) {
    const out = [], errors = [], bySource = {};
    const add = (list, source) => { const keep = list.filter(j => j && j.title && relevant(j)); keep.forEach(j => { j.source = source; j.sources = [source]; }); out.push(...keep); bySource[source] = (bySource[source] || 0) + keep.length; };
    const list = (portals && portals.length ? portals : DEFAULT_PORTALS).map(detect).filter(Boolean);
    // Career portals: one call each, filtered to UK/remote and your searches.
    for (let i = 0; i < list.length; i += 4) {
      const batch = list.slice(i, i + 4);
      onStep && onStep(`Checking career portals: ${batch.map(p => nice(p.slug)).join(', ')}`);
      await Promise.all(batch.map(async p => {
        try { add((await portal(p)).filter(j => UK.test(j.location || '')), 'Careers · ' + nice(p.slug)); }
        catch (e) { errors.push(`${nice(p.slug)} careers: ${e.message}`); }
      }));
    }
    // Remote boards, per search.
    for (const q of queries.slice(0, 6)) {
      onStep && onStep(`Searching remote boards for “${q}”`);
      await Promise.all([['Remotive', remotive], ['Jobicy', jobicy]].map(async ([name, fn]) => {
        try { add(await fn(q), name); } catch (e) { errors.push(`${name}: ${e.message}`); }
      }));
    }
    return { jobs: out, errors, bySource };
  }

  window.CVT = window.CVT || {};
  window.CVT.websources = { search, detect, DEFAULT_PORTALS, nice };
})();
