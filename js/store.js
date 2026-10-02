/*
 * store.js — everything is kept in this browser (IndexedDB), nothing on a server.
 *   settings  : API key and model (localStorage, small)
 *   profile   : career facts, targets, achievements bank
 *   masters   : master CVs (.docx bytes)
 *   apps      : one record per job application
 */
(function () {
  const DB_NAME = 'cv-tailor', DB_VER = 2;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        ['kv', 'masters', 'apps', 'files'].forEach(n => { if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: n === 'kv' ? 'k' : 'id' }); });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let out;
      Promise.resolve(fn(s)).then(r => { out = r; });
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Storage aborted'));
    });
  }
  const req2p = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  const all = name => tx(name, 'readonly', s => req2p(s.getAll()));
  const get = (name, id) => tx(name, 'readonly', s => req2p(s.get(id)));
  const put = (name, v) => tx(name, 'readwrite', s => req2p(s.put(v)));
  const del = (name, id) => tx(name, 'readwrite', s => req2p(s.delete(id)));

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const now = () => new Date().toISOString();

  // ---------- settings (localStorage, wrapped) ----------
  const local = {
    get(k, d = null) { try { const v = localStorage.getItem(k) ?? sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v, session = false) { try { (session ? sessionStorage : localStorage).setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } },
    del(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (_) {} }
  };

  // ---------- profile ----------
  const DEFAULT_PROFILE = {
    name: '', email: '', phone: '', linkedin: '', website: '', city: '', postcode: '', country: 'United Kingdom',
    currentTitle: '', currentCompany: '',
    targetRoles: [], targetLocations: ['United Kingdom'], workPreference: 'Both',
    salary: '', dayRate: '', notice: '', eligibility: '', weeklyGoal: 5,
    achievements: [], extraSkills: '', neverClaim: '',
    // Application forms (Workday and similar)
    legalFirst: '', middleName: '', legalLast: '', preferredName: '', phoneType: 'Mobile', phoneCode: '', address1: '', address2: '', county: '',
    hearAbout: '', rightToWork: '', sponsorship: '', relocate: '', travel: '', startDate: '', currentSalary: '', previouslyWorked: 'No', drivingLicence: '',
    school: '', degree: '', fieldOfStudy: '', eduFrom: '', eduTo: '', grade: '', languages: '', certifications: ''
  };
  async function getProfile() {
    const r = await get('kv', 'profile');
    return Object.assign({}, DEFAULT_PROFILE, r ? r.v : {});
  }
  const saveProfile = p => put('kv', { k: 'profile', v: p });
  // Generic small records (job feed, company intel cache).
  async function getKV(k, d = null) { const r = await get('kv', k); return r ? r.v : d; }
  const setKV = (k, v) => put('kv', { k, v });

  // ---------- masters ----------
  async function listMasters() { return (await all('masters')).sort((a, b) => (b.isDefault - a.isDefault) || a.created.localeCompare(b.created)); }
  async function addMaster(name, fileName, buf) {
    const list = await listMasters();
    const m = { id: uid(), name, fileName, data: buf, created: now(), isDefault: list.length === 0 };
    await put('masters', m);
    return m;
  }
  async function setDefaultMaster(id) {
    for (const m of await listMasters()) { m.isDefault = m.id === id; await put('masters', m); }
  }
  const getMaster = id => get('masters', id);
  const saveMaster = m => put('masters', m);
  async function removeMaster(id) {
    await del('masters', id);
    const rest = await listMasters();
    if (rest.length && !rest.some(m => m.isDefault)) await setDefaultMaster(rest[0].id);
  }

  // ---------- applications ----------
  const STATUSES = ['Saved', 'Tailored', 'Applied', 'Screening', 'Interview', 'Offer', 'Accepted', 'Rejected', 'Withdrawn'];
  const COLUMNS = [
    { key: 'prep', title: 'Preparing', statuses: ['Saved', 'Tailored'] },
    { key: 'applied', title: 'Applied', statuses: ['Applied'] },
    { key: 'screen', title: 'Screening', statuses: ['Screening'] },
    { key: 'interview', title: 'Interview', statuses: ['Interview'] },
    { key: 'offer', title: 'Offer', statuses: ['Offer', 'Accepted'] },
    { key: 'closed', title: 'Closed', statuses: ['Rejected', 'Withdrawn'] }
  ];
  function newApp(masterId) {
    return {
      id: uid(), created: now(), updated: now(),
      company: '', role: '', url: '', location: '', workMode: '', contractType: '', pay: '', closing: '',
      recruiter: '', agency: '', recruiterEmail: '', hiringManager: '',
      jd: '', notes: '', emphasis: '', tone: 'Warm and direct', masterId: masterId || '',
      status: 'Saved', history: [{ status: 'Saved', at: now() }], appliedAt: '',
      next: null,            // { text, due }
      analysis: null, decisions: {}, letter: '', outreach: null, interview: null,
      answers: { why: '', salary: '', notice: '', qa: [] }
    };
  }
  async function listApps() { return (await all('apps')).sort((a, b) => b.updated.localeCompare(a.updated)); }
  const getApp = id => get('apps', id);
  function saveApp(a) { a.updated = now(); return put('apps', a); }
  const removeApp = id => del('apps', id);

  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); }
  /** Status change with sensible follow-up defaults. */
  function setStatus(a, status) {
    if (a.status === status) return a;
    a.status = status;
    a.history = (a.history || []).concat({ status, at: now() });
    const today = new Date().toISOString().slice(0, 10);
    if (status === 'Applied') {
      if (!a.appliedAt) a.appliedAt = now();
      a.next = { text: 'Follow up with the recruiter or hiring manager', due: addDays(today, 7) };
    } else if (status === 'Screening') {
      a.next = { text: 'Prepare for the screening call (Interview tab)', due: addDays(today, 2) };
    } else if (status === 'Interview') {
      a.next = { text: 'Send a thank-you note after the interview', due: addDays(today, 1) };
    } else if (status === 'Offer') {
      a.next = { text: 'Review the offer: rate/salary, notice, start date, IR35', due: addDays(today, 2) };
    } else if (['Accepted', 'Rejected', 'Withdrawn'].includes(status)) {
      a.next = null;
    }
    return a;
  }

  // ---------- backup ----------
  const b64 = {
    from(buf) { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); },
    to(str) { const bin = atob(str); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b.buffer; }
  };
  // Binary data (Word files, uploads) travels as base64 inside the JSON backup.
  const enc = v => {
    if (v instanceof ArrayBuffer) return { __b64: b64.from(v) };
    if (ArrayBuffer.isView(v)) return { __b64: b64.from(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)) };
    if (Array.isArray(v)) return v.map(enc);
    if (v && typeof v === 'object' && !(v instanceof Blob)) { const o = {}; for (const k in v) o[k] = enc(v[k]); return o; }
    return v;
  };
  const dec = v => {
    if (v && typeof v === 'object' && typeof v.__b64 === 'string' && Object.keys(v).length === 1) return b64.to(v.__b64);
    if (Array.isArray(v)) return v.map(dec);
    if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = dec(v[k]); return o; }
    return v;
  };
  // Settings worth moving to another device (never API keys).
  const LOCAL_KEYS = ['cvt.country', 'cvt.field', 'cvt.theme', 'cvt.provider', 'cvt.geminiModel', 'cvt.tourDone', 'cvt.jobsUi', 'cvt.deck', 'cvt.rc'];
  /** Everything in one file: profile, CVs, applications, documents, notes, prep, job feed and settings. */
  async function exportAll() {
    const masters = (await listMasters()).map(m => Object.assign({}, m, { data: b64.from(m.data) }));
    const kv = (await all('kv')).filter(r => r.k !== 'profile').map(r => ({ k: r.k, v: enc(r.v) }));
    const files = [];
    for (const f of await all('files')) {
      try { const b = f.blob; files.push({ id: f.id, name: b && b.name || '', type: b && b.type || '', data: b64.from(await b.arrayBuffer()) }); } catch (_) {}
    }
    const settings = {}; LOCAL_KEYS.forEach(k => { const v = local.get(k); if (v != null) settings[k] = v; });
    return { app: 'cv-tailor', version: 3, exported: now(), profile: await getProfile(), masters, apps: enc(await listApps()), kv, files, settings };
  }
  async function importAll(obj) {
    if (!obj || obj.app !== 'cv-tailor') throw new Error('This is not an Applywise backup file.');
    if (obj.profile) await saveProfile(Object.assign({}, DEFAULT_PROFILE, obj.profile));
    for (const m of obj.masters || []) await put('masters', Object.assign({}, m, { data: b64.to(m.data) }));
    for (const a of dec(obj.apps || [])) await put('apps', a);
    for (const r of obj.kv || []) await put('kv', { k: r.k, v: dec(r.v) });
    for (const f of obj.files || []) {
      const buf = b64.to(f.data);
      await put('files', { id: f.id, blob: f.name ? new File([buf], f.name, { type: f.type }) : new Blob([buf], { type: f.type }) });
    }
    Object.entries(obj.settings || {}).forEach(([k, v]) => { if (LOCAL_KEYS.includes(k)) local.set(k, v); });
    return { masters: (obj.masters || []).length, apps: (obj.apps || []).length, docs: (obj.files || []).length, extras: (obj.kv || []).length };
  }
  async function clearAll() {
    for (const n of ['kv', 'masters', 'apps', 'files']) await tx(n, 'readwrite', s => req2p(s.clear()));
    // Every Applywise setting on this device too (keys, theme, country, field, drafts...).
    try { [localStorage, sessionStorage].forEach(st => Object.keys(st).filter(k => /^cvt\./.test(k)).forEach(k => st.removeItem(k))); } catch (_) {}
    try { if (window.caches) (await caches.keys()).forEach(k => caches.delete(k)); } catch (_) {}
  }

  /** One-time move of v1 data (localStorage) into IndexedDB. */
  async function migrateV1() {
    if (local.get('cvt.migrated')) return;
    const m = local.get('cvt.master');
    if (m && m.data && !(await listMasters()).length) await addMaster('Main CV', m.name, b64.to(m.data));
    const apps = local.get('cvt.apps', []);
    for (const old of apps) {
      const a = newApp('');
      Object.assign(a, { company: old.company, role: old.role, url: old.url, contractType: old.contract || '', notes: old.notes || '' });
      a.status = STATUSES.includes(old.status) ? old.status : 'Tailored';
      if (old.status === 'Recruiter call') a.status = 'Screening';
      a.history = [{ status: a.status, at: (old.date || now().slice(0, 10)) + 'T09:00:00.000Z' }];
      a.created = a.updated = a.history[0].at;
      if (old.score !== '' && old.score != null) a.analysis = { fit: { score: old.score }, legacy: true };
      await saveApp(a);
    }
    local.set('cvt.migrated', true);
  }

  window.CVT = window.CVT || {};
  window.CVT.store = {
    local, uid, now, addDays, b64,
    getProfile, saveProfile, DEFAULT_PROFILE, getKV, setKV,
    listMasters, addMaster, setDefaultMaster, getMaster, saveMaster, removeMaster,
    STATUSES, COLUMNS, newApp, listApps, getApp, saveApp, removeApp, setStatus,
    exportAll, importAll, clearAll, migrateV1,
    // large uploaded files (kept on this device; metadata lives on the application)
    putFile: (id, blob) => put('files', { id, blob }), getFile: async id => { const r = await get('files', id); return r ? r.blob : null; }, delFile: id => del('files', id),
    // raw access for device sync: writes without touching timestamps
    _put: put, _del: del, _get: get, _all: all
  };
})();
