/*
 * welcome.js — first-run setup in three short steps:
 *   1. what work you want (field + job titles)   2. where (country, city, remote)   3. your CV (or a demo)
 * Then it opens Jobs for you and starts the first search. Can be skipped, and reopened from Help.
 */
(function () {
  const { html, raw, toast } = window.CVT.ui;
  const S = window.CVT.store, D = window.CVT.docx;
  const FL = () => window.CVT.fields, CO = () => window.CVT.countries;

  async function needed() {
    if (S.local.get('cvt.welcomeDone', '')) return false;
    const [p, masters] = await Promise.all([S.getProfile(), S.listMasters()]);
    return !(p.targetRoles || []).length && !masters.length;
  }

  async function open(force) {
    if (!force && !(await needed())) return false;
    if (document.querySelector('.welcome')) return true;
    const p = await S.getProfile();
    const st = { step: 0, field: p.field && FL().list[p.field] ? p.field : '', roles: (p.targetRoles || []).join('\n'), country: CO().current(),
      city: '', remote: true, cv: null, cvName: '' };
    const wrap = document.createElement('div');
    wrap.className = 'welcome'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-labelledby', 'wl-title');
    document.body.appendChild(wrap); document.body.classList.add('no-scroll');
    const close = () => { wrap.remove(); document.body.classList.remove('no-scroll'); document.removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape') skip(); };
    document.addEventListener('keydown', key);
    const skip = () => { S.local.set('cvt.welcomeDone', '1'); close(); window.CVT.shell && window.CVT.shell.tour(false); };

    function draw() {
      const f = FL().get(st.field || 'any');
      const steps = ['Your work', 'Where', 'Your CV'];
      wrap.innerHTML = String(html`<div class="wl-card">
        <div class="wl-top"><span class="brand-mark sm" aria-hidden="true">Aw</span><strong>Welcome to Applywise</strong><span class="grow-s"></span><button class="linkish" type="button" data-w="skip">Skip setup</button></div>
        ${st.step === 0 ? raw(`<div class="wl-art">${window.CVT.art ? window.CVT.art.scene('welcome') : ''}</div>`) : ''}
        <ol class="wl-steps" aria-label="Setup progress">${steps.map((s, i) => html`<li class="${i === st.step ? 'on' : i < st.step ? 'done' : ''}">${s}</li>`)}</ol>
        ${st.step === 0 ? html`
          <h2 id="wl-title">What kind of work are you looking for?</h2>
          <p class="hint">Pick your field so jobs, skills and interview practice fit you.</p>
          <div class="wl-fields" role="radiogroup" aria-label="Your field">${Object.values(FL().list).map(x => html`<button type="button" role="radio" aria-checked="${st.field === x.id ? 'true' : 'false'}" class="wl-chip ${st.field === x.id ? 'on' : ''}" data-field="${x.id}">${x.short}</button>`)}</div>
          <label class="field mt"><span>Job titles you want (one per line)</span><textarea id="wl-roles" rows="3" placeholder="${f.example}">${st.roles}</textarea></label>
          ${f.titles.length ? html`<p class="muted small">Ideas: ${f.titles.slice(0, 5).map(t => html`<button type="button" class="linkish" data-add="${t}">${t}</button>`)}</p>` : ''}` : ''}
        ${st.step === 1 ? html`
          <h2 id="wl-title">Where do you want to work?</h2>
          <p class="hint">Jobs come from your country, plus remote roles open to it.</p>
          <label class="field"><span>Country</span><select id="wl-country">${Object.entries(CO().list).map(([k, c]) => html`<option value="${k}" ${st.country === k ? raw('selected') : ''}>${c.flag} ${c.name}</option>`)}</select></label>
          <label class="field"><span>Town or city (optional)</span><input id="wl-city" type="text" value="${st.city}" placeholder="Leave blank for the whole country" autocomplete="address-level2"></label>
          <label class="check-line"><input id="wl-remote" type="checkbox" ${st.remote ? raw('checked') : ''}> Include remote jobs</label>` : ''}
        ${st.step === 2 ? html`
          <h2 id="wl-title">Add your CV</h2>
          <p class="hint">A Word (.docx) CV lets Applywise score jobs against your real skills and tailor it for each application. It stays on this device.</p>
          <label class="drop wl-drop"><input type="file" id="wl-file" accept=".docx"><span class="drop-title">${st.cvName ? '✓ ' + st.cvName : 'Choose your CV (.docx)'}</span><span class="drop-sub">Word .docx only</span></label>
          <p class="row gap wrap small mt"><button class="btn ghost small" type="button" data-w="demo">Use a demo CV instead</button><span class="muted">You can add yours later in Career profile.</span></p>` : ''}
        <p class="error" id="wl-err" hidden></p>
        <div class="wl-acts">${st.step ? html`<button class="btn ghost" type="button" data-w="back">Back</button>` : ''}<span class="grow-s"></span>
          <button class="btn primary" type="button" data-w="next">${st.step === 2 ? (st.cv ? 'Find my jobs' : 'Skip CV and find jobs') : 'Continue'}</button></div>
      </div>`);
      const first = wrap.querySelector('.wl-chip.on, .wl-chip, select, input, textarea'); if (first) first.focus({ preventScroll: true });
    }
    const err = t => { const e = wrap.querySelector('#wl-err'); e.textContent = t; e.hidden = !t; };
    const read = () => {
      const r = wrap.querySelector('#wl-roles'); if (r) st.roles = r.value;
      const c = wrap.querySelector('#wl-country'); if (c) st.country = c.value;
      const ci = wrap.querySelector('#wl-city'); if (ci) st.city = ci.value.trim();
      const rm = wrap.querySelector('#wl-remote'); if (rm) st.remote = rm.checked;
    };

    wrap.addEventListener('click', async e => {
      const fb = e.target.closest('[data-field]');
      if (fb) { read(); st.field = fb.dataset.field; draw(); return; }
      const add = e.target.closest('[data-add]');
      if (add) { read(); const list = st.roles.split('\n').map(x => x.trim()).filter(Boolean); if (!list.includes(add.dataset.add)) list.push(add.dataset.add); st.roles = list.join('\n'); draw(); return; }
      const b = e.target.closest('[data-w]'); if (!b) return;
      read();
      if (b.dataset.w === 'skip') return skip();
      if (b.dataset.w === 'back') { st.step--; return draw(); }
      if (b.dataset.w === 'demo') {
        try { st.cv = await window.CVT.demoCv(st.field === 'it' ? 'it' : 'any'); st.cvName = 'Demo CV (fictional)'; draw(); } catch (x) { err(x.message); }
        return;
      }
      if (b.dataset.w === 'next') {
        if (st.step === 0) {
          const roles = st.roles.split('\n').map(x => x.trim()).filter(Boolean);
          if (!st.field && !roles.length) return err('Pick your field or type at least one job title.');
          st.step = 1; return draw();
        }
        if (st.step === 1) { st.step = 2; return draw(); }
        b.disabled = true; b.textContent = 'Setting up…';
        try { await finish(); } catch (x) { b.disabled = false; err(x.message); }
      }
    });
    wrap.addEventListener('change', async e => {
      if (e.target.id !== 'wl-file') return;
      const file = e.target.files[0];
      if (!file || !/\.docx$/i.test(file.name)) return err('Please choose a Word .docx file. You can save a PDF or Google Doc as .docx first.');
      try { const buf = await file.arrayBuffer(); await D.load(buf.slice(0)); st.cv = buf; st.cvName = file.name; err(''); draw(); }
      catch (x) { err('That file could not be read as a Word CV: ' + x.message); }
    });

    async function finish() {
      const p = await S.getProfile();
      const roles = st.roles.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 6);
      const field = st.field || FL().infer({ targetRoles: roles });
      const c = CO().get(st.country);
      Object.assign(p, { field, targetRoles: roles.length ? roles : FL().get(field).titles.slice(0, 3), targetLocations: [st.city || c.name], country: c.name });
      await S.saveProfile(p); FL().use(p);
      CO().remember(st.country);
      if (st.cv) await S.addMaster(st.cvName.replace(/\.docx$/i, ''), /\.docx$/i.test(st.cvName) ? st.cvName : 'demo-cv.docx', st.cv);
      const feed = await S.getKV('feed', { items: {} });
      feed.searches = null;
      await S.setKV('feed', feed);
      window.CVT.jobs.resetEvidence();
      S.local.set('cvt.welcomeDone', '1'); S.local.set('cvt.tourDone', '1');
      close();
      toast(`You're set up. Finding ${field === 'any' ? '' : FL().get(field).short + ' '}jobs in ${c.name}…`);
      window.CVT._autoFind = true;
      window.CVT.app.go('#/jobs');
    }
    draw();
    return true;
  }

  window.CVT = window.CVT || {};
  window.CVT.welcome = { open, needed };
})();
