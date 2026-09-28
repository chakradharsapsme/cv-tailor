/*
 * agent.js — the tailoring agent. Two Claude calls:
 *   1. analyse the job description against the CV and propose in-place edits
 *   2. write the cover letter from the approved, tailored CV
 * Calls go straight from your browser to the Anthropic API with your own key.
 */
(function () {
  const API = 'https://api.anthropic.com/v1';

  function headers(key) {
    return {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    };
  }

  async function listModels(key) {
    const res = await fetch(API + '/models?limit=100', { headers: headers(key) });
    if (!res.ok) throw await apiError(res);
    const data = await res.json();
    return (data.data || []).map(m => ({ id: m.id, name: m.display_name || m.id }));
  }

  async function apiError(res) {
    let msg = res.status + ' ' + res.statusText;
    try { const j = await res.json(); if (j.error && j.error.message) msg = j.error.message; } catch (_) {}
    if (res.status === 401) msg = 'The API key was rejected. Check it in Settings.';
    if (res.status === 429) msg = 'Rate limited by the API. Wait a minute and try again.';
    const e = new Error(msg); e.status = res.status; return e;
  }

  async function ask({ key, model, system, user, maxTokens = 12000, signal }) {
    const res = await fetch(API + '/messages', {
      method: 'POST', headers: headers(key), signal,
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] })
    });
    if (!res.ok) throw await apiError(res);
    const data = await res.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    return { text, stop: data.stop_reason };
  }

  function parseJSON(text) {
    let t = text.trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) t = fence[1];
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error('The model did not return JSON.');
    return JSON.parse(t.slice(a, b + 1));
  }

  const TAILOR_SYSTEM = `You are an expert UK CV writer and a senior SAP procurement practitioner (SAP Ariba, Source-to-Pay, Procure-to-Pay, SAP MM, Guided Buying, S/4HANA Sourcing & Procurement). You tailor a candidate's EXISTING CV to one job description.

The CV is a Word template. You may only change the TEXT of existing paragraphs. The layout must not move.

HARD RULES
1. No fabrication. Never invent or alter employers, clients, dates, job titles, certifications, degrees, locations, metrics, team sizes, tools or modules. Every claim must already be supported by the CV. Numbers must come from the CV.
2. Never edit paragraphs marked "locked", names, contact details, dates, job titles, employer or client names, education or certification lines.
3. Keep each edited paragraph within its original length: new text <= "chars" x 1.05 characters. Shorter is fine. This protects the page count.
4. If a paragraph has "segments" (runs with different formatting, e.g. a bold label then normal text), return "segments" with the SAME number of items, keeping labels as they are. Otherwise return "text".
5. Use the job description's exact terminology where it is TRUE for the candidate (e.g. "Procure-to-Pay (P2P)", "Guided Buying", "S/4HANA"). No keyword stuffing.
6. For adjacent roles (architecture, programme/delivery lead, procurement transformation), reframe genuine experience toward the target. Do not hide gaps in the CV; report them in "requirements" and "talking_points" instead.
7. You may: rewrite the profile/summary, reword bullets, reorder bullets inside one role (only adjacent bullets in the same list), reorder a skills list, and remove at most a few low-relevance bullets to make room. You may not add new paragraphs.
8. UK English spelling. Plain, confident, specific language. No clichés ("results-driven", "passionate", "dynamic").
9. Only include edits that genuinely improve fit. Unchanged paragraphs must not appear in "edits".

Reply with ONLY one JSON object, no commentary.`;

  function tailorPrompt({ jd, notes, company, role, paras }) {
    return `JOB DESCRIPTION
Company: ${company || '(not given)'}
Role: ${role || '(not given)'}
---
${jd.slice(0, 24000)}
---

CANDIDATE NOTES (things to emphasise; treat as true facts about the candidate)
${notes || '(none)'}

CV PARAGRAPHS (id, text, chars = current length; "locked" = do not edit; "bullet" = list item)
${JSON.stringify(paras)}

Return this JSON shape:
{
  "job": {"title": "", "company": "", "location": "", "contract_type": "permanent|contract|unknown", "seniority": "", "summary": "two sentences"},
  "requirements": [{"req": "short requirement", "type": "must|nice", "evidence": "direct|adjacent|gap", "cv_ids": [ids], "note": "how the CV covers it, or what is missing"}],
  "fit": {"score": 0-100, "core": 0-100, "adjacent": 0-100, "verdict": "one sentence"},
  "keywords": {"covered": ["JD keywords the tailored CV now contains"], "missing": ["JD keywords the candidate cannot truthfully claim"]},
  "edits": [{"id": 12, "text": "new text", "reason": "why"} or {"id": 14, "segments": ["Label: ", "new body"], "reason": "why"}],
  "reorder": [{"ids": [21, 23, 22], "reason": "new order of adjacent bullets"}],
  "remove": [{"id": 30, "reason": "why this bullet can go"}],
  "letterhead_ids": [ids of the candidate's name and contact-detail paragraphs at the top of the CV],
  "candidate_name": "",
  "talking_points": ["interview talking point, especially for gaps"]
}`;
  }

  const LETTER_SYSTEM = `You write UK cover letters for senior SAP procurement consultants. Rules: 250-350 words unless told otherwise; UK English; specific to this company and role; three concrete proof points taken ONLY from the CV text provided (never invent employers, numbers, clients or tools); no clichés ("I am writing to express", "passionate", "results-driven"); confident and plain; address gaps honestly only if helpful. Reply with ONLY one JSON object.`;

  function letterPrompt({ jd, notes, company, role, job, requirements, cvText, tone, name, hiringManager }) {
    return `ROLE: ${role || job.title || ''} at ${company || job.company || ''}
HIRING MANAGER: ${hiringManager || '(unknown: use "Dear Hiring Manager,")'}
TONE: ${tone}
CANDIDATE: ${name || '(use the name from the CV)'}

JOB SUMMARY: ${job.summary || ''}
KEY REQUIREMENTS AND EVIDENCE:
${JSON.stringify(requirements || []).slice(0, 6000)}

CANDIDATE NOTES: ${notes || '(none)'}

TAILORED CV TEXT:
${cvText.slice(0, 20000)}

JOB DESCRIPTION (for reference):
${jd.slice(0, 8000)}

Return:
{"salutation": "Dear ...,", "paragraphs": ["opening: role and why this company", "proof point paragraph(s)", "fit for the role's challenges", "close with availability and call to action"], "signoff": "Kind regards,", "name": "candidate name"}`;
  }

  async function tailor(opts) {
    const { text, stop } = await ask({ ...opts, system: TAILOR_SYSTEM, user: tailorPrompt(opts), maxTokens: 14000 });
    if (stop === 'max_tokens') throw new Error('The answer was cut short. Try a shorter job description.');
    const out = parseJSON(text);
    out.edits = Array.isArray(out.edits) ? out.edits : [];
    out.reorder = Array.isArray(out.reorder) ? out.reorder : [];
    out.remove = Array.isArray(out.remove) ? out.remove : [];
    out.requirements = Array.isArray(out.requirements) ? out.requirements : [];
    out.keywords = out.keywords || { covered: [], missing: [] };
    out.fit = out.fit || {};
    out.job = out.job || {};
    out.talking_points = out.talking_points || [];
    return out;
  }

  async function coverLetter(opts) {
    const { text } = await ask({ ...opts, system: LETTER_SYSTEM, user: letterPrompt(opts), maxTokens: 4000 });
    const out = parseJSON(text);
    if (!Array.isArray(out.paragraphs) || !out.paragraphs.length) throw new Error('The cover letter came back empty.');
    return out;
  }

  window.CVT = window.CVT || {};
  window.CVT.agent = { listModels, tailor, coverLetter, parseJSON, TAILOR_SYSTEM, LETTER_SYSTEM };
})();
