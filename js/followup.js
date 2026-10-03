/*
 * followup.js — the "follow-up kit" attached to each next action: a ready-to-send message for the recruiter,
 * hiring manager or interviewer (email + short LinkedIn version), picked by the application's stage.
 * Written from your application and profile with templates (no AI, free). You edit it, copy it, open it in
 * your email app or save it as an email draft file. Nothing is ever sent by Applywise.
 */
(function () {
  const ukDate = d => { try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }); } catch (_) { return ''; } };
  const first = n => String(n || '').trim().split(/\s+/)[0] || '';
  const ago = d => { const n = Math.round((Date.now() - new Date(d)) / 864e5); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n < 7 ? `on ${new Date(d).toLocaleDateString('en-GB', { weekday: 'long' })}` : `on ${ukDate(d)}`; };

  /** Which message this action needs. */
  function kindOf(a) {
    const t = String((a.next && a.next.text) || '').toLowerCase();
    if (/thank/.test(t) || a.status === 'Interview') return 'thanks';
    if (/offer/.test(t) || a.status === 'Offer') return 'offer';
    if (/screen/.test(t) || a.status === 'Screening') return 'screening';
    return 'chase';
  }
  const KIND = { chase: 'Follow-up to the recruiter', thanks: 'Thank-you to the interviewer', screening: 'Note before the screening call', offer: 'Reply to the offer' };

  /** Two strengths the analysis says the CV shows directly (or the top keywords). */
  function strengths(a) {
    const an = a.analysis && !a.analysis.legacy ? a.analysis : null;
    const direct = an ? (an.requirements || []).filter(r => r.evidence === 'direct' && r.type !== 'nice').map(r => r.req) : [];
    const pick = (direct.length ? direct : (an && an.keywords) || []).map(x => String(x).replace(/\.$/, '')).filter(x => x.length < 70).slice(0, 2);
    return pick;
  }

  function draft(a, p) {
    p = p || {};
    const kind = kindOf(a), role = a.role || 'the role', co = a.company || 'your organisation';
    const toName = kind === 'thanks' ? (a.hiringManager || a.recruiter || '') : (a.recruiter || a.hiringManager || '');
    const hello = toName ? `Dear ${first(toName)},` : kind === 'thanks' ? 'Dear [interviewer name],' : 'Dear Hiring Manager,';
    const sign = ['Kind regards,', p.name || '[Your name]', p.phone || '', p.email || ''].filter(Boolean).join('\n');
    const s = strengths(a), sLine = s.length ? s.join(' and ') : '';
    const applied = a.appliedAt ? ago(a.appliedAt) : 'recently';
    let subject, body, linkedin;
    if (kind === 'thanks') {
      subject = `Thank you – ${role} interview`;
      body = `${hello}\n\nThank you for taking the time to meet me to discuss the ${role} role at ${co}. I enjoyed hearing about [something you discussed, e.g. the programme's next phase], and it has confirmed my interest in the role.\n\n${sLine ? `Our conversation reinforced how my experience with ${sLine} could help the team from the start.` : 'Our conversation reinforced how my experience could help the team from the start.'} If it would help, I am happy to share more detail on [a topic they asked about].\n\nThank you again, and I look forward to hearing about the next steps.\n\n${sign}`;
      linkedin = `Hi ${first(toName) || '[name]'}, thank you for your time today discussing the ${role} role. I enjoyed the conversation about [topic] and I'm keen on the opportunity. Look forward to hearing about next steps.`;
    } else if (kind === 'screening') {
      subject = `${role} – screening call`;
      body = `${hello}\n\nThank you for arranging the screening call for the ${role} role at ${co}. I am looking forward to speaking with you.\n\n${sLine ? `Ahead of the call, the areas I would most like to cover are my experience with ${sLine}.` : 'Ahead of the call, please let me know if there is anything you would like me to prepare.'} Please let me know if the time needs to change.\n\n${sign}`;
      linkedin = `Hi ${first(toName) || '[name]'}, thanks for setting up the call about the ${role} role at ${co}. Looking forward to speaking with you.`;
    } else if (kind === 'offer') {
      subject = `Offer – ${role}`;
      body = `${hello}\n\nThank you very much for the offer for the ${role} role at ${co}. I am delighted and very interested.\n\nCould you please send the written offer and contract so I can review the details, including [salary / day rate, start date, notice, working pattern]? I will come back to you by [date].\n\nThank you again for your support through the process.\n\n${sign}`;
      linkedin = `Hi ${first(toName) || '[name]'}, thank you for the offer for the ${role} role. Very pleased. I'll review the written details and come back to you by [date].`;
    } else {
      subject = `${role} – application follow-up`;
      body = `${hello}\n\nI applied for the ${role} role at ${co} ${applied} and wanted to follow up, as I remain very interested in the position.\n\n${sLine ? `My background in ${sLine} matches what the role asks for, and I would welcome the chance to discuss how I could help ${co}.` : `I would welcome the chance to discuss how my experience could help ${co}.`} Please let me know if you need anything further from me.\n\nThank you for your time.\n\n${sign}`;
      linkedin = `Hi ${first(toName) || '[name]'}, I applied for the ${role} role at ${co} ${applied} and remain very interested. ${sLine ? `My experience in ${s[0]} fits the brief well. ` : ''}Happy to talk whenever suits.`;
    }
    // A message the AI already wrote on the Outreach tab is better than a template.
    const o = a.outreach || {};
    const ai = kind === 'thanks' ? o.thank_you : kind === 'chase' ? o.follow_up : null;
    if (ai && ai.body) { subject = ai.subject || subject; body = ai.body; }
    const saved = (a.followDraft || {})[kind];
    return Object.assign({ kind, label: KIND[kind], to: a.recruiterEmail || '', toName, subject, body, linkedin, fromAi: !!(ai && ai.body) }, saved || {});
  }

  /** An email draft file (.eml) that opens as an unsent message in Outlook, Apple Mail or Thunderbird. */
  function eml(d) {
    const enc = s => /[^\x20-\x7e]/.test(s) ? '=?UTF-8?B?' + btoa(unescape(encodeURIComponent(s))) + '?=' : s;
    return ['To: ' + (d.to || ''), 'Subject: ' + enc(d.subject || ''), 'X-Unsent: 1', 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '', String(d.body || '').replace(/\r?\n/g, '\r\n')].join('\r\n');
  }

  function card(a, d) {
    const { html } = window.CVT.ui;
    const file = `${(a.company || 'job').replace(/[^\w]+/g, '_')}_${d.kind === 'thanks' ? 'thank_you' : 'follow_up'}.eml`;
    return html`<div class="fu-att" data-fu="${a.id}" data-kind="${d.kind}">
      <div class="fu-file"><span class="fu-ic" aria-hidden="true">📎</span><span><strong>${file}</strong><span class="muted small"> · ${d.label}${d.fromAi ? ' · written by AI on the Outreach tab' : ''}</span></span></div>
      <div class="fu-grid">
        <label class="field"><span>To</span><input data-fk="to" type="email" value="${d.to}" placeholder="recruiter@agency.com (add it on the Job tab to keep it)"></label>
        <label class="field"><span>Subject</span><input data-fk="subject" type="text" value="${d.subject}"></label>
      </div>
      <label class="field"><span>Message</span><textarea data-fk="body" rows="10">${d.body}</textarea></label>
      <p class="muted small">Replace anything in [square brackets] before sending. Your edits are kept with this application.</p>
      <details class="fu-li"><summary class="small">Short LinkedIn version</summary><textarea data-fk="linkedin" rows="3">${d.linkedin}</textarea></details>
      <div class="row gap wrap">
        <button class="btn primary small" type="button" data-fu-act="copy">Copy email</button>
        <button class="btn ghost small" type="button" data-fu-act="mail">Open in my email app</button>
        <button class="btn ghost small" type="button" data-fu-act="eml">⬇ Save as email draft (.eml)</button>
        <button class="btn ghost small" type="button" data-fu-act="li">Copy LinkedIn note</button>
        <a class="btn ghost small" href="#/app/${a.id}/outreach">✨ Personalise with AI</a>
        <button class="btn ghost small" type="button" data-fu-act="sent" title="Log it and schedule the next follow-up">✓ I sent it</button>
      </div>
    </div>`;
  }

  /** Wire a container holding one or more cards. getApp returns the latest application. */
  function wire(root) {
    const S = window.CVT.store, { toast, copy } = window.CVT.ui;
    const read = el => ({ to: el.querySelector('[data-fk="to"]').value.trim(), subject: el.querySelector('[data-fk="subject"]').value, body: el.querySelector('[data-fk="body"]').value, linkedin: el.querySelector('[data-fk="linkedin"]').value });
    let t = null;
    root.addEventListener('input', e => {
      const el = e.target.closest('.fu-att'); if (!el || !e.target.dataset.fk) return;
      clearTimeout(t); t = setTimeout(async () => {
        const a = await S.getApp(el.dataset.fu); if (!a) return;
        a.followDraft = Object.assign({}, a.followDraft, { [el.dataset.kind]: read(el) });
        if (e.target.dataset.fk === 'to' && /@/.test(e.target.value) && !a.recruiterEmail) a.recruiterEmail = e.target.value.trim();
        await S.saveApp(a);
      }, 500);
    });
    root.addEventListener('click', async e => {
      const b = e.target.closest('[data-fu-act]'); if (!b) return;
      const el = b.closest('.fu-att'), d = read(el), act = b.dataset.fuAct;
      if (act === 'copy') return copy(`Subject: ${d.subject}\n\n${d.body}`, b);
      if (act === 'li') return copy(d.linkedin, b);
      if (act === 'mail') { const u = `mailto:${encodeURIComponent(d.to)}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`; const w = window.open(u, '_blank'); if (!w) location.href = u; return; }
      if (act === 'sent') { const a = await S.getApp(el.dataset.fu); if (!a) return; markSent(a, el.dataset.kind); await S.saveApp(a); toast('Logged as sent. The next follow-up is scheduled.'); window.CVT.app.rerender(); return; }
      if (act === 'eml') { const a = await S.getApp(el.dataset.fu); await window.CVT.ui.download(new Blob([eml(d)], { type: 'message/rfc822' }), `${((a && a.company) || 'job').replace(/[^\w]+/g, '_')}_${el.dataset.kind === 'thanks' ? 'thank_you' : 'follow_up'}.eml`); toast('Saved: open the file to send it from your email app'); }
    });
  }

  /** Record that the message went out, and schedule the sensible next follow-up. */
  function markSent(a, kind) {
    const S = window.CVT.store, today = new Date().toISOString().slice(0, 10);
    a.followLog = (a.followLog || []).concat({ kind, at: new Date().toISOString(), to: (a.followDraft && a.followDraft[kind] && a.followDraft[kind].to) || a.recruiterEmail || '' });
    const nextText = { chase: 'Follow up again if no reply', thanks: 'Chase for interview feedback if no news', screening: 'Follow up after the screening call', offer: 'Confirm the offer details in writing' }[kind];
    a.next = { text: nextText, due: S.addDays(today, kind === 'offer' ? 3 : 7) };
    return a;
  }
  const ACTIVE = ['Applied', 'Screening', 'Interview', 'Offer'];

  /** Overview of every follow-up: what's overdue, due, coming up and already sent. */
  function overview(apps, profile) {
    const { html } = window.CVT.ui;
    const today = new Date().toISOString().slice(0, 10), week = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), fortnightAgo = Date.now() - 14 * 864e5;
    const rows = apps.filter(a => (a.next && a.next.due) || (ACTIVE.includes(a.status) && (a.followLog || []).length))
      .map(a => ({ a, d: draft(a, profile), last: (a.followLog || []).slice(-1)[0] || null }))
      .sort((x, y) => ((x.a.next && x.a.next.due) || '9999').localeCompare((y.a.next && y.a.next.due) || '9999'));
    const due = r => r.a.next && r.a.next.due;
    const n = { overdue: rows.filter(r => due(r) && due(r) < today).length, today: rows.filter(r => due(r) === today).length, week: rows.filter(r => due(r) && due(r) > today && due(r) <= week).length,
      sent: apps.reduce((m, a) => m + (a.followLog || []).filter(x => new Date(x.at) > fortnightAgo).length, 0) };
    const when = d => { if (!d) return html`<span class="muted small">None set</span>`; const days = Math.round((new Date(d) - new Date(today)) / 864e5); return html`<span class="chip ${days < 0 ? 'bad' : days === 0 ? 'warn' : 'muted'}">${days < 0 ? `${-days}d overdue` : days === 0 ? 'Today' : `In ${days}d`}</span>`; };
    const tile = (v, l, c) => html`<div class="fo-tile ${c}"><strong>${v}</strong><span>${l}</span></div>`;
    return html`<div class="panel-head"><h2>Follow-up overview</h2><a class="link" href="#/pipeline">Pipeline</a></div>
      <div class="fo-tiles">${tile(n.overdue, 'Overdue', n.overdue ? 'bad' : '')}${tile(n.today, 'Due today', n.today ? 'warn' : '')}${tile(n.week, 'Next 7 days', '')}${tile(n.sent, 'Sent in 14 days', n.sent ? 'ok' : '')}</div>
      ${rows.length ? html`<ul class="fo-list">
        ${rows.map(({ a, d, last }) => html`<li class="${a.next && a.next.due < today ? 'fo-late' : ''}">
          <div class="fo-row">
            <div class="fo-job"><a href="#/app/${a.id}/job">${a.role || 'Role'}</a><span class="muted small">${a.company || ''} · <span class="status s-${String(a.status || '').toLowerCase()}">${a.status}</span></span></div>
            <div class="fo-meta small">
              <span><span class="muted">To:</span> ${d.toName || 'not set'}${a.recruiterEmail ? ` (${a.recruiterEmail})` : ''}</span>
              <span><span class="muted">Next:</span> ${a.next ? html`${d.label} ${when(a.next.due)}` : 'nothing scheduled'}</span>
              <span><span class="muted">Last sent:</span> ${last ? `${new Date(last.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} (${(KIND[last.kind] || '').toLowerCase()})` : 'not yet'}</span>
            </div>
            ${a.next ? html`<div class="fo-acts"><button class="btn ghost small" type="button" data-fo="open" data-id="${a.id}" aria-expanded="false">📎 Message</button><button class="btn primary small" type="button" data-fo="sent" data-id="${a.id}" title="I sent it: log it and schedule the next follow-up">✓ Sent</button></div>` : ''}
          </div>
          <div class="fo-slot" id="fo-${a.id}" hidden></div>
        </li>`)}
      </ul>`
      : html`<p class="empty-note">No follow-ups yet. When you mark a job as applied, a follow-up is scheduled and its message is drafted for you.</p>`}`;
  }

  /** Clicks inside the overview: open the message, or log it as sent. */
  function wireOverview(root) {
    const S = window.CVT.store, { toast } = window.CVT.ui;
    root.addEventListener('click', async e => {
      const b = e.target.closest('[data-fo]'); if (!b) return;
      const a = await S.getApp(b.dataset.id); if (!a) return;
      if (b.dataset.fo === 'open') {
        const slot = b.closest('li').querySelector('.fo-slot'); if (!slot) return;
        slot.hidden = !slot.hidden; b.setAttribute('aria-expanded', String(!slot.hidden));
        if (!slot.hidden && !slot.firstElementChild) slot.innerHTML = String(card(a, draft(a, await S.getProfile())));
        return;
      }
      if (b.dataset.fo === 'sent') { markSent(a, kindOf(a)); await S.saveApp(a); toast(`Logged as sent. Next: ${a.next.text.toLowerCase()} in ${a.next.due === new Date().toISOString().slice(0, 10) ? '0' : Math.round((new Date(a.next.due) - Date.now()) / 864e5) + 1} days`); window.CVT.app.rerender(); }
    });
  }

  window.CVT = window.CVT || {};
  window.CVT.followup = { draft, card, wire, eml, kindOf, markSent, overview, wireOverview };
})();
