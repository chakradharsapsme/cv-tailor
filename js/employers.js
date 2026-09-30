/*
 * employers.js — careers sites linked to your CV.
 * Collects employer names from your CV (employers and clients), your profile, your applications and the
 * best-matching jobs already found (and, with an AI engine, similar employers in your country).
 * Each name is checked against the careers systems Applywise can read (Greenhouse, Lever, Workable,
 * Personio, Teamtailor, ...). The ones that publish jobs are searched on every "Find jobs now".
 */
(function () {
  const S = window.CVT.store;
  const W = () => window.CVT.websources, A = () => window.CVT.agent;
  const KEY = 'employers';          // { list: [{name, from, url, kind, slug, jobs, on}], probed: {norm: {at, hit}} }
  const RECHECK_DAYS = 30;
  const norm = s => String(s || '').toLowerCase().replace(/\((.*?)\)/g, '').replace(/\b(ltd|limited|plc|llp|llc|inc|gmbh|ag|bv|pvt|private|pte|corp|group|holdings|the)\b\.?/g, '').replace(/[^a-z0-9]+/g, '');
  const TITLE = /\b(manager|consultant|engineer|analyst|lead|architect|developer|director|officer|assistant|specialist|nurse|teacher|advisor|adviser|executive|head|intern|associate|coordinator|administrator|supervisor|owner|designer|accountant|technician|representative|agent|partner|principal|senior|junior)\b/i;
  const PLACE = /\b(uk|united kingdom|london|manchester|leeds|india|bengaluru|bangalore|hyderabad|pune|mumbai|chennai|remote|hybrid|usa|united states|germany|ireland)\b/i;

  async function load() { return Object.assign({ list: [], probed: {} }, await S.getKV(KEY, null) || {}); }
  const save = d => S.setKV(KEY, d);

  /** Without AI: employer-looking parts of lines that carry dates ("Title · Company · 2019 – present"). */
  function fromText(text) {
    const out = new Set();
    String(text || '').split('\n').forEach(line => {
      const l = line.trim(); if (!l || l.length > 160) return;
      const client = l.match(/^(?:client|customer)s?\s*:\s*([^,;(]+)/i);
      if (client) { out.add(client[1].trim()); return; }
      if (!/\b(19|20)\d{2}\b|present|current/i.test(l)) return;
      l.split(/\s[·|•–—-]\s|\s\|\s|,\s|\s+at\s+|\t/).map(x => x.replace(/\s*\(.*?\)\s*/g, ' ').trim())
        .filter(x => x && x.length >= 2 && x.length <= 45 && /^[A-Z0-9]/.test(x) && !/\d{4}|present|current/i.test(x) && !TITLE.test(x) && !PLACE.test(x) && !/fictional/i.test(x))
        .slice(0, 1).forEach(x => out.add(x.replace(/\s*\(.*$/, '').trim()));
    });
    return [...out];
  }

  /** Names worth checking, strongest signals first. */
  async function candidates({ useAI = true, onStep } = {}) {
    const [p, apps, masters, feed] = await Promise.all([S.getProfile(), S.listApps(), S.listMasters(), S.getKV('feed', { items: {} })]);
    const names = new Map(); const add = (n, from) => { const k = norm(n); if (k.length >= 2 && !names.has(k)) names.set(k, { name: String(n).trim(), from }); };
    let cvText = '';
    const def = masters.find(m => m.isDefault) || masters[0];
    if (def) { try { const mm = await window.CVT.ui.masterModel(def.id); cvText = window.CVT.docx.plainText(mm.model); } catch (_) {} }
    if (cvText && useAI) {
      onStep && onStep('Reading the employers on your CV…');
      try { const r = await A().employersFromCv({ cvText }); (r.employers || []).forEach(e => add(e.name, e.kind === 'client' ? 'Client on your CV' : 'Employer on your CV')); } catch (_) { fromText(cvText).forEach(n => add(n, 'On your CV')); }
    } else fromText(cvText).forEach(n => add(n, 'On your CV'));
    if (p.currentCompany) add(p.currentCompany, 'Your current employer');
    apps.filter(a => a.company && !/fictional/i.test(a.company)).forEach(a => add(a.company, 'You applied'));
    Object.values(feed.items || {}).filter(j => j.company && j.status !== 'hidden' && !/recruit|resourc|staffing|talent|search|selection/i.test(j.company))
      .slice(0, 60).forEach(j => add(j.company, 'Posted a matching job'));
    return [...names.values()].filter(x => !/fictional/i.test(x.name));
  }

  /** Check names against the careers systems (cached for 30 days). Returns the updated list. */
  async function discover({ names, onStep, max = 30, force = false } = {}) {
    const d = await load();
    const now = Date.now(), fresh = at => at && now - at < RECHECK_DAYS * 864e5;
    const todo = names.filter(n => !d.list.some(x => norm(x.name) === norm(n.name)) && (force || !fresh((d.probed[norm(n.name)] || {}).at))).slice(0, max);
    let done = 0, found = 0;
    for (let i = 0; i < todo.length; i += 3) {
      const batch = todo.slice(i, i + 3);
      onStep && onStep(`Checking careers sites: ${batch.map(b => b.name).join(', ')} (${done}/${todo.length})`);
      await Promise.all(batch.map(async n => {
        let hit = null;
        try { hit = await W().probe(n.name); } catch (_) {}
        d.probed[norm(n.name)] = { at: Date.now(), hit: !!hit };
        if (hit) { found++; d.list.push({ name: n.name, from: n.from, url: hit.url, kind: hit.kind, slug: hit.slug, jobs: hit.jobs, on: true, added: new Date().toISOString() }); }
        done++;
      }));
    }
    await save(d);
    return { list: d.list, checked: todo.length, found };
  }

  /** Suggest similar employers in the country with the AI engine, then check them. */
  async function suggest({ onStep } = {}) {
    const p = await S.getProfile(), d = await load();
    const c = window.CVT.countries.get(window.CVT.countries.current());
    onStep && onStep(`Asking the AI for employers in ${c.name}…`);
    const r = await A().similarEmployers({ profile: p, country: c.name, known: d.list.map(x => x.name) });
    const names = (r.employers || []).map(e => ({ name: e.name, from: 'Suggested: ' + (e.why || 'hires for your roles').slice(0, 70) }));
    return discover({ names, onStep, max: 20 });
  }

  /** Careers-page links to search (switched-on employers only). */
  async function portals() { const d = await load(); return d.list.filter(x => x.on !== false && x.url).map(x => x.url); }
  async function toggle(url, on) { const d = await load(); d.list.forEach(x => { if (x.url === url) x.on = on; }); await save(d); }
  async function remove(url) { const d = await load(); d.list = d.list.filter(x => x.url !== url); await save(d); }
  async function addByName(name) {
    const d = await load(), have = d.list.find(x => norm(x.name) === norm(name)); if (have) return have;
    const r = await discover({ names: [{ name, from: 'Added by you' }], max: 1, force: true }); return r.found ? r.list[r.list.length - 1] : null;
  }
  async function forget() { await save({ list: [], probed: {} }); }

  window.CVT = window.CVT || {};
  window.CVT.employers = { load, candidates, discover, suggest, portals, toggle, remove, addByName, forget, fromText, norm };
})();
