/*
 * cvparse.js — reads the plain text of a Word CV and pulls out the details a Career profile needs:
 * name, email, phone, location, current role, certifications, education and every job (title,
 * company, location, dates and the bullet points). Runs in the browser, needs no AI and costs nothing.
 * It only suggests values: the profile keeps anything you typed yourself.
 */
(function () {
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const DATE = `(?:${MONTH}\\.?\\s+\\d{4}|\\d{1,2}[/.-]\\d{4}|\\d{4})`;
  const RANGE = new RegExp(`(${DATE})\\s*(?:[–—-]|to|until)\\s*(present|current|now|till date|to date|${DATE})`, 'i');
  const SECTION = /^(?:professional\s+|work\s+|employment\s+|career\s+|relevant\s+)?(experience|employment(?: history)?|work history|career history|certifications?|certificates|licen[cs]es? (?:&|and) certifications|education(?: and training)?|qualifications|academic|awards?(?: (?:&|and) recognition)?|achievements|clients|key clients|skills|core skills|technical skills|key skills|core competencies|competencies|languages|projects|interests|hobbies|references|personal details|professional synopsis|profile|summary|professional summary|career summary|about me|objective|training|publications|volunteering)\s*:?$/i;

  const ym = s => {
    if (!s) return '';
    const t = String(s).toLowerCase().trim();
    let m = t.match(new RegExp(`^(${MONTH})\\.?\\s+(\\d{4})`, 'i'));
    if (m) return `${m[2]}-${String(MON[m[1].slice(0, 3)] || 1).padStart(2, '0')}`;
    m = t.match(/^(\d{1,2})[/.-](\d{4})/); if (m) return `${m[2]}-${String(+m[1]).padStart(2, '0')}`;
    m = t.match(/^(\d{4})/); return m ? `${m[1]}-01` : '';
  };
  const clean = s => String(s || '').replace(/\s+/g, ' ').replace(/^[\s•▪·\-–—*]+/, '').trim();
  const splitTitle = s => clean(s).split(/\s+[·|•]\s+|\s{2,}|\t/).map(clean).filter(Boolean);

  function sectionOf(line) { const m = clean(line).match(SECTION); return m ? m[1].toLowerCase() : null; }

  function parse(text) {
    const raw = String(text || '').replace(/\r/g, '');
    const lines = raw.split('\n').map(l => l.replace(/ /g, ' ')).filter(l => clean(l));
    const out = { experience: [] };
    const all = raw.replace(/\s+/g, ' ');

    // ---- contact details ----
    const email = all.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i); if (email) out.email = email[0];
    const phone = all.match(/(\+\d{1,3}[\s-]?)?(?:\(?\d{2,5}\)?[\s-]?){2,4}\d{3,4}/);
    if (phone && phone[0].replace(/\D/g, '').length >= 10) {
      out.phone = clean(phone[0]);
      const cc = out.phone.match(/^\+(\d{1,3})/); if (cc) out.phoneCode = '+' + cc[1];
    }
    const li = all.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+/i); if (li) out.linkedin = li[0];
    let loc = null;
    for (const l of lines.slice(0, 12)) { const m = l.match(/(?:location|address|based in)\s*[-:–]\s*([^·|\t]+?)\s*(?:$|[·|\t]|\s{3,})/i); if (m) { loc = m; break; } }
    if (loc) out.location = clean(loc[1]);

    // ---- name: the first short line made of words, before any section ----
    for (const l of lines.slice(0, 6)) {
      const c = clean(l);
      if (sectionOf(c) || /@|\d|http/.test(c)) continue;
      const w = c.split(' ');
      if (w.length >= 2 && w.length <= 5 && w.every(x => /^[A-Za-z][A-Za-z'.-]*$/.test(x))) { out.name = c.replace(/\b([a-z])/g, (m, a) => a.toUpperCase()); break; }
    }
    if (out.name) { const w = out.name.split(' '); out.legalFirst = w[0]; out.legalLast = w[w.length - 1]; if (w.length > 2) out.middleName = w.slice(1, -1).join(' '); }

    // ---- split into sections ----
    const secs = []; let cur = { name: 'top', lines: [] };
    for (const l of lines) { const s = sectionOf(l); if (s) { secs.push(cur); cur = { name: s, lines: [] }; } else cur.lines.push(l); }
    secs.push(cur);
    const get = re => secs.filter(s => re.test(s.name)).flatMap(s => s.lines);

    // ---- work experience ----
    const exp = get(/^(experience|employment|employment history|work history|career history)$/);
    let job = null;
    const push = () => { if (job) { job.desc = job.desc.join('\n').slice(0, 2500); out.experience.push(job); } };
    for (let i = 0; i < exp.length; i++) {
      const line = exp[i], c = clean(line), r = c.match(RANGE);
      if (r && c.length < 160) {
        push();
        const before = clean(c.slice(0, r.index)).replace(/[,|·–—-]+$/, '').trim();
        const after = clean(c.slice(r.index + r[0].length)).replace(/^[,|·–—-]+/, '').trim();
        const current = /present|current|now|date/i.test(r[2]);
        job = { title: '', company: '', location: '', from: ym(r[1]), to: current ? '' : ym(r[2]), current, desc: [] };
        let head = before || after;
        // "Title at Company" or "Title | Company" on the date line
        const at = head.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
        const parts = splitTitle(head);
        if (at) { job.title = clean(at[1]); job.company = clean(at[2]); }
        else if (parts.length >= 2) { job.title = parts[0]; job.company = parts[1]; if (parts[2]) job.location = parts[2]; }
        else job.company = head;
        job.company = job.company.replace(/\s*\((?:permanent|contract|full[- ]time|part[- ]time|fixed[- ]term|freelance)[^)]*\)\s*$/i, '').trim();
        if (/\(contract\)/i.test(before)) job.contract = true;
        // the next line usually holds "Title · Location"
        const nx = exp[i + 1] && clean(exp[i + 1]);
        if (nx && !job.title && !RANGE.test(nx) && nx.length < 120) {
          const p2 = splitTitle(nx);
          job.title = p2[0] || '';
          if (p2[1] && !job.location) job.location = p2[1];
          i++;
        }
        continue;
      }
      if (job) job.desc.push(clean(line));
    }
    push();
    if (out.experience[0]) { out.currentTitle = out.experience[0].title; out.currentCompany = out.experience[0].company; }

    // ---- certifications ----
    const certs = get(/^(certifications?|certificates|licen)/).map(clean).filter(x => x.length > 3 && x.length < 160);
    if (certs.length) out.certifications = certs.join('\n');

    // ---- education (first entry) ----
    const edu = get(/^(education|education and training|qualifications|academic)$/).map(clean).filter(Boolean);
    if (edu.length) {
      const e = edu[0];
      const yr = (e.match(/(?:19|20)\d{2}/g) || []); if (yr.length) { out.eduTo = yr[yr.length - 1]; if (yr.length > 1) out.eduFrom = yr[0]; }
      const br = e.match(/[\[(]([^\])]*?(?:university|college|institute|school|academy)[^\])]*)[\])]/i)
        || e.match(/((?:[A-Z][\w.&'-]*\s+){0,4}(?:University|College|Institute|School|Academy)(?:\s+of\s+[\w &'-]+)?)/);
      if (br) out.school = clean(br[1].split(',')[0]);
      let deg = clean(e.replace(/[\[(][^\])]*?(?:university|college|institute|school|academy)[^\])]*[\])]/i, '').replace(/(?:19|20)\d{2}/g, ''));
      const dm = deg.match(/^(.*?\))\s*,\s*(.+)$/) || deg.match(/^(.+?)\s*(?:,| in | - )\s*(.+)$/i);
      if (dm) { out.degree = clean(dm[1]); out.fieldOfStudy = clean(dm[2]).replace(/[,\s]+$/, ''); } else out.degree = deg;
    }

    // ---- languages ----
    const langs = get(/^languages$/).map(clean).filter(Boolean); if (langs.length) out.languages = langs.join('\n');
    return out;
  }

  /** Fill only empty profile fields; never overwrite what is already there. Returns the list of fields filled. */
  function fillProfile(p, d, opts = {}) {
    const filled = [];
    const set = (k, v) => { if (v && !(String(p[k] ?? '').trim())) { p[k] = v; filled.push(k); } };
    ['name', 'email', 'phone', 'phoneCode', 'linkedin', 'legalFirst', 'middleName', 'legalLast', 'currentTitle', 'currentCompany',
      'certifications', 'school', 'degree', 'fieldOfStudy', 'eduFrom', 'eduTo', 'languages'].forEach(k => set(k, d[k]));
    if (d.location) {
      const parts = d.location.split(',').map(s => s.trim()).filter(Boolean);
      const last = parts[parts.length - 1];
      if (/^(united kingdom|uk|england|scotland|wales|india|ireland|usa|united states)$/i.test(last)) { if (!p.country || p.country === 'United Kingdom') p.country = /^uk$/i.test(last) ? 'United Kingdom' : last; if (parts.length > 1) set('city', parts[0]); }
      else set('city', parts[0]);
    }
    const hasXp = (p.experience || []).some(x => x && (x.title || x.company));
    if ((!hasXp || opts.mergeJobs) && d.experience.length) {
      const have = new Set((p.experience || []).filter(x => x && (x.title || x.company)).map(x => (x.title + '|' + x.company).toLowerCase()));
      const add = d.experience.filter(x => !have.has((x.title + '|' + x.company).toLowerCase())).map(x => ({ title: x.title, company: x.company, location: x.location, from: x.from, to: x.to, current: x.current, desc: x.desc }));
      p.experience = (p.experience || []).filter(x => x && (x.title || x.company)).concat(add);
      if (add.length) filled.push('experience');
    }
    return filled;
  }

  window.CVT = window.CVT || {};
  window.CVT.cvparse = { parse, fillProfile };
})();
