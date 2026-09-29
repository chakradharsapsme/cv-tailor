/*
 * sync.js — keeps your data the same on phone and laptop.
 * Inside claude.ai the page has a private store in your Claude account (db) and file storage (assets).
 * Every local save is copied there; on start-up newer copies from your other devices are pulled in.
 * Newest wins, record by record. Outside claude.ai this file does nothing.
 *   sync/profile, sync/kv_<name>     profile, stories, offers, drill progress, mock sessions
 *   apps/<id>                        applications (deleted ones become {_deleted:true})
 *   masters/<id> + asset             CV files (the .docx is stored as base64 text)
 */
(function () {
  const S = window.CVT.store;
  const KV_SYNCED = ['stories', 'offers', 'drills', 'mocks', 'autopilot', 'autopilotLast'];
  const META_KEY = 'cvt.syncMeta';
  const now = () => new Date().toISOString();
  const meta = { get: k => (S.local.get(META_KEY, {}) || {})[k] || '', set: (k, v) => { const m = S.local.get(META_KEY, {}) || {}; m[k] = v; S.local.set(META_KEY, m); } };

  let dbP = null, assetsP = null, status = { state: 'off', last: '', error: '' };
  const listeners = new Set();
  const emit = () => listeners.forEach(f => { try { f(status); } catch (_) {} });
  function db() {
    if (!(window.claude && window.claude.use)) return Promise.resolve(null);
    if (!dbP) dbP = window.claude.use('db').catch(() => null);
    return dbP;
  }
  function assets() {
    if (!(window.claude && window.claude.use)) return Promise.resolve(null);
    if (!assetsP) assetsP = window.claude.use('assets').catch(() => null);
    return assetsP;
  }
  const clean = v => JSON.parse(JSON.stringify(v, (k, x) => (x instanceof ArrayBuffer || ArrayBuffer.isView(x)) ? undefined : x));

  // ---------------------------------------------------------------------
  // Push (debounced per record)
  // ---------------------------------------------------------------------
  const timers = new Map();
  function later(key, fn) {
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(async () => {
      timers.delete(key);
      const d = await db(); if (!d) return;
      try { await fn(d); status = { ...status, state: 'on', last: now(), error: '' }; }
      catch (e) { status = { ...status, error: (e && (e.message || e.code)) || 'Sync failed' }; console.warn('sync', key, e); }
      emit();
    }, 800));
  }
  const pushProfile = p => later('profile', d => d.doc('sync/profile').set({ v: clean(p), updated: meta.get('profile') }));
  const pushKV = (k, v) => later('kv_' + k, d => d.doc('sync/kv_' + k).set({ v: clean(k === 'mocks' ? (v || []).slice(0, 10) : v), updated: meta.get('kv_' + k) }));
  const pushApp = a => later('app_' + a.id, d => d.collection('apps').doc(a.id).set(clean(a)));
  const pushAppDelete = id => later('app_' + id, d => d.collection('apps').doc(id).set({ id, _deleted: true, updated: now() }));
  const pushMaster = m => later('master_' + m.id, async d => {
    let assetId = m.assetId;
    if (!assetId && m.data) {
      const as = await assets();
      if (as) {
        const r = await as.upload(new Blob([S.b64.from(m.data)], { type: 'text/plain' }), { type: 'text/plain' });
        assetId = r.id; m.assetId = assetId; await S._put('masters', m);
      }
    }
    const { data, ...rest } = m;
    await d.collection('masters').doc(m.id).set(clean({ ...rest, assetId: assetId || '', updated: m.updated || now() }));
  });
  const pushMasterDelete = id => later('master_' + id, d => d.collection('masters').doc(id).set({ id, _deleted: true, updated: now() }));

  // ---------------------------------------------------------------------
  // Wrap the store: every save also goes to the sync store
  // ---------------------------------------------------------------------
  const orig = { saveProfile: S.saveProfile, saveApp: S.saveApp, removeApp: S.removeApp, addMaster: S.addMaster, setDefaultMaster: S.setDefaultMaster, saveMaster: S.saveMaster, removeMaster: S.removeMaster, setKV: S.setKV };
  S.saveProfile = async p => { const r = await orig.saveProfile(p); meta.set('profile', now()); pushProfile(p); return r; };
  S.saveApp = async a => { const r = await orig.saveApp(a); pushApp(a); return r; };
  S.removeApp = async id => { const r = await orig.removeApp(id); pushAppDelete(id); return r; };
  S.addMaster = async (name, fileName, buf) => { const m = await orig.addMaster(name, fileName, buf); m.updated = now(); await S._put('masters', m); pushMaster(m); return m; };
  S.saveMaster = async m => { m.updated = now(); const r = await orig.saveMaster(m); pushMaster(m); return r; };
  S.setDefaultMaster = async id => { const r = await orig.setDefaultMaster(id); for (const m of await S.listMasters()) { m.updated = now(); await S._put('masters', m); pushMaster(m); } return r; };
  S.removeMaster = async id => { const r = await orig.removeMaster(id); pushMasterDelete(id); return r; };
  S.setKV = async (k, v) => { const r = await orig.setKV(k, v); if (KV_SYNCED.includes(k)) { meta.set('kv_' + k, now()); pushKV(k, v); } return r; };

  // ---------------------------------------------------------------------
  // Pull on start-up, then push anything that only exists here
  // ---------------------------------------------------------------------
  async function pull() {
    const d = await db();
    if (!d) { status = { state: 'unavailable', last: '', error: '' }; emit(); return { changed: 0 }; }
    status = { ...status, state: 'syncing' }; emit();
    let changed = 0;
    try {
      // profile
      const ps = await d.doc('sync/profile').get();
      if (ps.exists && ps.data().updated > meta.get('profile')) { await S._put('kv', { k: 'profile', v: ps.data().v }); meta.set('profile', ps.data().updated); changed++; }
      else if (!ps.exists || ps.data().updated < meta.get('profile')) {
        const p = await S.getProfile();
        if (meta.get('profile') || p.name || p.email || (p.targetRoles || []).length || (p.achievements || []).length) { if (!meta.get('profile')) meta.set('profile', now()); pushProfile(p); }
      }
      // small collections kept in kv
      for (const k of KV_SYNCED) {
        const s = await d.doc('sync/kv_' + k).get();
        if (s.exists && s.data().updated > meta.get('kv_' + k)) { await S._put('kv', { k, v: s.data().v }); meta.set('kv_' + k, s.data().updated); changed++; }
        else if (!s.exists || s.data().updated < meta.get('kv_' + k)) {
          const v = await S.getKV(k, null);
          if (v != null) { if (!meta.get('kv_' + k)) meta.set('kv_' + k, now()); pushKV(k, v); }
        }
      }
      // applications
      const remoteApps = (await d.collection('apps').limit(1000).get()).docs.map(x => x.data());
      const localApps = await S._all('apps');
      const lm = new Map(localApps.map(a => [a.id, a]));
      for (const r of remoteApps) {
        const l = lm.get(r.id);
        if (r._deleted) { if (l && (l.updated || '') <= r.updated) { await S._del('apps', r.id); changed++; } continue; }
        if (!l || (r.updated || '') > (l.updated || '')) { await S._put('apps', r); changed++; }
      }
      const rm = new Map(remoteApps.map(a => [a.id, a]));
      for (const l of localApps) { const r = rm.get(l.id); if (!r || (!r._deleted && (l.updated || '') > (r.updated || ''))) pushApp(l); }
      // CV files
      const remoteM = (await d.collection('masters').limit(200).get()).docs.map(x => x.data());
      const localM = await S._all('masters');
      const lmm = new Map(localM.map(m => [m.id, m]));
      for (const r of remoteM) {
        const l = lmm.get(r.id);
        if (r._deleted) { if (l) { await S._del('masters', r.id); changed++; } continue; }
        if (!l && r.assetId) {
          try {
            const txt = await (await fetch('/_blob/' + r.assetId)).text();
            await S._put('masters', { ...r, data: S.b64.to(txt.trim()) }); changed++;
          } catch (e) { console.warn('CV download failed', e); }
        } else if (l && (r.updated || '') > (l.updated || '')) { await S._put('masters', { ...l, name: r.name, isDefault: r.isDefault, updated: r.updated }); changed++; }
      }
      const rmm = new Map(remoteM.map(m => [m.id, m]));
      for (const l of localM) { const r = rmm.get(l.id); if (!r || (!r._deleted && (l.updated || '') > (r.updated || ''))) pushMaster(l); }
      if (changed && window.CVT.ui.state.masterCache) window.CVT.ui.state.masterCache.clear();
      status = { state: 'on', last: now(), error: '' };
    } catch (e) {
      status = { state: 'error', last: status.last, error: (e && (e.message || e.code)) || 'Sync failed' };
    }
    emit();
    return { changed };
  }

  window.CVT.sync = { pull, status: () => status, onChange: f => { listeners.add(f); return () => listeners.delete(f); }, available: async () => !!(await db()) };
})();
