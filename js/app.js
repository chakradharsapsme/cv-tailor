/* app.js — UI for CV Tailor. Everything is stored in this browser only. */
(function () {
  const { docx: D, agent: A } = window.CVT;
  const $ = s => document.querySelector(s);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(k));
    return n;
  };

  // ---------- storage (always wrapped: private windows can throw) ----------
  const store = {
    get(k, fallback = null) {
      try { const v = localStorage.getItem(k) ?? sessionStorage.getItem(k); return v == null ? fallback : JSON.parse(v); }
      catch (_) { return fallback; }
    },
    set(k, v, session = false) {
      try { (session ? sessionStorage : localStorage).setItem(k, JSON.stringify(v)); return true; }
      catch (_) { return false; }
    },
    del(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (_) {} }
  };

  const S = {
    key: store.get('cvt.key', ''),
    model: store.get('cvt.model', ''),
    master: null,          // { name, buf: ArrayBuffer, model }
    result: null,          // agent output
    decisions: new Map(),  // change key -> { on, text? }
    tailoredBlob: null,
    tailoredText: '',
    letterMeta: null,
    abort: null
  };

  // ---------- helpers ----------
  const b64 = {
    from(buf) { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); },
    to(str) { const bin = atob(str); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b.buffer; }
  };
  const today = () => new Date().toISOString().slice(0, 10);
  const ukDate = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const slug = s => (s || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Role';
  const fileBase = () => `${slug($('#jd-company').value || (S.result && S.result.job.company))}_${slug($('#jd-role').value || (S.result && S.result.job.title))}`;

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // ---------- tabs ----------
  function show(view) {
    document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.view === view)));
    document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== 'view-' + view; });
    if (view === 'apps') renderApps();
  }
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => show(t.dataset.view)));

  // ---------- API key + models ----------
  function refreshKeyPill() {
    const pill = $('#key-pill');
    const ready = !!S.key;
    pill.dataset.state = ready ? 'ready' : 'missing';
    pill.textContent = ready ? (S.model ? S.model.replace(/^claude-/, '') : 'Key saved') : 'No API key';
  }
  async function loadModels() {
    const sel = $('#model');
    try {
      const models = await A.listModels(S.key);
      sel.innerHTML = '';
      models.forEach(m => sel.append(el('option', { value: m.id, text: m.name + '  ·  ' + m.id })));
      if (!S.model || !models.some(m => m.id === S.model)) {
        const pick = models.find(m => /sonnet/i.test(m.id)) || models.find(m => /opus/i.test(m.id)) || models[0];
        S.model = pick ? pick.id : '';
        store.set('cvt.model', S.model);
      }
      sel.value = S.model;
      $('#key-status').textContent = `Connected. ${models.length} models available.`;
      refreshKeyPill();
      return true;
    } catch (e) {
      $('#key-status').textContent = e.message;
      return false;
    }
  }
  $('#api-key').value = S.key;
  $('#save-key').addEventListener('click', async () => {
    S.key = $('#api-key').value.trim();
    store.del('cvt.key');
    if (S.key) store.set('cvt.key', S.key, !$('#remember-key').checked);
    $('#key-status').textContent = S.key ? 'Checking…' : 'Key removed.';
    refreshKeyPill();
    if (S.key) await loadModels();
  });
  $('#model').addEventListener('change', e => { S.model = e.target.value; store.set('cvt.model', S.model); refreshKeyPill(); });
  $('#clear-data').addEventListener('click', () => {
    const btn = $('#clear-data');
    if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = 'Click again to clear everything'; return; }
    ['cvt.key', 'cvt.model', 'cvt.master', 'cvt.apps', 'cvt.draft'].forEach(store.del);
    btn.dataset.armed = ''; btn.textContent = 'Clear all stored data';
    $('#clear-status').textContent = 'Cleared. Reloading…';
    setTimeout(() => location.reload(), 600);
  });
  refreshKeyPill();
  if (S.key) loadModels();

  // ---------- master CV ----------
  async function setMaster(name, buf, persist = true) {
    const model = await D.load(buf.slice(0));
    S.master = { name, buf, model };
    const withText = model.paras.filter(p => p.text.trim());
    $('#cv-name').textContent = name;
    $('#cv-paras').textContent = withText.length;
    $('#cv-editable').textContent = withText.filter(p => !p.locked).length;
    $('#cv-locked').textContent = withText.filter(p => p.locked).length;
    $('#cv-summary').hidden = false;
    $('#cv-drop').querySelector('.drop-title').textContent = 'Replace the master CV';
    $('#step-cv').classList.add('done');
    $('#cv-preview').hidden = true;
    if (persist && !store.set('cvt.master', { name, data: b64.from(buf) })) {
      $('#cv-name').textContent = name + ' (not saved: browser storage is full or blocked)';
    }
  }
  async function readFile(file) {
    if (!/\.docx$/i.test(file.name)) { showError('Please choose a Word .docx file.'); return; }
    try { await setMaster(file.name, await file.arrayBuffer()); hideError(); }
    catch (e) { showError(e.message); }
  }
  $('#cv-file').addEventListener('change', e => e.target.files[0] && readFile(e.target.files[0]));
  const drop = $('#cv-drop');
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => e.dataTransfer.files[0] && readFile(e.dataTransfer.files[0]));
  async function renderPreview(target, bufOrBlob) {
    target.innerHTML = '';
    if (!window.docx || !window.docx.renderAsync) { target.append(el('p', { class: 'hint', text: 'Preview unavailable.' })); return 0; }
    await window.docx.renderAsync(bufOrBlob, target, null, { inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true, experimental: true });
    return target.querySelectorAll('section.docx').length;
  }
  $('#cv-preview-btn').addEventListener('click', async () => {
    const box = $('#cv-preview');
    box.hidden = !box.hidden;
    if (!box.hidden && S.master) await renderPreview(box, S.master.buf.slice(0));
  });
  (async () => {
    const saved = store.get('cvt.master');
    if (saved && saved.data) { try { await setMaster(saved.name, b64.to(saved.data), false); } catch (_) {} }
  })();

  // ---------- draft JD persistence ----------
  const draftFields = ['#jd-company', '#jd-role', '#jd-url', '#jd-manager', '#jd-text', '#jd-notes', '#jd-tone', '#jd-mode'];
  const draft = store.get('cvt.draft', {});
  draftFields.forEach(f => { if (draft[f] != null) $(f).value = draft[f]; $(f).addEventListener('input', saveDraft); });
  function saveDraft() { const d = {}; draftFields.forEach(f => d[f] = $(f).value); store.set('cvt.draft', d); }

  $('#example-jd').addEventListener('click', () => {
    $('#jd-company').value = 'Example: Northgate Energy (fictional)';
    $('#jd-role').value = 'SAP Ariba Solution Architect';
    $('#jd-url').value = '';
    $('#jd-text').value = EXAMPLE_JD;
    saveDraft();
  });

  // ---------- run the agent ----------
  const progress = $('#progress');
  function steps(labels) {
    progress.innerHTML = ''; progress.hidden = false;
    const items = labels.map(l => el('li', { text: l }));
    progress.append(...items);
    return {
      at(i) { items.forEach((li, j) => { li.className = j < i ? 'done' : j === i ? 'active' : ''; }); },
      done() { items.forEach(li => li.className = 'done'); },
      fail(i) { items[i] && (items[i].className = 'fail'); }
    };
  }
  function showError(msg) { const e = $('#run-error'); e.textContent = msg; e.hidden = false; }
  function hideError() { $('#run-error').hidden = true; }

  $('#run').addEventListener('click', async () => {
    hideError();
    if (!S.master) return showError('Add your master CV first (step 1).');
    const jd = $('#jd-text').value.trim();
    if (jd.length < 200) return showError('Paste the full job description (at least a few paragraphs).');
    if (!S.key || !S.model) { show('settings'); $('#key-status').textContent = 'Add your API key to run the agent.'; return; }

    const st = steps(['Reading your CV', 'Analysing the job and planning changes', 'Checking every change against your CV']);
    const runBtn = $('#run'), stopBtn = $('#stop');
    runBtn.disabled = true; stopBtn.hidden = false;
    S.abort = new AbortController();
    let i = 0;
    try {
      st.at(0);
      const paras = D.forModel(S.master.model);
      st.at(i = 1);
      const out = await A.tailor({
        key: S.key, model: S.model, signal: S.abort.signal, jd,
        notes: $('#jd-notes').value.trim(), company: $('#jd-company').value.trim(), role: $('#jd-role').value.trim(), paras
      });
      st.at(i = 2);
      S.result = out;
      prepareDecisions();
      renderReview();
      st.done();
      $('#step-jd').classList.add('done');
      $('#step-review').hidden = false;
      $('#step-out').hidden = true;
      if ($('#jd-mode').value === 'auto') await buildAll();
      else $('#step-review').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      st.fail(i);
      showError(e.name === 'AbortError' ? 'Stopped.' : e.message);
    } finally {
      runBtn.disabled = false; stopBtn.hidden = true;
    }
  });
  $('#stop').addEventListener('click', () => S.abort && S.abort.abort());

  // ---------- review ----------
  const paraById = id => S.master.model.paras.find(p => p.id === id);
  const masterText = () => S.master.model.paras.map(p => p.text).join('\n');

  function termsOf(text) {
    const out = new Set();
    (text.match(/\b\d[\d,.]*\s*(?:%|k|m|bn|\+)?/gi) || []).forEach(n => out.add(n.replace(/[\s,]/g, '').toLowerCase()));
    (text.match(/\b(?:[A-Z]{2,}[A-Za-z0-9/&+-]*|[A-Z][a-z]+[A-Z][A-Za-z]*|S\/4\w*)\b/g) || []).forEach(t => out.add(t.toLowerCase()));
    return out;
  }
  function flagsFor(oldText, newText) {
    const flags = [];
    const master = termsOf(masterText() + '\n' + $('#jd-notes').value);
    const jd = termsOf($('#jd-text').value);
    const oldT = termsOf(oldText);
    for (const t of termsOf(newText)) {
      if (oldT.has(t) || master.has(t)) continue;
      if (/^\d/.test(t)) flags.push({ cls: 'bad', text: `New number “${t}” is not in your CV` });
      else if (jd.has(t)) flags.push({ cls: 'warn', text: `“${t}” comes from the job ad. Only keep it if it's true` });
      else flags.push({ cls: 'warn', text: `“${t}” is not in your CV` });
    }
    if (newText.length > oldText.length * 1.1 + 15) flags.push({ cls: 'warn', text: `Longer than the original (${oldText.length} → ${newText.length} chars)` });
    return flags;
  }

  function editText(e, p) {
    if (Array.isArray(e.segments)) return e.segments.join('');
    return typeof e.text === 'string' ? e.text : p.text;
  }

  function prepareDecisions() {
    S.decisions = new Map();
    const r = S.result;
    r.edits = r.edits.filter(e => { const p = paraById(e.id); return p && !p.locked && editText(e, p) !== p.text; });
    r.remove = r.remove.filter(x => { const p = paraById(x.id); return p && D.canRemove(p); });
    r.edits.forEach(e => S.decisions.set('e' + e.id, { on: true, text: editText(e, paraById(e.id)) }));
    r.reorder.forEach((x, i) => S.decisions.set('o' + i, { on: true }));
    r.remove.forEach(x => S.decisions.set('r' + x.id, { on: true }));
  }

  function wordDiff(a, b) {
    const A1 = a.split(/(\s+)/), B1 = b.split(/(\s+)/);
    const n = A1.length, m = B1.length;
    if (n * m > 250000) return [{ t: 'del', s: a }, { t: 'ins', s: b }];
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A1[i] === B1[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = []; let i = 0, j = 0;
    const push = (t, s) => { const l = out[out.length - 1]; if (l && l.t === t) l.s += s; else out.push({ t, s }); };
    while (i < n && j < m) {
      if (A1[i] === B1[j]) { push('eq', A1[i]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) push('del', A1[i++]);
      else push('ins', B1[j++]);
    }
    while (i < n) push('del', A1[i++]);
    while (j < m) push('ins', B1[j++]);
    return out;
  }
  function diffNode(a, b) {
    const d = el('div', { class: 'diff' });
    for (const part of wordDiff(a, b)) d.append(part.t === 'eq' ? document.createTextNode(part.s) : el(part.t, { text: part.s }));
    return d;
  }

  function gauge(score) {
    const s = Math.max(0, Math.min(100, Number(score) || 0));
    const r = 46, c = 2 * Math.PI * r;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 110 110'); svg.setAttribute('class', 'gauge'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Fit score ${s} out of 100`);
    svg.innerHTML = `<circle cx="55" cy="55" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="9"/>
      <circle cx="55" cy="55" r="${r}" fill="none" stroke="${s >= 70 ? 'var(--ok)' : s >= 50 ? 'var(--warn)' : 'var(--bad)'}" stroke-width="9"
        stroke-linecap="round" stroke-dasharray="${(c * s / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 55 55)"/>
      <text x="55" y="61" text-anchor="middle" class="num" fill="var(--ink)">${s}</text>
      <text x="55" y="78" text-anchor="middle" font-size="9" fill="var(--muted)">FIT</text>`;
    return svg;
  }

  function renderReview() {
    const r = S.result;
    const fit = $('#fit'); fit.innerHTML = '';
    const bar = (label, v) => el('div', { class: 'fit-bar' },
      el('span', { text: label }), el('div', { class: 'track' }, el('div', { class: 'fill', style: `width:${Math.max(0, Math.min(100, Number(v) || 0))}%` })),
      el('span', { class: 'v', text: String(Math.round(Number(v) || 0)) }));
    const job = r.job || {};
    fit.append(gauge(r.fit.score), el('div', { class: 'fit-bars' },
      el('p', { class: 'verdict', text: r.fit.verdict || '' }),
      el('p', { class: 'job-line', text: [job.title, job.company, job.location, job.contract_type].filter(Boolean).join(' · ') }),
      bar('Core skills', r.fit.core), bar('Adjacent', r.fit.adjacent)));
    if (!$('#jd-company').value && job.company) $('#jd-company').value = job.company;
    if (!$('#jd-role').value && job.title) $('#jd-role').value = job.title;

    const reqs = $('#reqs'); reqs.innerHTML = '';
    reqs.append(el('thead', {}, el('tr', {}, el('th', { text: 'Requirement' }), el('th', { text: 'Type' }), el('th', { text: 'Your evidence' }))));
    const tb = el('tbody');
    const order = { gap: 0, adjacent: 1, direct: 2 };
    r.requirements.slice().sort((a, b) => (a.type === 'must' ? 0 : 1) - (b.type === 'must' ? 0 : 1) || (order[a.evidence] ?? 3) - (order[b.evidence] ?? 3))
      .forEach(q => tb.append(el('tr', {},
        el('td', {}, el('div', { text: q.req || '' }), q.note ? el('div', { class: 'muted small', text: q.note }) : null),
        el('td', {}, el('span', { class: 'chip ' + (q.type === 'must' ? 'must' : 'nice'), text: q.type === 'must' ? 'must' : 'nice' })),
        el('td', {}, el('span', { class: 'chip ' + (q.evidence || 'gap'), text: q.evidence || 'gap' })))));
    reqs.append(tb);

    const kw = $('#keywords'); kw.innerHTML = '';
    (r.keywords.covered || []).forEach(k => kw.append(el('span', { class: 'chip ok', text: k })));
    (r.keywords.missing || []).forEach(k => kw.append(el('span', { class: 'chip bad', text: k })));
    if (!kw.children.length) kw.append(el('span', { class: 'muted small', text: 'None reported.' }));

    const talk = $('#talking'); talk.innerHTML = '';
    r.talking_points.forEach(t => talk.append(el('li', { text: t })));

    renderEdits();
  }

  function renderEdits() {
    const r = S.result, box = $('#edits'); box.innerHTML = '';
    const total = r.edits.length + r.reorder.length + r.remove.length;
    $('#edits-count').textContent = `· ${total}`;
    if (!total) box.append(el('p', { class: 'hint', text: 'No changes proposed. Your CV already fits this role well.' }));

    const card = (key, kind, p, body, reason, flags = []) => {
      const d = S.decisions.get(key);
      const cb = el('input', { type: 'checkbox', id: 'cb-' + key, 'aria-label': 'Include this change' });
      cb.checked = d.on;
      const wrap = el('div', { class: 'edit' + (d.on ? '' : ' off') }, cb,
        el('div', { class: 'edit-main' },
          el('div', { class: 'edit-meta' }, el('span', { class: 'kind', text: kind }), p ? el('span', { text: `¶${p.id}${p.style ? ' · ' + p.style : ''}${p.isList ? ' · bullet' : ''}` }) : null),
          body,
          reason ? el('p', { class: 'reason', text: reason }) : null,
          flags.length ? el('div', { class: 'flags' }, flags.map(f => el('span', { class: 'chip ' + f.cls, text: f.text }))) : null));
      cb.addEventListener('change', () => { d.on = cb.checked; wrap.classList.toggle('off', !d.on); });
      return wrap;
    };

    r.edits.forEach(e => {
      const p = paraById(e.id), key = 'e' + e.id, d = S.decisions.get(key);
      const view = el('div');
      const draw = () => {
        view.innerHTML = '';
        view.append(diffNode(p.text, d.text));
        const fl = flagsFor(p.text, d.text);
        const main = view.closest('.edit-main');
        if (!main) return;
        const old = main.querySelector('.flags');
        if (old) old.remove();
        if (fl.length) main.append(el('div', { class: 'flags' }, fl.map(f => el('span', { class: 'chip ' + f.cls, text: f.text }))));
      };
      view.append(diffNode(p.text, d.text));
      const editBtn = el('button', { class: 'linkish', type: 'button', text: 'Edit wording' });
      const c = card(key, 'rewrite', p, el('div', {}, view, editBtn), e.reason, flagsFor(p.text, d.text));
      editBtn.addEventListener('click', () => {
        const ta = el('textarea', { rows: '3', id: 'ta-' + key });
        ta.value = d.text;
        ta.addEventListener('input', () => { d.text = ta.value; d.manual = true; });
        const done = el('button', { class: 'btn ghost small', type: 'button', text: 'Done' });
        done.addEventListener('click', () => { ta.remove(); done.remove(); editBtn.hidden = false; draw(); });
        editBtn.hidden = true; editBtn.after(ta, done); ta.focus();
      });
      box.append(c);
    });
    r.reorder.forEach((o, i) => {
      const ids = (o.ids || []).filter(id => paraById(id));
      const list = el('ol', { class: 'talk' }, ids.map(id => el('li', { text: paraById(id).text })));
      box.append(card('o' + i, 'reorder', null, list, o.reason));
    });
    r.remove.forEach(x => {
      const p = paraById(x.id);
      box.append(card('r' + x.id, 'remove', p, el('div', { class: 'diff' }, el('del', { text: p.text })), x.reason));
    });
  }
  const setAll = on => { S.decisions.forEach(d => d.on = on); renderEdits(); };
  $('#accept-all').addEventListener('click', () => setAll(true));
  $('#reject-all').addEventListener('click', () => setAll(false));

  // ---------- build documents ----------
  function plan() {
    const r = S.result;
    const edits = [];
    r.edits.forEach(e => {
      const d = S.decisions.get('e' + e.id);
      if (!d || !d.on) return;
      const p = paraById(e.id);
      if (!d.manual && Array.isArray(e.segments) && e.segments.length === p.segments.length) edits.push({ id: e.id, segments: e.segments });
      else edits.push({ id: e.id, text: d.text });
    });
    const reorder = r.reorder.filter((o, i) => S.decisions.get('o' + i).on).map(o => o.ids);
    const remove = r.remove.filter(x => S.decisions.get('r' + x.id).on).map(x => x.id);
    return { edits, reorder, remove };
  }

  async function buildAll() {
    hideError();
    const st = steps(['Writing changes into your Word template', 'Writing the cover letter']);
    const btn = $('#build'); btn.disabled = true;
    let i = 0;
    try {
      st.at(0);
      const pl = plan();
      const { blob, applied, skipped } = await D.buildTailored(S.master.buf.slice(0), pl);
      S.tailoredBlob = blob;
      const tModel = await D.load(await blob.arrayBuffer());
      S.tailoredText = tModel.paras.map(p => p.text).filter(t => t.trim()).join('\n');
      $('#cv-result-note').textContent = `${applied} change${applied === 1 ? '' : 's'} applied` + (skipped.length ? `, ${skipped.length} skipped` : '');
      $('#pages-note').textContent = '';
      $('#compare').hidden = true;
      $('#step-out').hidden = false;
      $('#step-review').classList.add('done');
      st.at(i = 1);
      await writeLetter();
      st.done();
      $('#step-out').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      st.fail(i); showError(e.message);
      if (S.tailoredBlob) $('#step-out').hidden = false;
    } finally { btn.disabled = false; }
  }
  $('#build').addEventListener('click', buildAll);

  async function writeLetter() {
    const r = S.result;
    const name = r.candidate_name || '';
    const L = await A.coverLetter({
      key: S.key, model: S.model, jd: $('#jd-text').value, notes: $('#jd-notes').value.trim(),
      company: $('#jd-company').value.trim(), role: $('#jd-role').value.trim(), job: r.job || {},
      requirements: r.requirements, cvText: S.tailoredText, tone: $('#jd-tone').value, name,
      hiringManager: $('#jd-manager').value.trim()
    });
    const role = $('#jd-role').value.trim() || (r.job && r.job.title) || '';
    const company = $('#jd-company').value.trim() || (r.job && r.job.company) || '';
    const lines = [ukDate(), '', `**Re: ${role}${company ? ', ' + company : ''}**`, '', L.salutation || 'Dear Hiring Manager,', ''];
    L.paragraphs.forEach(p => lines.push(p, ''));
    lines.push(L.signoff || 'Kind regards,', '', L.name || name);
    $('#letter').value = lines.join('\n');
    S.letterMeta = { letterheadIds: r.letterhead_ids || [] };
    updateWords();
  }
  $('#regen-letter').addEventListener('click', async () => {
    const b = $('#regen-letter'); b.disabled = true; b.textContent = 'Writing…';
    try { await writeLetter(); } catch (e) { showError(e.message); }
    finally { b.disabled = false; b.textContent = 'Write again'; }
  });
  function updateWords() {
    const body = $('#letter').value.split('\n').slice(5).join(' ');
    const n = (body.match(/\S+/g) || []).length;
    $('#letter-words').textContent = `${n} words`;
  }
  $('#letter').addEventListener('input', updateWords);

  function letterBlocks() {
    const blocks = [];
    const raw = $('#letter').value.replace(/\r/g, '').split(/\n\s*\n/);
    raw.forEach((chunk, ci) => {
      chunk.split('\n').filter(l => l.trim()).forEach(line => {
        const m = line.trim().match(/^\*\*(.+)\*\*$/);
        blocks.push(m ? { text: m[1], bold: true } : { text: line.trim() });
      });
      if (ci < raw.length - 1) blocks.push({ text: '' });
    });
    return blocks;
  }

  $('#dl-cv').addEventListener('click', () => S.tailoredBlob && download(S.tailoredBlob, `${fileBase()}_CV_${today().replace(/-/g, '')}.docx`));
  $('#dl-letter').addEventListener('click', async () => {
    try {
      const blob = await D.buildLetter(S.master.buf.slice(0), { letterheadIds: (S.letterMeta && S.letterMeta.letterheadIds) || [], blocks: letterBlocks() });
      download(blob, `${fileBase()}_CoverLetter_${today().replace(/-/g, '')}.docx`);
    } catch (e) { showError(e.message); }
  });
  $('#copy-letter').addEventListener('click', async () => {
    const txt = $('#letter').value.replace(/^\*\*(.+)\*\*$/gm, '$1');
    const b = $('#copy-letter');
    try { await navigator.clipboard.writeText(txt); b.textContent = 'Copied'; }
    catch (_) { $('#letter').select(); b.textContent = 'Press Ctrl+C'; }
    setTimeout(() => b.textContent = 'Copy text', 1800);
  });
  $('#compare-btn').addEventListener('click', async () => {
    const c = $('#compare');
    c.hidden = !c.hidden;
    if (c.hidden) return;
    const a = await renderPreview($('#cmp-master'), S.master.buf.slice(0));
    const b = await renderPreview($('#cmp-tailored'), S.tailoredBlob);
    $('#pages-note').textContent = a && b
      ? (a === b ? `Page count unchanged in preview (${a}). Open in Word to confirm.` : `Preview shows ${a} → ${b} pages. Consider rejecting a longer rewrite, then confirm in Word.`)
      : '';
  });

  // ---------- applications tracker ----------
  const STATUSES = ['Tailored', 'Applied', 'Recruiter call', 'Interview', 'Offer', 'Rejected', 'Withdrawn'];
  const apps = () => store.get('cvt.apps', []);
  const saveApps = list => { store.set('cvt.apps', list); $('#apps-count').textContent = list.length; };
  $('#apps-count').textContent = apps().length;

  $('#save-app').addEventListener('click', () => {
    const r = S.result || {};
    const list = apps();
    list.unshift({
      id: Date.now().toString(36), date: today(),
      company: $('#jd-company').value.trim() || (r.job && r.job.company) || '',
      role: $('#jd-role').value.trim() || (r.job && r.job.title) || '',
      url: $('#jd-url').value.trim(), score: r.fit ? r.fit.score : '',
      contract: (r.job && r.job.contract_type) || '', status: 'Tailored', notes: ''
    });
    saveApps(list);
    $('#save-note').textContent = 'Saved. Find it under Applications.';
  });

  function renderApps() {
    const list = apps(), t = $('#apps-table');
    t.innerHTML = '';
    $('#apps-empty').hidden = list.length > 0;
    if (!list.length) return;
    t.append(el('thead', {}, el('tr', {}, ['Date', 'Company', 'Role', 'Fit', 'Type', 'Status', 'Notes', ''].map(h => el('th', { text: h })))));
    const tb = el('tbody');
    list.forEach(a => {
      const status = el('select', { id: 'st-' + a.id, 'aria-label': 'Status' }, STATUSES.map(s => el('option', { value: s, text: s })));
      status.value = a.status;
      status.addEventListener('change', () => { const l = apps(); l.find(x => x.id === a.id).status = status.value; saveApps(l); });
      const notes = el('input', { type: 'text', id: 'nt-' + a.id, value: a.notes || '', placeholder: 'Add a note', 'aria-label': 'Notes' });
      notes.addEventListener('change', () => { const l = apps(); l.find(x => x.id === a.id).notes = notes.value; saveApps(l); });
      const del = el('button', { class: 'linkish', type: 'button', text: 'Delete' });
      del.addEventListener('click', () => {
        const yes = el('button', { class: 'btn ghost small danger', type: 'button', text: 'Delete' });
        const no = el('button', { class: 'linkish', type: 'button', text: 'Keep' });
        const span = el('span', { class: 'confirm' }, yes, no);
        del.replaceWith(span);
        yes.addEventListener('click', () => { saveApps(apps().filter(x => x.id !== a.id)); renderApps(); });
        no.addEventListener('click', () => span.replaceWith(del));
      });
      tb.append(el('tr', {},
        el('td', { text: a.date }),
        el('td', { text: a.company }),
        el('td', { class: 'role' }, a.url ? el('a', { href: a.url, target: '_blank', rel: 'noopener', text: a.role || 'Link' }) : a.role),
        el('td', { class: 'score', text: a.score === '' ? '—' : String(a.score) }),
        el('td', { text: a.contract || '' }),
        el('td', {}, status), el('td', {}, notes), el('td', {}, del)));
    });
    t.append(tb);
  }
  $('#export-csv').addEventListener('click', () => {
    const cols = ['date', 'company', 'role', 'url', 'score', 'contract', 'status', 'notes'];
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.join(','), ...apps().map(a => cols.map(c => esc(a[c])).join(','))].join('\r\n');
    download(new Blob(['﻿' + csv], { type: 'text/csv' }), `applications_${today()}.csv`);
  });

  // ---------- example job (fictional) ----------
  const EXAMPLE_JD = `SAP Ariba Solution Architect (Source-to-Pay)
Northgate Energy (fictional example) · Manchester, hybrid (2 days on site) · Permanent

About the role
We are replacing our legacy procurement tools with SAP Ariba integrated to S/4HANA. You will own the end-to-end Source-to-Pay solution design across Guided Buying, Buying & Invoicing, Sourcing, Contracts and Supplier Lifecycle & Performance (SLP), and work with our systems integrator to deliver it.

What you'll do
- Own the S2P solution architecture and design authority, from requisition to payment
- Lead fit-to-standard workshops with Procurement, Finance and AP stakeholders
- Design integration between SAP Ariba and S/4HANA using SAP Cloud Integration Gateway (CIG) / SAP Integration Suite
- Define the Guided Buying experience, catalogue strategy (punch-out and hosted) and approval flows
- Govern supplier enablement on SAP Business Network with the supplier onboarding team
- Shape the data migration approach for suppliers, contracts and open purchase orders
- Support testing (SIT, UAT), cutover and hypercare
- Mentor junior functional consultants

What you'll bring
- 10+ years in SAP procurement, including at least 3 full-cycle SAP Ariba implementations
- Deep knowledge of P2P processes and SAP MM / S/4HANA Sourcing & Procurement
- Hands-on experience with Guided Buying and SAP Business Network
- Experience with CIG or SAP Integration Suite
- Strong stakeholder management at Head of Procurement / CFO level
- Desirable: SAP Ariba certification, PMP or PRINCE2, utilities sector experience, SAP Ariba Central Procurement / S/4HANA Cloud`;
})();
