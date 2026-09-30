/*
 * countries.js — which country to search, detected from the browser and changeable by the user.
 * Each country knows how to recognise its locations, which job boards people use there,
 * and the codes the job APIs expect.
 */
(function () {
  const e = encodeURIComponent;
  const slug = x => String(x).toLowerCase().replace(/\//g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const google = (q, where) => ({ name: 'Google Jobs', href: `https://www.google.com/search?q=${e(q + ' jobs ' + where)}&ibp=htl;jobs` });
  const linkedin = (q, where) => ({ name: 'LinkedIn', note: 'last 24h', href: `https://www.linkedin.com/jobs/search/?keywords=${e(q)}&location=${e(where)}&f_TPR=r86400` });

  const C = {
    GB: { muse: ['London, United Kingdom', 'Manchester, United Kingdom', 'Edinburgh, United Kingdom', 'Birmingham, United Kingdom', 'Leeds, United Kingdom'], cur: '£', name: 'United Kingdom', flag: '🇬🇧', sr: 'gb', indeed: 'GB', jobicy: 'uk',
      re: /\b(uk|u\.k\.|united kingdom|great britain|england|scotland|wales|northern ireland|london|manchester|birmingham|leeds|glasgow|edinburgh|bristol|reading|cambridge|oxford|liverpool|newcastle|sheffield|nottingham|cardiff|belfast|milton keynes|preston|leicester|southampton)\b/i,
      boards: (q, loc) => { const w = loc || 'United Kingdom', uk = /united kingdom|^uk$/i.test(w); return [linkedin(q, w),
        { name: 'Indeed', note: 'last 3 days', href: `https://uk.indeed.com/jobs?q=${e(q)}&l=${e(uk ? '' : w)}&fromage=3` },
        { name: 'Reed', href: `https://www.reed.co.uk/jobs/${slug(q)}-jobs${uk ? '' : '-in-' + slug(w)}` },
        { name: 'Totaljobs', href: `https://www.totaljobs.com/jobs/${slug(q)}${uk ? '' : '/in-' + slug(w)}` },
        { name: 'CWJobs', note: 'IT', href: `https://www.cwjobs.co.uk/jobs/${slug(q)}${uk ? '' : '/in-' + slug(w)}` },
        { name: 'Jobserve', note: 'contracts', href: `https://www.jobserve.com/gb/en/JobSearch.aspx?shid=&q=${e(q)}` },
        { name: 'CV-Library', href: `https://www.cv-library.co.uk/${slug(q)}-jobs${uk ? '' : '-in-' + slug(w)}` },
        { name: 'Adzuna', href: `https://www.adzuna.co.uk/jobs/search?q=${e(q)}${uk ? '' : '&w=' + e(w)}` },
        { name: 'Glassdoor', href: `https://www.glassdoor.co.uk/Job/jobs.htm?sc.keyword=${e(q)}` }, google(q, uk ? 'UK' : w)]; } },
    IN: { muse: ['Bengaluru, India', 'Hyderabad, India', 'Mumbai, India', 'Pune, India', 'Gurgaon, India', 'Chennai, India', 'Noida, India'], cur: '₹', name: 'India', flag: '🇮🇳', sr: 'in', indeed: 'IN', jobicy: 'apac',
      re: /\b(india|bengaluru|bangalore|hyderabad|pune|mumbai|navi mumbai|chennai|gurugram|gurgaon|noida|delhi|new delhi|kolkata|ahmedabad|kochi|cochin|coimbatore|jaipur|chandigarh|thiruvananthapuram|trivandrum|indore|nagpur|mysore|mysuru|vadodara|bhubaneswar)\b/i,
      boards: (q, loc) => { const w = loc || 'India'; return [linkedin(q, w),
        { name: 'Naukri', href: `https://www.naukri.com/${slug(q)}-jobs${/^india$/i.test(w) ? '' : '-in-' + slug(w)}` },
        { name: 'Indeed', note: 'last 3 days', href: `https://in.indeed.com/jobs?q=${e(q)}&l=${e(/^india$/i.test(w) ? '' : w)}&fromage=3` },
        { name: 'Foundit', href: `https://www.foundit.in/srp/results?query=${e(q)}&locations=${e(/^india$/i.test(w) ? '' : w)}` },
        { name: 'Shine', href: `https://www.shine.com/job-search/${slug(q)}-jobs${/^india$/i.test(w) ? '' : '-in-' + slug(w)}` },
        { name: 'Glassdoor', href: `https://www.glassdoor.co.in/Job/jobs.htm?sc.keyword=${e(q)}` }, google(q, w)]; } },
    US: { muse: [], cur: '$', name: 'United States', flag: '🇺🇸', sr: 'us', indeed: 'US', jobicy: 'usa',
      re: /\b(united states|usa|u\.s\.|new york|nyc|san francisco|bay area|seattle|austin|chicago|boston|los angeles|denver|atlanta|dallas|houston|washington,? d\.?c|miami|philadelphia|phoenix|san jose|san diego|portland|minneapolis|raleigh|charlotte|pittsburgh|detroit|nashville|salt lake city)\b|,\s?(al|az|ca|co|ct|dc|fl|ga|il|in|ma|md|mi|mn|mo|nc|nj|ny|oh|or|pa|tn|tx|ut|va|wa|wi)\b/i,
      boards: (q, loc) => { const w = loc || 'United States'; return [linkedin(q, w),
        { name: 'Indeed', note: 'last 3 days', href: `https://www.indeed.com/jobs?q=${e(q)}&l=${e(/united states/i.test(w) ? '' : w)}&fromage=3` },
        { name: 'Dice', note: 'IT', href: `https://www.dice.com/jobs?q=${e(q)}&location=${e(w)}` },
        { name: 'ZipRecruiter', href: `https://www.ziprecruiter.com/jobs-search?search=${e(q)}&location=${e(w)}` },
        { name: 'Glassdoor', href: `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${e(q)}` }, google(q, w)]; } },
    IE: { muse: ['Dublin, Ireland'], cur: '€', name: 'Ireland', flag: '🇮🇪', sr: 'ie', indeed: 'IE', jobicy: 'ireland',
      re: /\b(ireland|dublin|cork|galway|limerick|waterford|kilkenny)\b/i,
      boards: (q, loc) => { const w = loc || 'Ireland'; return [linkedin(q, w),
        { name: 'Indeed', href: `https://ie.indeed.com/jobs?q=${e(q)}&fromage=3` }, { name: 'IrishJobs', href: `https://www.irishjobs.ie/jobs/${slug(q)}` },
        { name: 'Jobs.ie', href: `https://www.jobs.ie/jobs/${slug(q)}` }, google(q, w)]; } },
    DE: { muse: ['Berlin, Germany', 'Munich, Germany', 'Hamburg, Germany'], cur: '€', name: 'Germany', flag: '🇩🇪', sr: 'de', indeed: 'DE', jobicy: 'germany',
      re: /\b(germany|deutschland|berlin|munich|münchen|hamburg|frankfurt|cologne|köln|stuttgart|düsseldorf|dusseldorf|leipzig|walldorf|nuremberg|nürnberg)\b/i,
      boards: (q, loc) => { const w = loc || 'Germany'; return [linkedin(q, w),
        { name: 'Indeed', href: `https://de.indeed.com/jobs?q=${e(q)}&fromage=3` }, { name: 'StepStone', href: `https://www.stepstone.de/jobs/${slug(q)}` }, google(q, w)]; } },
    NL: { muse: ['Amsterdam, Netherlands'], cur: '€', name: 'Netherlands', flag: '🇳🇱', sr: 'nl', indeed: 'NL', jobicy: 'netherlands',
      re: /\b(netherlands|holland|amsterdam|rotterdam|utrecht|eindhoven|the hague|den haag)\b/i,
      boards: (q, loc) => { const w = loc || 'Netherlands'; return [linkedin(q, w), { name: 'Indeed', href: `https://nl.indeed.com/jobs?q=${e(q)}&fromage=3` }, google(q, w)]; } },
    AE: { muse: ['Dubai, United Arab Emirates'], cur: 'AED ', name: 'United Arab Emirates', flag: '🇦🇪', sr: 'ae', indeed: 'AE', jobicy: 'emea',
      re: /\b(united arab emirates|uae|dubai|abu dhabi|sharjah)\b/i,
      boards: (q, loc) => { const w = loc || 'United Arab Emirates'; return [linkedin(q, w),
        { name: 'Bayt', href: `https://www.bayt.com/en/uae/jobs/${slug(q)}-jobs/` }, { name: 'Naukrigulf', href: `https://www.naukrigulf.com/${slug(q)}-jobs-in-uae` },
        { name: 'Indeed', href: `https://ae.indeed.com/jobs?q=${e(q)}` }, google(q, w)]; } },
    SG: { muse: ['Singapore, Singapore'], cur: 'S$', name: 'Singapore', flag: '🇸🇬', sr: 'sg', indeed: 'SG', jobicy: 'singapore',
      re: /\bsingapore\b/i,
      boards: (q, loc) => { const w = loc || 'Singapore'; return [linkedin(q, w), { name: 'MyCareersFuture', href: `https://www.mycareersfuture.gov.sg/search?search=${e(q)}` },
        { name: 'JobStreet', href: `https://www.jobstreet.com.sg/${slug(q)}-jobs` }, { name: 'Indeed', href: `https://sg.indeed.com/jobs?q=${e(q)}` }, google(q, w)]; } },
    AU: { muse: ['Sydney, Australia', 'Melbourne, Australia'], cur: 'A$', name: 'Australia', flag: '🇦🇺', sr: 'au', indeed: 'AU', jobicy: 'australia',
      re: /\b(australia|sydney|melbourne|brisbane|perth|adelaide|canberra|gold coast)\b/i,
      boards: (q, loc) => { const w = loc || 'Australia'; return [linkedin(q, w), { name: 'SEEK', href: `https://www.seek.com.au/${slug(q)}-jobs` },
        { name: 'Indeed', href: `https://au.indeed.com/jobs?q=${e(q)}` }, google(q, w)]; } },
    CA: { muse: ['Toronto, Canada', 'Vancouver, Canada'], cur: 'C$', name: 'Canada', flag: '🇨🇦', sr: 'ca', indeed: 'CA', jobicy: 'canada',
      re: /\b(canada|toronto|vancouver|montreal|montréal|calgary|ottawa|edmonton|waterloo|mississauga)\b/i,
      boards: (q, loc) => { const w = loc || 'Canada'; return [linkedin(q, w), { name: 'Indeed', href: `https://ca.indeed.com/jobs?q=${e(q)}` },
        { name: 'Job Bank', href: `https://www.jobbank.gc.ca/jobsearch/jobsearch?searchstring=${e(q)}` }, google(q, w)]; } }
  };
  // Wider regions whose remote roles are open to people in the country.
  const REGION = { GB: /\b(europe|emea|uk)\b/i, IE: /\b(europe|emea|eu)\b/i, DE: /\b(europe|emea|eu)\b/i, NL: /\b(europe|emea|eu)\b/i,
    IN: /\b(asia|apac|india)\b/i, SG: /\b(asia|apac)\b/i, AU: /\b(apac|oceania)\b/i, AE: /\b(middle east|mena|emea|gcc)\b/i,
    US: /\b(americas|north america|usa|us only|us-only)\b/i, CA: /\b(americas|north america|canada)\b/i };
  // Employers whose public careers portals list jobs in each country (anyone can add more).
  const GLOBAL = ['https://jobs.smartrecruiters.com/ServiceNow', 'https://jobs.smartrecruiters.com/Experian', 'https://boards.greenhouse.io/databricks', 'https://boards.greenhouse.io/okta'];
  const PORTALS = {
    GB: ['https://jobs.smartrecruiters.com/Version1', 'https://boards.greenhouse.io/monzo', 'https://boards.greenhouse.io/tide', 'https://boards.greenhouse.io/gocardless',
      'https://boards.greenhouse.io/deliveroo', 'https://jobs.lever.co/palantir', 'https://jobs.lever.co/matillion', 'https://jobs.lever.co/spotify'],
    IN: ['https://jobs.smartrecruiters.com/BoschGroup', 'https://jobs.smartrecruiters.com/ServiceNow', 'https://jobs.smartrecruiters.com/Experian', 'https://boards.greenhouse.io/databricks',
      'https://boards.greenhouse.io/okta', 'https://boards.greenhouse.io/druva', 'https://boards.greenhouse.io/groww', 'https://jobs.lever.co/paytm', 'https://jobs.lever.co/zeta', 'https://jobs.lever.co/cred'],
    US: ['https://jobs.smartrecruiters.com/ServiceNow', 'https://jobs.smartrecruiters.com/Experian', 'https://jobs.smartrecruiters.com/AbbVie', 'https://boards.greenhouse.io/databricks',
      'https://boards.greenhouse.io/okta', 'https://boards.greenhouse.io/stripe', 'https://boards.greenhouse.io/twilio', 'https://jobs.ashbyhq.com/ramp', 'https://jobs.ashbyhq.com/notion'],
    IE: ['https://jobs.smartrecruiters.com/Version1', 'https://jobs.smartrecruiters.com/ServiceNow', 'https://boards.greenhouse.io/stripe', 'https://boards.greenhouse.io/okta', 'https://boards.greenhouse.io/databricks'],
    DE: ['https://jobs.smartrecruiters.com/BoschGroup', 'https://jobs.smartrecruiters.com/ServiceNow', 'https://boards.greenhouse.io/databricks', 'https://boards.greenhouse.io/gitlab'],
    NL: ['https://jobs.smartrecruiters.com/ServiceNow', 'https://boards.greenhouse.io/databricks', 'https://boards.greenhouse.io/elastic', 'https://boards.greenhouse.io/stripe']
  };
  const portals = code => PORTALS[code] || GLOBAL;
  const ANYWHERE = /^\s*(remote|anywhere|worldwide|global|remote - worldwide|remote \(worldwide\))\s*$/i;

  /** Best guess from the browser's time zone, then its language region. */
  function detect() {
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_) {}
    const byTz = [[/^Europe\/(London|Belfast)$/, 'GB'], [/^Asia\/(Kolkata|Calcutta)$/, 'IN'], [/^Europe\/Dublin$/, 'IE'], [/^Europe\/Berlin$/, 'DE'], [/^Europe\/Amsterdam$/, 'NL'],
      [/^Asia\/Dubai$/, 'AE'], [/^Asia\/Singapore$/, 'SG'], [/^Australia\//, 'AU'], [/^America\/(Toronto|Vancouver|Montreal|Edmonton|Winnipeg|Halifax|Regina|St_Johns)$/, 'CA'], [/^(America\/|US\/)/, 'US']];
    for (const [re, c] of byTz) if (re.test(tz)) return c;
    const region = ((navigator.language || '').split('-')[1] || '').toUpperCase();
    return C[region] ? region : 'GB';
  }
  /** Does this job location belong to the country? "Remote"/"Anywhere" counts everywhere. */
  const inCountry = (code, location) => { const c = C[code] || C.GB; const l = String(location || ''); return c.re.test(l) || ANYWHERE.test(l) || (/remote/i.test(l) && c.re.test(l)); };

  window.CVT = window.CVT || {};
  /** Remote roles open to this country (worldwide, or a region that includes it). */
  const remoteOk = (code, where) => { const w = String(where || ''); return !w || /worldwide|anywhere|global/i.test(w) || (C[code] || C.GB).re.test(w) || (REGION[code] ? REGION[code].test(w) : false); };
  /** The country chosen in Jobs → Searches, else the browser's own. */
  const current = () => { try { const c = JSON.parse(localStorage.getItem('cvt.country') || 'null'); if (C[c]) return c; } catch (_) {} return detect(); };
  const remember = code => { try { localStorage.setItem('cvt.country', JSON.stringify(code)); } catch (_) {} };

  window.CVT.countries = { list: C, detect, inCountry, remoteOk, portals, current, remember, get: code => C[code] || C.GB };
})();
