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
      if (act === 'eml') { const a = await S.getApp(el.dataset.fu); await window.CVT.ui.download(new Blob([eml(d)], { type: 'message/rfc822' }), `${((a && a.company) || 'job').replace(/[^\w]+/g, '_')}_${el.dataset.kind === 'thanks' ? 'thank_you' : 'follow_up'}.eml`); toast('Saved: open the file to send it from your email app'); }
    });
  }

  window.CVT = window.CVT || {};
  window.CVT.followup = { draft, card, wire, eml, kindOf };
})();
