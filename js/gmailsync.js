/*
 * gmailsync.js — job emails from your own Gmail, free.
 * A small Google Apps Script that YOU add to your Google account reads your job-alert emails (read only) and hands them
 * to Applywise when the Jobs page opens. Applywise turns LinkedIn, Indeed, CWJobs/Totaljobs alerts and recruiter emails
 * into jobs, keeps the ones that fit your profile (SAP, S2P/P2P, procurement systems, ERP/IT business analysis) and adds
 * them to "Jobs for you". No Claude task, no server, no cost. Nothing is sent, labelled or deleted in Gmail.
 */
(function () {
  const S = () => window.CVT.store;
  const URL_KEY = 'cvt.gmailUrl', SINCE_KEY = 'cvt.gmailSince', STAT_KEY = 'cvt.gmailStat', KEY_KEY = 'cvt.gmailKey';
  const get = (k, d) => { try { return S().local.get(k, d); } catch (_) { return d; } };
  const set = (k, v) => { try { S().local.set(k, v); } catch (_) {} };

  // ---------- relevance (IT / SAP / procurement-systems roles, UK) ----------
  // Strong words alone make a job relevant; general role names count only together with a strong word.
  const STRONG = /\b(sap|ariba|s\/?4\s?hana|s\/4|s4|source[\s-]*(to[\s-]*)?pay|procure[\s-]*to[\s-]*pay|s2p|p2p|ptp|srm|coupa|jaggaer|ivalua|guided buying|erp|e-?procurement|procurement (systems?|technology|tech|transformation|solutions?|platform|consult\w*|lead|architect|analyst|process)|consult\w* [-–,]? ?procurement|purchasing systems?)/i;
  const GENERAL = /\b(business (systems? )?analyst|systems analyst|solutions? architect|functional (consultant|lead|architect)|process owner|business process expert|mm\b|cutover|delivery lead)/i;
  const UNFIT = /\b(maintenance (leader|engineer|technician|planner)|electrical|senior authori[sz]ed person|hv\b|high voltage|warehouse operative|forklift|driver|nurse|teacher|chef|payroll|recruiter\b|sales executive|cyber|soc\b|iam\b|penetration|devops|front[- ]?end|back[- ]?end developer|data scientist|basis\b|successfactors|hcm\b)/i;
  const ABROAD = /\b(india|hyderabad|bengaluru|bangalore|pune|chennai|mumbai|noida|gurugram|germany|deutschland|berlin|munich|france|paris|spain|netherlands|amsterdam|poland|usa|united states|canada|dubai|uae|singapore|australia|ireland\b(?!.*uk))/i;
  function fits(j) {
    const t = `${j.title} ${j.snippet || ''}`;
    if (!STRONG.test(j.title) && !(GENERAL.test(j.title) && STRONG.test(t))) return false;
    if (UNFIT.test(j.title)) return false;
    if (ABROAD.test(j.location || '')) return false;
    return true;
  }

  // ---------- parsers ----------
  const lines = s => String(s || '').replace(/\r/g, '').split('\n').map(x => x.replace(/[͏​-‍ ]+/g, ' ').trim());
  const PAY = /(£|\$|€|\bper (annum|day|hour)\b|\/ ?(year|yr|day|hr|hour)\b|\ba (year|day|month|week)\b|\bk\b.*-|daily rate|day rate)/i;
  const AGE = /^(just posted|today|\d+\+? (day|days|hour|hours) ago|new)$/i;
  const isoDay = d => new Date(d).toISOString().slice(0, 10);
  const daysAgo = (base, txt) => { const m = /^(\d+)\+? day/i.exec(txt || ''); return isoDay(new Date(base).getTime() - (m ? +m[1] : 0) * 864e5); };
  const BADGE = /^(top applicant|this company is actively hiring|actively recruiting|apply with resume( & profile)?|easy apply|fast growing|promoted|be an early applicant|\d+ company alumni?|\d+ (connection|connections|school alumni?).*|you('|’)?re a top applicant.*|your profile matches.*|new|apply now)$/i;

  function linkedin(m) {
    const out = [];
    for (const chunk of String(m.body).split(/\n-{20,}\n/)) {
      const ls = lines(chunk).filter(Boolean);
      const v = ls.findIndex(l => /^View job:/i.test(l));
      if (v < 0) continue;
      const id = (/jobs\/view\/(\d+)/.exec(ls[v]) || [])[1];
      let pay = '';
      const rest = ls.slice(0, v).filter(l => {
        if (/https?:\/\//.test(l) || BADGE.test(l) || /^</.test(l)) return false;
        if (PAY.test(l) && /\d/.test(l) && l.length < 60) { pay = pay || l; return false; }
        return true;
      });
      if (rest.length < 2) continue;
      const [title, company, location] = rest.length >= 3 ? rest.slice(-3) : [rest[0], rest[1], ''];
      out.push({ title, company, location, pay, url: id ? `https://www.linkedin.com/jobs/view/${id}/` : '', source: 'LinkedIn (Gmail)', posted: isoDay(m.date) });
    }
    return out;
  }

  function indeedAlert(m) {
    const out = [];
    const body = String(m.body);
    const start = body.search(/Jobs \d+-\d+ of \d+ new job/i);
    const blocks = (start >= 0 ? body.slice(start) : body).split(/\n\s*\n/);
    for (const b of blocks) {
      const ls = lines(b).filter(Boolean);
      if (ls.length < 3 || !/^https?:\/\//.test(ls[ls.length - 1]) || !/indeed\./i.test(ls[ls.length - 1])) continue;
      const url = ls[ls.length - 1], title = ls[0];
      if (/^https?:/.test(title) || /^See matching|^Jobs \d/i.test(title)) continue;
      const cl = ls[1], cut = cl.lastIndexOf(' - ');
      const company = cut > 0 ? cl.slice(0, cut) : cl, location = cut > 0 ? cl.slice(cut + 3) : '';
      let pay = '', age = '', snip = [];
      ls.slice(2, -1).forEach(l => { if (AGE.test(l)) age = l; else if (PAY.test(l) && /\d/.test(l) && l.length < 70) pay = l; else snip.push(l); });
      out.push({ title, company, location, pay, url, snippet: snip.join(' ').replace(/�|…$/g, '').trim(), source: 'Indeed (Gmail)', posted: daysAgo(m.date, age) });
    }
    return out;
  }

  function indeedMatch(m) {
    const ls = lines(m.body);
    const v = ls.findIndex(l => /^View job:/i.test(l));
    if (v < 0) return [];
    const field = re => ((ls.find(l => re.test(l)) || '').replace(re, '').replace(/\s+-\s+https?:.*$/, '').trim());
    const prev = ls.slice(0, v).filter(l => l && !/^(salary|job type|work setting|pay|minimum base pay|schedule|benefits?)\s*:/i.test(l));
    const [title, company, location] = prev.slice(-3);
    const pay = field(/^(?:minimum base pay|salary|pay)\s*:\s*/i);
    const type = field(/^job type\s*:\s*/i), setting = field(/^work setting\s*:\s*/i);
    const intro = prev.find(l => /great match|could be a/i.test(l)) || '';
    return [{ title, company, location: [location, setting].filter((x, i, a) => x && a.indexOf(x) === i).join(' · '), pay, type, url: (/https?:\/\/\S+/.exec(ls[v]) || [''])[0], snippet: intro, source: 'Indeed (Gmail)', posted: isoDay(m.date) }];
  }

  function stepstone(m, site) { // CWJobs, Totaljobs (same template)
    const ls = lines(m.body);
    const out = [];
    for (let i = 0; i < ls.length - 2; i++) {
      const t = ls[i];
      if (!t || /^https?:/.test(t) || !/^https?:\/\/click\./.test(ls[i + 1] || '') || !ls[i + 2] || /^https?:/.test(ls[i + 2])) continue;
      if (/^(see all matching jobs|criteria:|manage all|unsubscribe)/i.test(t)) continue;
      const url = ls[i + 1];
      const after = [];
      let j = i + 2;
      for (; j < ls.length && after.length < 12; j++) { const l = ls[j]; if (/^more$/i.test(l) || /^https?:/.test(l)) break; if (l) after.push(l); }
      const [company = '', location = '', ...more] = after;
      const type = more.find(l => /permanent|contract|temporary|part time|full time/i.test(l)) || '';
      const pay = more.find(l => l !== type && (PAY.test(l) || /negotiable|competitive|to define/i.test(l)) && l.length < 80) || '';
      const snippet = more.filter(l => l !== type && l !== pay).join(' ').replace(/\.\.\.$/, '…');
      out.push({ title: t, company, location, type: type.replace(/ Contract$/, ''), pay: /to define/i.test(pay) ? '' : pay, url, snippet, source: site + ' (Gmail)', posted: isoDay(m.date) });
      i = j;
    }
    return out;
  }

  function recruiter(m) {
    const subj = String(m.subject || '').replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, '').replace(/^(new (role|requirement|opportunity)|urgent( requirement)?|job opportunity|opportunity)\s*[-:–]\s*/i, '').trim();
    if (!STRONG.test(subj)) return [];
    const body = lines(m.body).filter(Boolean).join('\n');
    const pick = re => ((re.exec(body) || [])[1] || '').trim().slice(0, 80);
    const title = subj.split(/\s+[-–|]\s+/)[0].slice(0, 90);
    const from = String(m.from || '');
    const dom = (/@([\w-]+)\./.exec(from) || [])[1] || '';
    const company = /^(gmail|outlook|hotmail|yahoo|icloud|live)$/i.test(dom) ? ((/^"?([^"<]+?)"?\s*</.exec(from) || [])[1] || '') : dom.replace(/^./, c => c.toUpperCase());
    const text = body.replace(/^(dear|hi|hello)[^\n]*\n/i, '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
    return [{ title, company: company || 'Recruiter', location: pick(/Location\s*:\s*\n?([^\n]+)/i) || (/\b(london|manchester|leeds|birmingham|remote|hybrid)\b/i.exec(subj) || [''])[0],
      type: /contract|ir35|day rate|months?/i.test(subj + body.slice(0, 1500)) ? 'Contract' : '', pay: pick(/(?:Daily Rate|Day Rate|Rate|Salary)\s*:\s*\n?([^\n]+)/i),
      url: m.id ? 'https://mail.google.com/mail/#all/' + m.id : '', snippet: text.slice(0, 900), source: 'Recruiter email', posted: isoDay(m.date) }];
  }

  const BOARD = /linkedin\.com|indeed\.com|cwjobs|totaljobs|glassdoor|jooble|reed\.co\.uk|cv-library|adzuna|monster/i;
  function parse(m) {
    const f = String(m.from || '').toLowerCase();
    let jobs = [];
    try {
      if (/jobalerts-noreply@linkedin|jobs-noreply@linkedin|jobs-listings@linkedin/.test(f)) jobs = linkedin(m);
      else if (/jobalert\.indeed/.test(f)) jobs = indeedAlert(m);
      else if (/match\.indeed|indeed\.com/.test(f)) jobs = indeedMatch(m);
      else if (/cwjobs/.test(f)) jobs = stepstone(m, 'CWJobs');
      else if (/totaljobs/.test(f)) jobs = stepstone(m, 'Totaljobs');
      else if (!BOARD.test(f)) jobs = recruiter(m);
    } catch (_) { jobs = []; }
    return jobs.filter(j => j && j.title && j.title.length < 140).map(j => ({ ...j, title: j.title.replace(/\s+/g, ' ').trim(), sources: [j.source], query: 'Gmail', snippet: (j.snippet || '').slice(0, 1500), emailId: m.id }));
  }

  // ---------- fetch from your Apps Script ----------
  function configured() { return !!get(URL_KEY, ''); }
  function key() { let k = get(KEY_KEY, ''); if (!k) { const a = new Uint8Array(18); crypto.getRandomValues(a); k = Array.from(a, b => b.toString(36).padStart(2, '0')).join('').slice(0, 24); set(KEY_KEY, k); } return k; }
  function setUrl(u) {
    u = String(u || '').trim();
    if (u && !/^https:\/\/script\.google(usercontent)?\.com\/macros\/s\/[\w-]+\/exec/.test(u)) throw new Error('That is not an Apps Script web app link. It ends in /exec.');
    set(URL_KEY, u.replace(/[?#].*$/, '')); if (!u) { set(SINCE_KEY, ''); set(STAT_KEY, ''); }
  }
  const script = () => SCRIPT(key());
  const url = () => get(URL_KEY, '');
  function status() { try { return JSON.parse(get(STAT_KEY, '') || 'null'); } catch (_) { return null; } }

  async function pull(opts = {}) {
    const base = get(URL_KEY, ''); if (!base) return null;
    const since = opts.full ? '' : get(SINCE_KEY, '');
    const q = new URLSearchParams({ key: key(), days: String(opts.days || 60) });
    if (since) q.set('since', since);
    const r = await fetch(base + '?' + q.toString(), { redirect: 'follow' });
    if (!r.ok) throw new Error('Gmail script answered ' + r.status);
    const d = await r.json();
    if (d.error) throw new Error(d.error === 'Wrong key' ? 'The key in your Gmail script does not match this browser. Copy the script again from Applywise.' : d.error);
    const all = [], seen = new Set();
    for (const m of d.mails || []) for (const j of parse(m)) {
      const k = (j.title + '|' + j.company).toLowerCase().replace(/[^a-z0-9|]+/g, ' ');
      if (seen.has(k)) continue; seen.add(k);
      if (fits(j)) all.push(j);
    }
    // Next time ask only for mail from an hour before this run (overlap is removed by the de-duplication).
    set(SINCE_KEY, new Date(Date.now() - 3600e3).toISOString());
    const stat = { updated: new Date().toISOString(), mails: (d.mails || []).length, jobs: all.length };
    set(STAT_KEY, JSON.stringify(stat));
    return { updated: stat.updated, sources: ['Gmail'], errors: [], jobs: all, mails: stat.mails };
  }

  const SCRIPT = k => `/**
 * Applywise – Gmail job reader. Runs in YOUR Google account, free.
 * It only READS job-alert and recruiter emails and returns them to your Applywise.
 * It never sends, labels, moves or deletes anything.
 */
const KEY = '${k}';   // must match your Applywise (keep it private)
const QUERY = '(from:jobalerts-noreply@linkedin.com OR from:jobs-noreply@linkedin.com OR from:jobalert.indeed.com OR from:match.indeed.com OR from:cwjobs.co.uk OR from:totaljobs.com OR subject:(SAP OR Ariba OR "source to pay" OR S2P OR P2P OR S4HANA OR "S/4HANA" OR Coupa)) -in:sent -in:chats -in:drafts';

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.key !== KEY) return out_({ error: 'Wrong key' });
  const days = Math.min(Math.max(parseInt(p.days || '60', 10) || 60, 1), 90);
  const since = p.since ? new Date(p.since) : new Date(Date.now() - days * 864e5);
  const after = Utilities.formatDate(new Date(since.getTime() - 864e5), 'GMT', 'yyyy/MM/dd');
  const threads = GmailApp.search(QUERY + ' after:' + after, 0, 400);
  const mails = [];
  threads.forEach(function (t) {
    t.getMessages().forEach(function (m) {
      if (m.getDate() < since) return;
      const body = m.getPlainBody()
        .replace(/https:\\/\\/www\\.linkedin\\.com\\/comm\\/jobs\\/view\\/(\\d+)\\S*/g, 'https://www.linkedin.com/jobs/view/$1/')
        .replace(/https?:\\/\\/\\S{400,}/g, function (u) { return /indeed\\.com|cwjobs|totaljobs/.test(u.slice(0, 60)) ? u : ''; });
      mails.push({ id: m.getId(), date: m.getDate().toISOString(), from: m.getFrom(), subject: m.getSubject(), body: body.slice(0, 40000) });
    });
  });
  return out_({ updated: new Date().toISOString(), count: mails.length, mails: mails });
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// Press Run on this once to give the script permission to read your Gmail.
function test() { Logger.log(doGet({ parameter: { key: KEY, days: '7' } }).getContent().slice(0, 500)); }
`;


  // ---------- Jobs page panel: set-up and status ----------
  function panel(box, opts = {}) {
    const { html, raw, toast, copy } = window.CVT.ui;
    const inArtifact = !!(window.claude && window.claude.use);
    let open = !configured(), busy = false, note = '';
    const draw = () => {
      const st = status();
      box.innerHTML = String(html`
        <div class="panel-head"><h2>📧 Jobs from my Gmail</h2>${configured() ? html`<span class="chip ok">Connected</span>` : html`<span class="chip muted">Not set up</span>`}</div>
        <p class="hint">Your LinkedIn, Indeed, CWJobs and Totaljobs job alerts and recruiter emails become jobs here, filtered to roles that fit your CV. A small free script in your own Google account reads them (read only) whenever this page opens. Nothing is sent, labelled or deleted.</p>
        ${inArtifact ? html`<p class="muted small">This copy runs inside Claude, which can't reach Google directly. Use it on <a class="link" href="https://chakradharsapsme.github.io/cv-tailor/" target="_blank" rel="noopener">GitHub Pages</a> or <a class="link" href="https://applywise-1bt.pages.dev" target="_blank" rel="noopener">Cloudflare</a>, or ask Claude to “pull my Gmail jobs”.</p>` : ''}
        ${configured() ? html`
          <p class="small">${st ? html`Last sync ${new Date(st.updated).toLocaleString()}: ${st.mails} email${st.mails === 1 ? '' : 's'} read, ${st.jobs} matching job${st.jobs === 1 ? '' : 's'}.` : 'Not synced yet.'}</p>
          ${note ? html`<p class="small ${/fail|error|not|wrong/i.test(note) ? 'warn-text' : ''}">${note}</p>` : ''}
          <div class="row gap wrap"><button class="btn small" type="button" data-gm="sync" ${busy ? raw('disabled') : ''}>${busy ? 'Reading Gmail…' : 'Sync Gmail now'}</button>
            <button class="btn ghost small" type="button" data-gm="full" ${busy ? raw('disabled') : ''}>Re-read last 60 days</button>
            <button class="linkish small" type="button" data-gm="setup">${open ? 'Hide set-up' : 'Set-up steps'}</button>
            <button class="linkish small danger" type="button" data-gm="off">Disconnect</button></div>` : ''}
        ${!configured() && note ? html`<p class="small warn-text">${note}</p>` : ''}
        ${open ? html`<ol class="gm-steps small">
          <li>Open <a class="link" href="https://script.google.com/home/projects/create" target="_blank" rel="noopener">Google Apps Script → New project</a>, signed in to the Gmail account that receives your job alerts.</li>
          <li>Delete the sample text and paste this script: <button class="btn ghost small" type="button" data-gm="copy">Copy script</button>
            <details><summary>Show the script</summary><textarea class="gm-code" readonly rows="10">${script()}</textarea></details></li>
          <li>Press <strong>Save</strong>, choose the function <code>test</code> and press <strong>Run</strong>, then <strong>Allow</strong> it to read your Gmail. If Google says the app isn't verified, choose <em>Advanced → Go to the project</em>: it is your own script.</li>
          <li><strong>Deploy → New deployment</strong> → type <strong>Web app</strong>; Execute as <strong>Me</strong>; Who has access <strong>Anyone</strong>. Press Deploy and copy the <strong>Web app URL</strong>. (Only someone with this browser's private key can read anything from it.)</li>
          <li>Paste the URL here:
            <div class="row gap wrap mt"><input id="gm-url" type="url" placeholder="https://script.google.com/macros/s/…/exec" value="${url()}" aria-label="Apps Script web app URL"><button class="btn primary small" type="button" data-gm="save" ${busy ? raw('disabled') : ''}>Connect and read 60 days</button></div></li>
        </ol>
        <p class="muted small">Free: it runs on Google's free Apps Script quota in your account. If you copy Applywise to another browser, copy the script again from there (each browser has its own key).</p>` : ''}`);
    };
    const run = async full => {
      busy = true; note = ''; draw();
      try { const r = await (opts.onSync ? opts.onSync(full) : pull({ full })); const st = status(); note = st ? `Done: ${st.jobs} matching job${st.jobs === 1 ? '' : 's'} from ${st.mails} email${st.mails === 1 ? '' : 's'}.` : 'Done.'; }
      catch (e) { note = 'Sync failed: ' + ((e && e.message) || e) + (/fetch|network/i.test(String(e && e.message)) ? ' (check the web app is deployed with access “Anyone”)' : ''); }
      busy = false; draw();
    };
    box.addEventListener('click', async e => {
      const b = e.target.closest('[data-gm]'); if (!b) return;
      const a = b.dataset.gm;
      if (a === 'copy') return copy(script(), b);
      if (a === 'setup') { open = !open; return draw(); }
      if (a === 'off') { setUrl(''); open = true; note = ''; toast('Gmail disconnected. Remove the deployment in Apps Script if you no longer need it.'); return draw(); }
      if (a === 'sync') return run(false);
      if (a === 'full') { set(SINCE_KEY, ''); return run(true); }
      if (a === 'save') { try { setUrl(box.querySelector('#gm-url').value); } catch (err) { note = err.message; return draw(); } open = false; set(SINCE_KEY, ''); return run(true); }
    });
    draw();
  }

  window.CVT = window.CVT || {};
  window.CVT.gmail = { parse, fits, pull, configured, setUrl, status, key, script, url, panel };
})();
