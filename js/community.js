/*
 * community.js — "Community and official resources" on the Pipeline page.
 * Tiles for OFFICIAL, professional sites only (vendor portals and professional bodies; no open forums),
 * picked from the technologies in your CV, skills and the adverts you are tracking.
 * Extras: pin favourites, add your own official link, certification shortcuts and a weekly
 * professional-visibility checklist. Everything stays in this browser; links open in a new tab.
 */
(function () {
  const S = () => window.CVT.store;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // id, group, title, what it is for, url, icon letters, colour
  const L = (id, title, sub, url, ic, col) => ({ id, title, sub, url, ic, col });
  const GROUPS = [
    { key: 'sap', name: 'SAP', match: /\bsap\b|s\/?4\s?hana|ariba|successfactors|concur|fieldglass|btp|abap|fiori|signavio|hana\b/i, links: [
      L('sap-community', 'SAP Community', 'Official SAP Q&A, blogs and expert answers', 'https://community.sap.com/', 'SC', '#0A6ED1'),
      L('sap-help', 'SAP Help Portal', 'Official product documentation for every SAP solution', 'https://help.sap.com/', 'H', '#0A6ED1'),
      L('sap-discovery', 'SAP Discovery Center', 'BTP services, missions and reference architectures', 'https://discovery-center.cloud.sap/', 'DC', '#0057D2'),
      L('sap-forme', 'SAP for Me', 'Your SAP account: products, support cases, licences', 'https://me.sap.com/', 'Me', '#1B90FF'),
      L('sap-learning', 'SAP Learning', 'Free learning journeys and official SAP certification', 'https://learning.sap.com/', 'L', '#188918'),
      L('sap-support', 'SAP Support Portal', 'SAP Notes, Knowledge Base and incidents', 'https://support.sap.com/', 'S', '#354A5F'),
      L('sap-roadmap', 'SAP Road Map Explorer', 'What is coming next in each SAP product', 'https://roadmaps.sap.com/', 'RM', '#5D36FF'),
      L('sap-api', 'SAP Business Accelerator Hub', 'Official APIs, integrations and content packages', 'https://api.sap.com/', 'API', '#0070F2'),
      L('sap-dev', 'SAP Developer Center', 'Tutorials, tools and missions for developers', 'https://developers.sap.com/', 'Dev', '#0040B0'),
      L('sap-events', 'SAP Events', 'Official SAP events, webinars and conferences', 'https://www.sap.com/events.html', 'Ev', '#E76500')
    ] },
    { key: 'ariba', name: 'SAP Ariba and Spend Management', match: /ariba|spend management|guided buying|source[- ]to[- ]pay|procure[- ]to[- ]pay|\bs2p\b|\bp2p\b|sourcing|procurement/i, links: [
      L('ariba-help', 'SAP Ariba documentation', 'Official SAP Ariba guides on SAP Help Portal', 'https://help.sap.com/docs/ariba', 'Ar', '#F0AB00'),
      L('spend-community', 'Spend Management community', 'SAP Community topic for Ariba, Concur and Fieldglass', 'https://community.sap.com/t5/spend-management/ct-p/spend-management', 'SM', '#E76500'),
      L('spend-product', 'SAP Spend Management', 'Official product pages for SAP Ariba and partners', 'https://www.sap.com/products/spend-management.html', 'SP', '#0A6ED1')
    ] },
    { key: 'pm', name: 'Project management', match: /\bpmp\b|project manag|prince2|pmi\b|scrum|agile/i, links: [
      L('pmi', 'PMI', 'Project Management Institute: PMP, PDUs and chapters', 'https://www.pmi.org/', 'PMI', '#1C3F94'),
      L('axelos', 'PeopleCert (PRINCE2, ITIL)', 'Official PRINCE2 and ITIL certification', 'https://www.peoplecert.org/', 'PC', '#00395D')
    ] },
    { key: 'arch', name: 'Enterprise architecture', match: /togaf|enterprise architect|solution architect|archimate/i, links: [
      L('opengroup', 'The Open Group', 'TOGAF standard and certification', 'https://www.opengroup.org/', 'OG', '#00558C')
    ] },
    { key: 'ba', name: 'Business analysis', match: /business analy|\bba\b|requirements|iiba|cbap/i, links: [
      L('iiba', 'IIBA', 'International Institute of Business Analysis (CBAP, ECBA)', 'https://www.iiba.org/', 'BA', '#0082C8'),
      L('bcs', 'BCS, The Chartered Institute for IT', 'UK professional body for IT and business analysis', 'https://www.bcs.org/', 'BCS', '#3C1053')
    ] },
    { key: 'proc', name: 'Procurement profession', match: /procure|purchas|sourcing|supply chain|buyer|category manag/i, links: [
      L('cips', 'CIPS', 'Chartered Institute of Procurement and Supply', 'https://www.cips.org/', 'CIPS', '#00843D')
    ] },
    { key: 'ms', name: 'Microsoft', match: /azure|microsoft|power bi|dynamics|sharepoint|\.net\b|office 365|m365/i, links: [
      L('mslearn', 'Microsoft Learn', 'Official Microsoft training, docs and certification', 'https://learn.microsoft.com/', 'MS', '#0078D4')
    ] },
    { key: 'aws', name: 'AWS', match: /\baws\b|amazon web services/i, links: [
      L('awsskill', 'AWS Skill Builder', 'Official AWS training and certification prep', 'https://skillbuilder.aws/', 'AWS', '#FF9900')
    ] },
    { key: 'gcp', name: 'Google Cloud', match: /google cloud|\bgcp\b|bigquery/i, links: [
      L('gcpskills', 'Google Cloud Skills Boost', 'Official Google Cloud learning', 'https://www.cloudskillsboost.google/', 'G', '#4285F4')
    ] },
    { key: 'sf', name: 'Salesforce', match: /salesforce/i, links: [
      L('trailhead', 'Trailhead', 'Official Salesforce learning and certification', 'https://trailhead.salesforce.com/', 'TH', '#00A1E0')
    ] },
    { key: 'pro', name: 'Your professional profile', match: /./, links: [
      L('linkedin', 'LinkedIn', 'Your professional profile, recruiters and company pages', 'https://www.linkedin.com/', 'in', '#0A66C2')
    ] }
  ];
  const ALL = GROUPS.flatMap(g => g.links.map(l => Object.assign({ group: g.key }, l)));

  const WEEKLY = [
    ['answer', 'Answer one question or comment on an expert post in an official community'],
    ['learn', 'Finish one free official learning module (SAP Learning, Microsoft Learn…)'],
    ['share', 'Share one useful update or article on LinkedIn'],
    ['follow', 'Follow two target companies and one product topic'],
    ['cert', 'Check your certification dates and renewal requirements']
  ];
  const weekKey = () => { const d = new Date(); const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return t.getUTCFullYear() + '-W' + Math.ceil(((t - y) / 864e5 + 1) / 7); };

  async function evidenceText() {
    const p = await S().getProfile();
    let t = [p.currentTitle, p.extraSkills, p.certifications, (p.targetRoles || []).join(' '), (p.experience || []).map(x => x.title + ' ' + x.desc).join(' ')].join(' ');
    try { const ev = window.CVT.jobs && window.CVT.jobs.evidence ? await window.CVT.jobs.evidence() : null; if (ev && ev.text) t += ' ' + ev.text; } catch (_) {}
    return { p, t };
  }

  function tile(l, pinned, inApps) {
    let host = ''; try { host = new URL(l.url).hostname.replace(/^www\./, ''); } catch (_) {}
    return `<a class="cm-tile" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" data-open="${esc(l.id)}">
      <span class="cm-ic" style="--c:${esc(l.col || '#4F46E5')}">${esc(l.ic || l.title.slice(0, 2))}</span>
      <span class="cm-txt"><strong>${esc(l.title)}</strong><span class="cm-sub">${esc(l.sub || '')}</span><span class="cm-host">${esc(host)} ↗</span></span>
      ${inApps ? `<span class="cm-badge" title="Mentioned in your tracked adverts">${inApps} job${inApps > 1 ? 's' : ''}</span>` : ''}
      <button class="cm-pin${pinned ? ' on' : ''}" type="button" data-pin="${esc(l.id)}" aria-label="${pinned ? 'Unpin' : 'Pin to top'}" title="${pinned ? 'Unpin' : 'Pin to top'}">${pinned ? '★' : '☆'}</button>
      ${l.own ? `<button class="cm-del" type="button" data-cmdel="${esc(l.id)}" aria-label="Remove this link" title="Remove">×</button>` : ''}
    </a>`;
  }

  async function render(host) {
    if (!host) return;
    const st = Object.assign({ pins: [], own: [], week: '', done: [], showAll: false }, (await S().getKV('community', null)) || {});
    if (st.week !== weekKey()) { st.week = weekKey(); st.done = []; }
    const save = () => S().setKV('community', st);
    const { p, t } = await evidenceText();
    const apps = await S().listApps();
    const jdAll = apps.map(a => (a.jd || '') + ' ' + (a.role || '')).join('\n');
    const relevant = GROUPS.filter(g => g.key === 'pro' || g.match.test(t) || g.match.test(jdAll));
    const shown = st.showAll ? GROUPS : relevant;
    const own = (st.own || []).map(o => Object.assign({ own: true, group: 'own', ic: '★', col: '#6D28D9' }, o));
    const byId = Object.fromEntries(ALL.concat(own).map(l => [l.id, l]));
    const appsWith = g => apps.filter(a => g.match.test((a.jd || '') + ' ' + (a.role || ''))).length;
    const pinned = st.pins.map(id => byId[id]).filter(Boolean);
    const certs = String(p.certifications || '').split('\n').map(s => s.trim()).filter(Boolean);
    const certLink = c => /sap/i.test(c) ? 'https://learning.sap.com/' : /pmp|pmi/i.test(c) ? 'https://www.pmi.org/' : /togaf/i.test(c) ? 'https://www.opengroup.org/' : /prince|itil/i.test(c) ? 'https://www.peoplecert.org/' : /cbap|iiba|ecba/i.test(c) ? 'https://www.iiba.org/' : /cips/i.test(c) ? 'https://www.cips.org/' : /azure|microsoft/i.test(c) ? 'https://learn.microsoft.com/' : /aws/i.test(c) ? 'https://skillbuilder.aws/' : '';
    const doneN = st.done.length;

    host.innerHTML = `
      <div class="panel-head"><div><h2>Community and official resources</h2>
        <p class="hint" style="margin:2px 0 0">Official, professional sites only, picked from the technologies in your CV and the adverts you are tracking. Links open in a new tab.</p></div>
        <label class="check-line small"><input type="checkbox" id="cm-all" ${st.showAll ? 'checked' : ''}> Show all technologies</label></div>
      <div class="cm-chips">${relevant.filter(g => g.key !== 'pro').map(g => `<span class="chip">${esc(g.name)}${appsWith(g) ? ` · ${appsWith(g)} job${appsWith(g) > 1 ? 's' : ''}` : ''}</span>`).join('') || '<span class="muted small">Add your CV to see the technologies that matter to you.</span>'}</div>
      ${pinned.length ? `<h3 class="cm-h">★ Pinned</h3><div class="cm-grid">${pinned.map(l => tile(l, true, 0)).join('')}</div>` : ''}
      ${shown.map(g => `<h3 class="cm-h">${esc(g.name)}${appsWith(g) && g.key !== 'pro' ? ` <span class="muted small">· in ${appsWith(g)} of your applications</span>` : ''}</h3>
        <div class="cm-grid">${g.links.filter(l => !st.pins.includes(l.id)).map(l => tile(l, false, 0)).join('')}</div>`).join('')}
      ${own.filter(l => !st.pins.includes(l.id)).length ? `<h3 class="cm-h">Your links</h3><div class="cm-grid">${own.filter(l => !st.pins.includes(l.id)).map(l => tile(l, false, 0)).join('')}</div>` : ''}
      <div class="cm-cols">
        <div class="cm-box">
          <h3 class="cm-h" style="margin-top:0">This week's professional visibility <span class="muted small">${doneN}/${WEEKLY.length}</span></h3>
          <div class="cm-prog"><i style="width:${Math.round(doneN / WEEKLY.length * 100)}%"></i></div>
          ${WEEKLY.map(([k, txt]) => `<label class="check-line"><input type="checkbox" data-wk="${k}" ${st.done.includes(k) ? 'checked' : ''}> ${esc(txt)}</label>`).join('')}
          <p class="muted small">Resets every Monday. Recruiters often check community activity and LinkedIn before calling.</p>
        </div>
        <div class="cm-box">
          <h3 class="cm-h" style="margin-top:0">Your certifications</h3>
          ${certs.length ? `<ul class="cm-certs">${certs.map(c => { const u = certLink(c); return `<li><span>${esc(c)}</span>${u ? `<a class="btn ghost small" href="${u}" target="_blank" rel="noopener noreferrer">Official site ↗</a>` : ''}</li>`; }).join('')}</ul>`
            : '<p class="muted small">Add your certifications in Career profile to get quick links to the official sites for renewals and badges.</p>'}
          <h3 class="cm-h">Add an official link</h3>
          <form class="cm-add" id="cm-add"><input id="cm-title" placeholder="Name (e.g. UK user group)" required><input id="cm-url" type="url" placeholder="https://…" required><button class="btn primary small" type="submit">Add</button></form>
          <p class="muted small">Only https links are saved.</p>
        </div>
      </div>`;

    host.onclick = async e => {
      const pin = e.target.closest('[data-pin]'), del = e.target.closest('[data-cmdel]');
      if (pin) { e.preventDefault(); const id = pin.dataset.pin; st.pins = st.pins.includes(id) ? st.pins.filter(x => x !== id) : [id].concat(st.pins); await save(); return render(host); }
      if (del) { e.preventDefault(); const id = del.dataset.cmdel; st.own = st.own.filter(x => x.id !== id); st.pins = st.pins.filter(x => x !== id); await save(); return render(host); }
    };
    host.onchange = async e => {
      if (e.target.id === 'cm-all') { st.showAll = e.target.checked; await save(); return render(host); }
      const k = e.target.dataset.wk; if (!k) return;
      st.done = e.target.checked ? [...new Set(st.done.concat(k))] : st.done.filter(x => x !== k); await save(); render(host);
    };
    const form = host.querySelector('#cm-add');
    form.onsubmit = async e => {
      e.preventDefault();
      const title = host.querySelector('#cm-title').value.trim(), url = host.querySelector('#cm-url').value.trim();
      if (!/^https:\/\//i.test(url) || !title) { window.CVT.ui.toast('Please enter a name and an https:// link'); return; }
      st.own = (st.own || []).concat({ id: 'own-' + Date.now().toString(36), title: title.slice(0, 60), sub: 'Your link', url });
      await save(); render(host);
    };
  }

  window.CVT = window.CVT || {};
  window.CVT.community = { render, GROUPS };
})();
