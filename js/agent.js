/*
 * agent.js — the job-search agent. Every call goes straight from your browser
 * to the Anthropic API with your own key and returns JSON.
 *   analyse        fit decision + requirement evidence + in-place CV edits
 *   coverLetter    UK cover letter from the tailored CV
 *   outreach       LinkedIn note, hiring-manager message, recruiter email, follow-up, thank-you
 *   interviewPrep  likely questions with STAR outlines, topics, questions to ask, 90-day plan
 *   answers        "why this role", salary/notice wording, screening-question answers
 *   linkedin       headline and About section suggestions
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
    if (res.status === 529) msg = 'The API is overloaded right now. Try again in a minute.';
    const e = new Error(msg); e.status = res.status; return e;
  }

  async function ask({ key, model, system, user, maxTokens = 8000, signal }) {
    if (!key || !model) throw new Error('Add your API key and pick a model in Settings first.');
    const res = await fetch(API + '/messages', {
      method: 'POST', headers: headers(key), signal,
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] })
    });
    if (!res.ok) throw await apiError(res);
    const data = await res.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    if (data.stop_reason === 'max_tokens') throw new Error('The answer was cut short. Try a shorter job description.');
    return parseJSON(text);
  }

  function parseJSON(text) {
    let t = String(text).trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) t = fence[1];
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error('The model did not return JSON. Try again.');
    return JSON.parse(t.slice(a, b + 1));
  }

  // ---------- shared context ----------
  function profileBlock(p) {
    if (!p) return '(none)';
    const lines = [];
    const add = (k, v) => { if (v && String(v).trim()) lines.push(`${k}: ${v}`); };
    add('Name', p.name); add('Current title', p.currentTitle); add('Current employer', p.currentCompany);
    add('Location', [p.city, p.country].filter(Boolean).join(', '));
    add('Target roles', (p.targetRoles || []).join('; '));
    add('Preferred locations', (p.targetLocations || []).join('; '));
    add('Work preference', p.workPreference);
    add('Salary expectation', p.salary); add('Day rate expectation', p.dayRate);
    add('Notice / availability', p.notice); add('Work eligibility', p.eligibility);
    const ach = (p.achievements || []).filter(x => x && x.trim());
    if (ach.length) lines.push('Achievements bank (true, may be quoted):\n- ' + ach.join('\n- '));
    if (p.neverClaim && p.neverClaim.trim()) lines.push('NEVER claim or imply: ' + p.neverClaim.trim());
    return lines.join('\n') || '(none)';
  }
  const jobBlock = a => [
    `Company: ${a.company || '(not given)'}`, `Role: ${a.role || '(not given)'}`,
    a.location ? `Location: ${a.location}` : '', a.workMode ? `Work mode: ${a.workMode}` : '',
    a.contractType ? `Type: ${a.contractType}` : '', a.pay ? `Pay as advertised: ${a.pay}` : ''
  ].filter(Boolean).join('\n');

  const TRUTH = `TRUTH RULES (non-negotiable)
- Use only facts from the CV text, the candidate profile and the achievements bank. Never invent employers, clients, dates, titles, certifications, numbers, team sizes, tools or modules.
- Respect the "NEVER claim" list.
- Where the candidate lacks something, say so plainly and suggest how to position adjacent experience honestly.
- UK English. Plain, specific, confident. No clichés ("passionate", "results-driven", "dynamic", "I am writing to express").`;

  // ---------- 1. analyse + tailor ----------
  const ANALYSE_SYSTEM = `You are a senior UK job-search coach and an experienced SAP procurement practitioner (SAP Ariba, Source-to-Pay, Procure-to-Pay, SAP MM, Guided Buying, S/4HANA Sourcing & Procurement, SAP Business Network, CIG/Integration Suite). You assess a job for the candidate and tailor their EXISTING Word CV to it.

${TRUTH}

CV EDITING RULES (the Word template must not move)
1. You may only change the TEXT of existing paragraphs. Never edit paragraphs marked "locked", names, contact details, dates, job titles, employer or client names, education or certification lines.
2. Keep each edited paragraph within its original length: new text <= "chars" x 1.05. Shorter is fine.
3. If a paragraph has "segments" (runs with different formatting, e.g. a bold label then normal text), return "segments" with the SAME number of items, keeping labels unchanged. Otherwise return "text".
4. Mirror the job's exact terminology only where it is TRUE for the candidate. No keyword stuffing.
5. Allowed: rewrite the profile/summary, reword bullets, reorder adjacent bullets inside one role, reorder a skills list, remove a few low-relevance bullets. No new paragraphs.
6. Only include edits that genuinely improve fit.

DECISION GUIDANCE
- "apply": strong match on most must-haves.
- "apply_with_angle": good match if positioned well; give the angle in one sentence.
- "stretch": several must-haves missing but credible adjacent experience; say what would make it worth it.
- "skip": clear mismatch or deal-breakers against the candidate's stated preferences.
- Red flags to look for: IR35 status for contracts, day rate or salary below the candidate's expectation, location/commute or on-site days vs preference, seniority mismatch, vague or recycled agency ads, very short contracts, unrealistic "unicorn" requirement lists, clearance or eligibility requirements.

Reply with ONLY one JSON object.`;

  function analysePrompt({ app, profile, paras }) {
    return `JOB
${jobBlock(app)}
---
${(app.jd || '').slice(0, 24000)}
---

CANDIDATE PROFILE (confirmed by the candidate)
${profileBlock(profile)}

THINGS TO EMPHASISE FOR THIS JOB (true)
${app.emphasis || '(none)'}

CV PARAGRAPHS (id, text, chars = current length; "locked" = do not edit; "bullet" = list item)
${JSON.stringify(paras)}

Return this JSON shape:
{
  "job": {"title": "", "company": "", "location": "", "work_mode": "onsite|hybrid|remote|unknown", "contract_type": "permanent|contract|fixed-term|unknown", "pay": "as stated or empty", "ir35": "inside|outside|unknown|n/a", "closing_date": "", "agency": "", "seniority": "", "summary": "two sentences"},
  "decision": {"verdict": "apply|apply_with_angle|stretch|skip", "headline": "one sentence", "reasons": ["why"], "red_flags": ["concern"], "angle": "how to position the application"},
  "requirements": [{"req": "short requirement", "type": "must|nice", "evidence": "direct|adjacent|gap", "cv_ids": [ids], "note": "how the CV covers it, or what is missing"}],
  "fit": {"score": 0-100, "core": 0-100, "adjacent": 0-100},
  "keywords": ["8-20 exact terms from the job an ATS would scan for"],
  "keywords_missing": ["job terms the candidate cannot truthfully claim"],
  "edits": [{"id": 12, "text": "new text", "reason": "why"} or {"id": 14, "segments": ["Label: ", "new body"], "reason": "why"}],
  "reorder": [{"ids": [21, 23, 22], "reason": "new order of adjacent bullets"}],
  "remove": [{"id": 30, "reason": "why this bullet can go"}],
  "letterhead_ids": [ids of the candidate's name and contact-detail paragraphs at the top of the CV],
  "candidate_name": "",
  "talking_points": ["point to raise with the recruiter or interviewer, especially for gaps"]
}`;
  }

  async function analyse(opts) {
    const out = await ask({ ...opts, system: ANALYSE_SYSTEM, user: analysePrompt(opts), maxTokens: 16000 });
    const arr = v => Array.isArray(v) ? v : [];
    out.job = out.job || {}; out.decision = out.decision || {}; out.fit = out.fit || {};
    out.decision.reasons = arr(out.decision.reasons); out.decision.red_flags = arr(out.decision.red_flags);
    ['requirements', 'keywords', 'keywords_missing', 'edits', 'reorder', 'remove', 'letterhead_ids', 'talking_points'].forEach(k => { out[k] = arr(out[k]); });
    return out;
  }

  // ---------- 2. cover letter ----------
  const LETTER_SYSTEM = `You write UK cover letters for senior SAP procurement consultants. 250-350 words unless told otherwise. Specific to this company and role. Three concrete proof points taken only from the CV text, profile or achievements bank. Address the job's top two requirements directly. End with availability and a clear next step.

${TRUTH}

Reply with ONLY one JSON object.`;

  function letterPrompt({ app, profile, cvText }) {
    const an = app.analysis || {};
    return `${jobBlock(app)}
HIRING MANAGER: ${app.hiringManager || '(unknown: use "Dear Hiring Manager,")'}
TONE: ${app.tone || 'Warm and direct'}
POSITIONING ANGLE: ${(an.decision && an.decision.angle) || '(none)'}

CANDIDATE PROFILE
${profileBlock(profile)}

KEY REQUIREMENTS AND EVIDENCE
${JSON.stringify(an.requirements || []).slice(0, 6000)}

EMPHASISE (true): ${app.emphasis || '(none)'}

TAILORED CV TEXT
${(cvText || '').slice(0, 20000)}

JOB DESCRIPTION
${(app.jd || '').slice(0, 8000)}

Return:
{"salutation": "Dear ...,", "paragraphs": ["opening: the role and why this company", "proof point paragraph(s)", "how you'd tackle their priorities", "close with availability and next step"], "signoff": "Kind regards,", "name": "candidate name"}`;
  }
  async function coverLetter(opts) {
    const out = await ask({ ...opts, system: LETTER_SYSTEM, user: letterPrompt(opts), maxTokens: 4000 });
    if (!Array.isArray(out.paragraphs) || !out.paragraphs.length) throw new Error('The cover letter came back empty. Try again.');
    return out;
  }

  // ---------- 3. outreach ----------
  const OUTREACH_SYSTEM = `You are a UK job-search coach who writes short, human outreach for senior SAP consultants. Messages must be specific to the role, easy to reply to, and never grovelling. LinkedIn connection notes must be 300 characters or fewer.

${TRUTH}

Reply with ONLY one JSON object.`;
  function outreachPrompt({ app, profile, cvText }) {
    const an = app.analysis || {};
    return `${jobBlock(app)}
RECRUITER: ${app.recruiter || '(unknown)'}${app.agency ? ' at ' + app.agency : ''}
HIRING MANAGER: ${app.hiringManager || '(unknown)'}
STATUS: ${app.status}
POSITIONING ANGLE: ${(an.decision && an.decision.angle) || '(none)'}
TOP EVIDENCE: ${JSON.stringify((an.requirements || []).filter(r => r.evidence === 'direct').slice(0, 5))}

CANDIDATE PROFILE
${profileBlock(profile)}

CV TEXT
${(cvText || '').slice(0, 12000)}

Return:
{
  "linkedin_note": "connection request to the hiring manager or recruiter, <= 300 characters",
  "hiring_manager": {"subject": "", "body": "LinkedIn message or email to the hiring manager, 80-130 words"},
  "recruiter": {"subject": "", "body": "email to the recruiter/agency: interest, 3 bullet proof points, rate/salary and notice if known, availability for a call; 100-160 words"},
  "follow_up": {"subject": "", "body": "polite follow-up 7 days after applying, 50-90 words"},
  "thank_you": {"subject": "", "body": "thank-you after an interview, referencing one thing discussed as a placeholder [topic], 60-100 words"}
}`;
  }
  const outreach = opts => ask({ ...opts, system: OUTREACH_SYSTEM, user: outreachPrompt(opts), maxTokens: 4000 });

  // ---------- 4. interview prep ----------
  const INTERVIEW_SYSTEM = `You are an interview coach for senior SAP procurement roles in the UK (consultant, solution architect, programme/delivery lead). You prepare the candidate using ONLY their real experience. STAR outlines must reference real CV evidence; where evidence is missing, say how to answer honestly.

${TRUTH}

Reply with ONLY one JSON object.`;
  function interviewPrompt({ app, profile, cvText }) {
    const an = app.analysis || {};
    return `${jobBlock(app)}
JOB DESCRIPTION
${(app.jd || '').slice(0, 12000)}

REQUIREMENTS AND EVIDENCE
${JSON.stringify(an.requirements || []).slice(0, 6000)}

CANDIDATE PROFILE
${profileBlock(profile)}

CV TEXT
${(cvText || '').slice(0, 16000)}

Return:
{
  "pitch": "60-second 'tell me about yourself' tailored to this role",
  "questions": [{"q": "likely question", "type": "technical|behavioural|situational|motivation", "why": "what they are testing", "answer": "STAR outline or key points from the candidate's real experience"}],
  "topics": ["SAP / process topics to revise before the interview, specific to this job"],
  "gaps": [{"gap": "missing requirement", "how": "honest way to answer"}],
  "ask_them": ["sharp questions for the candidate to ask"],
  "plan_90": {"first_30": ["..."], "days_31_60": ["..."], "days_61_90": ["..."]}
}
Give 10-14 questions, at least 4 technical.`;
  }
  const interviewPrep = opts => ask({ ...opts, system: INTERVIEW_SYSTEM, user: interviewPrompt(opts), maxTokens: 9000 });

  // ---------- 5. application answers ----------
  const ANSWERS_SYSTEM = `You draft answers for online job application forms (Workday, Greenhouse, Lever, SuccessFactors, Taleo). Answers are concise, specific and true. Respect any character limit given. ${TRUTH}
Reply with ONLY one JSON object.`;
  function answersPrompt({ app, profile, cvText, questions }) {
    return `${jobBlock(app)}
POSITIONING ANGLE: ${(app.analysis && app.analysis.decision && app.analysis.decision.angle) || '(none)'}

CANDIDATE PROFILE
${profileBlock(profile)}

CV TEXT
${(cvText || '').slice(0, 12000)}

JOB DESCRIPTION
${(app.jd || '').slice(0, 6000)}

SCREENING QUESTIONS TO ANSWER (may be empty)
${JSON.stringify(questions || [])}

Return:
{
  "why": "Why do you want this role / why this company? 80-120 words",
  "salary": "one-line answer to the salary or day-rate question using the candidate's stated expectation; if none, a polite 'open to discuss' line",
  "notice": "one-line notice period / availability answer from the profile, or empty",
  "qa": [{"q": "question exactly as given", "a": "answer"}]
}`;
  }
  const answers = opts => ask({ ...opts, system: ANSWERS_SYSTEM, user: answersPrompt(opts), maxTokens: 4000 });

  // ---------- 6. LinkedIn profile ----------
  const LINKEDIN_SYSTEM = `You optimise LinkedIn profiles for senior SAP procurement consultants in the UK so recruiters find them for their target roles. ${TRUTH}
Reply with ONLY one JSON object.`;
  function linkedinPrompt({ profile, cvText }) {
    return `CANDIDATE PROFILE
${profileBlock(profile)}

CV TEXT
${(cvText || '').slice(0, 16000)}

Return:
{
  "headlines": ["3 headline options, each <= 220 characters, keyword-rich for recruiter search"],
  "about": "About section, 180-260 words, first two lines must hook; end with what roles they're open to",
  "skills": ["top 10 skills to pin/list, in priority order"],
  "open_to_work": ["job titles to add to Open to Work"],
  "tips": ["3-5 specific improvements"]
}`;
  }
  const linkedin = opts => ask({ ...opts, system: LINKEDIN_SYSTEM, user: linkedinPrompt(opts), maxTokens: 4000 });

  window.CVT = window.CVT || {};
  window.CVT.agent = { listModels, analyse, coverLetter, outreach, interviewPrep, answers, linkedin, parseJSON, profileBlock };
})();
