/*
 * autopilot.js — one button runs the whole routine:
 *   tidy up → find jobs → score → pick the best matches → tailor CV → cover letter → recruiter messages
 *   → form answers → interview prep → a "ready to review" list and today's follow-ups.
 * It never applies or sends anything: every application waits for your review and your click.
 */
(function () {
  const { html, raw, $, $$, toast, copy, today, ukDate, daysBetween, scoreCls, state, VERDICT } = window.CVT.ui;
  const S = window.CVT.store;
  const J = () => window.CVT.jobs, E = () => window.CVT.engine;
  const DEFAULTS = { max: 3, min: 65, letter: true, outreach: true, answers: true, interview: false, includeAgency: true };
  const getCfg = async () => Object.assign({}, DEFAULTS, (await S.getKV('autopilot', null)) || {});
  const getLast = async () => (await S.getKV('autopilotLast', null)) || null;

  let running = null;

  async function run(cfg, log) {
    const ctl = new AbortController(); running = ctl;
    const stopped = () => ctl.signal.aborted;
    const res = { at: new Date().toISOString(), cleaned: 0, found: 0, prepared: [], skipped: [], needsAdvert: [], errors: [] };
    const profile = await S.getProfile();
    try {
      // 1. Tidy up empty drafts left by "New application".
      log('Tidying up empty drafts');
      for (const a of await S.listApps()) {
        if (a.status === 'Saved' && !a.role && !a.company && !(a.jd || '').trim() && !a.analysis && daysBetween(a.created) >= 0 && (Date.now() - new Date(a.created)) > 3600e3) { await S.removeApp(a.id); res.cleaned++; }
      }
      if (stopped()) throw new Error('Stopped');

      // 2. Find jobs (skipped for an apply-queue run: you already picked them).
      if (!cfg.keys && await J().available()) {
        log('Searching Indeed for your target roles');
        try { const r = await J().refresh(); res.found += r.added || 0; if (r.errors.length) res.errors.push(r.errors[0].text); } catch (e) { res.errors.push(J().errText(e)); }
      }
      if (!cfg.keys) {
        log('Adding jobs from your job robot');
        try { const c = await J().syncCollected(true); res.found += (c && c.added) || 0; } catch (_) {}
        if (stopped()) throw new Error('Stopped');
        log('Reading the full adverts of the best matches');
        await J().checkTop(Math.max(6, cfg.max * 2));
      }

      // 3. Pick the best matches (or the jobs in your apply queue).
      let pick, eligible, full;
      if (cfg.keys) {
        log(`Reading the full adverts of the ${cfg.keys.length} queued job${cfg.keys.length === 1 ? '' : 's'}`);
        for (const k of cfg.keys) { if (stopped()) throw new Error('Stopped'); try { await J().details(k); } catch (_) {} }
        eligible = (await J().rowsFor(cfg.keys)).filter(r => r.j.status !== 'imported' || !r.j.appId);
        // Short adverts are still prepared: the tailoring fills in what such roles usually ask for and marks it as typical.
        full = eligible; res.needsAdvert = eligible.filter(r => (r.j.jd || '').length < 200 || r.j.snippetOnly).map(r => ({ title: r.j.title, company: r.j.company, url: r.j.url, score: r.sc.score, key: r.j.key }));
        pick = full;
      } else {
      const t = await J().top(60);
      eligible = t.items.filter(r => r.sc.score >= cfg.min && !r.dups.length && !r.sc.flags.some(f => /Below your level/.test(f.text)) && (cfg.includeAgency || !r.sc.flags.some(f => f.text === 'Agency')));
      full = eligible.filter(r => (r.j.jd || '').length >= 200 && !r.j.snippetOnly);
      res.needsAdvert = eligible.filter(r => !full.includes(r)).slice(0, 5).map(r => ({ title: r.j.title, company: r.j.company, url: r.j.url, score: r.sc.score, key: r.j.key }));
      pick = full.slice(0, cfg.max);
      }
      if (!pick.length && !cfg.keys) log(eligible.length ? 'Best matches only have advert summaries; open them and paste the full advert' : `No new jobs scored ${cfg.min}+ this time`);

      // 4. Prepare each application.
      if (pick.length && !(await window.CVT.ai.ensure('Autopilot prepares each application with AI.', { big: true }))) throw new Error('Choose one of the free AI engines first');
      for (const [i, r] of pick.entries()) {
        if (stopped()) throw new Error('Stopped');
        const label = `${r.j.title} · ${r.j.company || ''}`;
        const id = await J().importJob(r.j.key);
        let a = await S.getApp(id);
        try {
          log(`(${i + 1}/${pick.length}) Analysing fit and tailoring your CV: ${label}`);
          await E().analyse(a, profile, ctl.signal);
          const verdict = a.analysis.decision && a.analysis.decision.verdict;
          if (verdict === 'skip') { res.skipped.push({ id, label, why: (a.analysis.decision && a.analysis.decision.reason) || 'The AI advises skipping this one' }); continue; }
          if (cfg.letter) { log(`(${i + 1}/${pick.length}) Writing the cover letter`); await E().letter(a, profile); }
          if (cfg.outreach) { log(`(${i + 1}/${pick.length}) Drafting recruiter and hiring-manager messages`); await E().outreach(a, profile); }
          if (cfg.answers) { log(`(${i + 1}/${pick.length}) Preparing application-form answers`); await E().answers(a, profile); }
          if (cfg.interview) { log(`(${i + 1}/${pick.length}) Preparing interview questions`); await E().interview(a, profile); }
          a = await S.getApp(id);
          a.autopilot = { at: new Date().toISOString(), queued: !!cfg.keys };
          a.next = { text: 'Review what Autopilot prepared, then apply', due: today() };
          await S.saveApp(a);
          res.prepared.push({ id, label, fit: a.analysis.fit && a.analysis.fit.score, verdict });
          (res.preparedKeys = res.preparedKeys || []).push(r.j.key);
        } catch (e) {
          if (e.name === 'AbortError' || /Stopped/.test(e.message)) throw e;
          res.errors.push(`${label}: ${e.message}`);
        }
      }
    } catch (e) {
      if (!/Stopped/.test(e.message) && e.name !== 'AbortError') res.errors.push(e.message); else res.stopped = true;
    } finally { running = null; }
    await S.setKV('autopilotLast', res);
    return res;
  }

  // =====================================================================
  // VIEW
  // =====================================================================
  async function view(root) {
    const [cfg, last, apps] = await Promise.all([getCfg(), getLast(), S.listApps()]);
    const QA = window.CVT.aitools, qKeys = QA ? QA.queue() : [];
    const qRows = qKeys.length ? await J().rowsFor(qKeys) : [];
    const t = today();
    const ready = apps.filter(a => a.autopilot && ['Saved', 'Tailored'].includes(a.status));
    const chase = apps.filter(a => a.next && a.next.due && a.next.due <= t && ['Applied', 'Screening', 'Interview'].includes(a.status));
    const ch = (k, label) => html`<label class="check-line"><input type="checkbox" data-c="${k}" ${cfg[k] ? raw('checked') : ''}> ${label}</label>`;

    root.innerHTML = String(html`
      <header class="page-head"><div><p class="eyebrow">One click, then you review</p><h1>Autopilot and apply queue</h1></div>
        <div class="row gap wrap"><button class="btn primary" id="ap-run" type="button">Run autopilot</button><button class="btn ghost" id="ap-stop" type="button" hidden>Stop</button></div></header>
      <section class="panel callout">
        <p>Autopilot finds new IT and Business Analyst jobs, picks the best matches for your CV, and prepares each application: a tailored CV (your wording kept, requirements inserted), a cover letter, recruiter messages and form answers. <strong>It never applies or sends anything.</strong> Everything waits below for you to review, tick and apply.</p>
      </section>
      <section class="panel q-panel">
        <div class="panel-head"><h2>🧺 Your apply queue <span class="muted">· ${qRows.length}</span></h2>${qRows.length ? html`<div class="row gap"><button class="btn ghost small" id="q-clear" type="button">Clear</button><button class="btn primary small" id="q-run" type="button">Prepare ${qRows.length} kit${qRows.length === 1 ? '' : 's'} for review</button></div>` : ''}</div>
        ${qRows.length ? html`<ul class="q-list">${qRows.map(r => html`<li><span class="score-pill ${scoreCls(r.sc.score)}">${r.sc.score}</span><span><strong>${r.j.title}</strong><span class="muted small"> · ${r.j.company || ''}${r.j.location ? ' · ' + r.j.location : ''}</span></span><button class="linkish small" type="button" data-unq="${r.j.key}" aria-label="Remove from queue">Remove</button></li>`)}</ul>
          <p class="muted small">Review mode: each job gets a tailored CV and the extras ticked in Settings. Nothing is sent. Open each kit below, check it, then press Apply yourself.</p>`
        : html`<p class="hint">Pick the jobs you want on the <a class="link" href="#/jobs">Jobs</a> page with <strong>+ Queue</strong> (up to 10). Or let Autopilot pick the best matches for you with <strong>Run autopilot</strong>.</p>`}
      </section>
      <div class="ap-grid">
        <section class="panel">
          <div class="panel-head"><h2>Settings</h2></div>
          <div class="grid-2">
            <label class="field"><span>Applications to prepare per run</span><select data-c="max">${[1, 2, 3, 4, 5].map(n => html`<option ${cfg.max === n ? raw('selected') : ''}>${n}</option>`)}</select></label>
            <label class="field"><span>Only jobs scoring at least</span><select data-c="min">${[50, 60, 65, 70, 75, 80].map(n => html`<option ${cfg.min === n ? raw('selected') : ''}>${n}</option>`)}</select></label>
          </div>
          ${ch('letter', 'Write a cover letter')}${ch('outreach', 'Draft recruiter and hiring-manager messages')}${ch('answers', 'Prepare application-form answers')}${ch('interview', 'Prepare interview questions (slower)')}${ch('includeAgency', 'Include agency adverts')}
          <p class="muted small">Each prepared job uses a few AI requests (about 1–2 minutes per job). Duplicates, stale adverts and roles below your level are skipped.</p>
        </section>
        <section class="panel" id="ap-live">
          <div class="panel-head"><h2>${last ? 'Last run' : 'Not run yet'}</h2>${last ? html`<span class="muted small">${new Date(last.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>` : ''}</div>
          ${last ? summary(last) : html`<p class="hint">Press <strong>Run autopilot</strong>. Keep this page open while it works; you can use other tabs meanwhile.</p>`}
        </section>
      </div>
      <section class="panel">
        <div class="panel-head"><h2>Ready for your review <span class="muted">· ${ready.length}</span></h2></div>
        ${ready.length ? html`<div class="table-wrap"><table class="list"><thead><tr><th>Role</th><th>Fit</th><th>Advice</th><th>Next</th></tr></thead><tbody>${ready.map(a => {
          const v = a.analysis && a.analysis.decision && VERDICT[a.analysis.decision.verdict];
          return html`<tr><td><a href="#/app/${a.id}/fit">${a.role} · ${a.company || ''}</a><br><span class="muted small">prepared ${ukDate(a.autopilot.at)}</span></td>
            <td>${a.analysis && a.analysis.fit ? html`<span class="chip ${scoreCls(a.analysis.fit.score)}">${a.analysis.fit.score}</span>` : '—'}</td>
            <td>${v ? html`<span class="chip ${v.cls}">${v.label}</span>` : '—'}</td>
            <td class="nowrap"><a class="btn small ghost" href="#/app/${a.id}/cv">1. Check CV</a> <a class="btn small ghost" href="#/app/${a.id}/letter">2. Letter</a> <a class="btn small primary" href="#/app/${a.id}/apply">3. Apply</a><br><button class="linkish small" type="button" data-rv="applied" data-id="${a.id}">✓ I applied</button> · <button class="linkish small" type="button" data-rv="skip" data-id="${a.id}">Skip this one</button></td></tr>`;
        })}</tbody></table></div>` : html`<p class="empty-note">Nothing waiting. Run Autopilot to prepare new applications.</p>`}
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Follow-ups due <span class="muted">· ${chase.length}</span></h2></div>
        ${chase.length ? html`<ul class="chase">${chase.map(a => html`<li><div><strong>${a.role} · ${a.company || ''}</strong><p class="muted small">${a.next.text} · ${a.status}, applied ${a.appliedAt ? daysBetween(a.appliedAt) + ' days ago' : ''}</p></div>
            <div class="row gap">${a.outreach && a.outreach.follow_up ? html`<button class="btn small ghost" data-copy="${a.id}" type="button">Copy follow-up message</button>` : html`<a class="btn small ghost" href="#/app/${a.id}/outreach">Draft follow-up</a>`}<button class="btn small" data-done="${a.id}" type="button">Done</button></div></li>`)}</ul>`
        : html`<p class="empty-note">No chasers due today.</p>`}
      </section>`);

    // settings
    $$('[data-c]', root).forEach(el => el.addEventListener('change', async () => {
      const c = await getCfg(); const k = el.dataset.c;
      c[k] = el.type === 'checkbox' ? el.checked : Number(el.value); await S.setKV('autopilot', c);
    }));
    // follow-ups
    $$('[data-copy]', root).forEach(b => b.addEventListener('click', async () => { const a = apps.find(x => x.id === b.dataset.copy); const f = a.outreach.follow_up; copy(`Subject: ${f.subject}\n\n${f.body}`, b); }));
    $$('[data-done]', root).forEach(b => b.addEventListener('click', async () => { const a = await S.getApp(b.dataset.done); a.next = { text: 'Follow up again if no reply', due: S.addDays(today(), 7) }; await S.saveApp(a); toast('Next chase set for a week from today'); window.CVT.app.rerender(); }));
    // run
    const runBtn = $('#ap-run', root), stopBtn = $('#ap-stop', root);
    if (running) { runBtn.disabled = true; runBtn.textContent = 'Running…'; }
    stopBtn.addEventListener('click', () => { if (running) running.abort(); stopBtn.textContent = 'Stopping…'; });
    const start = async keys => {
      if (!(await S.listMasters()).length) { toast('Upload your CV in Career profile first', 'warn'); return; }
      runBtn.disabled = true; runBtn.textContent = 'Running…'; stopBtn.hidden = false;
      const live = $('#ap-live', root);
      live.innerHTML = '<div class="panel-head"><h2>Running</h2></div><ol class="ap-log" id="ap-log"></ol>';
      const log = msg => { const ol = document.getElementById('ap-log'); if (!ol) return; [...ol.children].forEach(li => li.className = 'done'); const li = document.createElement('li'); li.className = 'active'; li.textContent = msg; ol.append(li); };
      const cfgNow = await getCfg();
      if (keys) { cfgNow.keys = keys; cfgNow.max = keys.length; }
      const r = await run(cfgNow, log);
      if (keys && QA) { const done = new Set(r.preparedKeys || []); QA.setQueue(QA.queue().filter(k => !done.has(k))); }
      toast(r.prepared.length ? `${r.prepared.length} application${r.prepared.length > 1 ? 's' : ''} ready for your review` : 'Autopilot finished');
      window.CVT.app.refreshBadges && window.CVT.app.refreshBadges();
      if (document.getElementById('ap-run')) window.CVT.app.rerender();
    };
    runBtn.addEventListener('click', () => start(null));
    const qRun = $('#q-run', root);
    if (qRun) qRun.addEventListener('click', () => { if (running) return; qRun.disabled = true; start(qKeys); });
    const qClear = $('#q-clear', root);
    if (qClear) qClear.addEventListener('click', () => { QA.setQueue([]); window.CVT.app.rerender(); });
    $$('[data-unq]', root).forEach(b => b.addEventListener('click', () => { QA.setQueue(QA.queue().filter(k => k !== b.dataset.unq)); window.CVT.app.rerender(); }));
    $$('[data-rv]', root).forEach(b => b.addEventListener('click', async () => {
      const a = await S.getApp(b.dataset.id); if (!a) return;
      if (b.dataset.rv === 'applied') { a.status = 'Applied'; a.appliedAt = new Date().toISOString(); a.next = { text: 'Follow up if no reply', due: S.addDays(today(), 7) }; toast('Marked as applied. Follow-up set for 7 days.'); }
      else { a.status = 'Withdrawn'; delete a.autopilot; toast('Skipped. It stays in your pipeline as Withdrawn.'); }
      await S.saveApp(a); window.CVT.app.rerender();
    }));
    if (window.CVT._runQueue && qKeys.length && !running) { window.CVT._runQueue = false; qRun && (qRun.disabled = true); start(qKeys); }
    window.CVT._runQueue = false;
  }

  function summary(r) {
    return html`<ul class="tight small">
      <li>${r.cleaned ? `${r.cleaned} empty draft${r.cleaned > 1 ? 's' : ''} removed` : 'No empty drafts'}</li>
      <li>${r.found} new job${r.found === 1 ? '' : 's'} found</li>
      <li><strong>${r.prepared.length} application${r.prepared.length === 1 ? '' : 's'} prepared</strong>${r.prepared.length ? ': ' + r.prepared.map(p => `${p.label} (fit ${p.fit})`).join('; ') : ''}</li>
      ${r.skipped.length ? html`<li>${r.skipped.length} analysed and not recommended: ${r.skipped.map(s => s.label).join('; ')}</li>` : ''}
      ${r.stopped ? html`<li>Stopped by you</li>` : ''}
    </ul>
    ${r.needsAdvert.length ? html`<p class="small"><strong>Good matches needing the full advert</strong> (open, copy the whole advert, then paste it on the Job tab):</p><ul class="tight small">${r.needsAdvert.map(n => html`<li>${n.url ? html`<a class="link" href="${n.url}" target="_blank" rel="noopener">${n.title}</a>` : n.title} · ${n.company} · score ${n.score}</li>`)}</ul>` : ''}
    ${r.errors.length ? html`<p class="error small">${r.errors.slice(0, 3).join(' · ')}</p>` : ''}`;
  }

  window.CVT.autopilot = { view, run, isRunning: () => !!running };
})();
