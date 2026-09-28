# CV Tailor

A personal job-search workspace for senior SAP procurement roles (SAP Ariba, S2P/P2P, SAP MM, S/4HANA). It works for any CV. It tailors your **Word CV without moving the template**, tells you whether a role is worth applying for, writes the letter and outreach, prepares you for interview, fills application forms (you approve every submit) and tracks the whole pipeline.

Live site: https://chakradharsapsme.github.io/cv-tailor/

## What's inside

| Area | What it does |
|---|---|
| **Dashboard** | Weekly goal, response and interview rates, overdue follow-ups, coach notes, and one-click LinkedIn/Indeed (last 24 h) and Reed searches for your target titles |
| **Pipeline** | Preparing → Applied → Screening → Interview → Offer → Closed. Cards show fit, decision and days since applying. Follow-ups are scheduled automatically. CSV export. |
| **Job** | Paste the advert. Details (company, location, type, pay, closing date) are filled in for you. |
| **Fit & decision** | Apply / apply with an angle / stretch / skip, red flags (IR35, rate, location, seniority), requirement-by-requirement evidence, ATS keyword coverage before → after |
| **CV** | In-place edits you accept, reject or reword, flags for anything not in your CV or profile, an ATS check, a side-by-side preview and a .docx download |
| **Cover letter** | Uses your CV's own fonts, header and letterhead. Editable, with a .docx download. |
| **Outreach** | LinkedIn note (≤ 300 chars), hiring-manager message, recruiter email, follow-up, thank-you |
| **Interview prep** | 60-second pitch, likely questions with STAR outlines from your real experience, topics to revise, honest gap answers, questions to ask, 90-day plan |
| **Apply** | Readiness checklist, drafted form and screening answers, an **autofill bookmarklet**, and "Mark as applied" |
| **Career profile** | Several master CVs, contact details for forms, targets, rate/salary and notice, an achievements bank, a "never claim" list, and LinkedIn headline/About suggestions |
| **Settings** | API key and model, bookmarklet install, JSON backup/restore, reset |

## Autofill: you stay in control

1. In **Settings** (or on an application's **Apply** tab), drag the **CV Tailor autofill** button to your bookmarks bar.
2. On the application's **Apply** tab, press **Copy autofill pack**.
3. Open the employer's form (Workday, Greenhouse, Lever, SmartRecruiters, SuccessFactors, Taleo…) and click the bookmark.
4. Recognised fields are filled and highlighted in yellow, and a panel lists what's left.

It **never submits**, never overwrites a field you have already filled, and cannot attach files. Browsers don't allow that, so you attach the downloaded CV yourself. On multi-page forms, click the bookmark on each page.

## Truthfulness

Every prompt forbids inventing employers, clients, dates, titles, certifications, numbers or tools. The agent may only use your CV, your career profile and your achievements bank, and it respects your "never claim" list. In the CV review, any number or product name that isn't in your own material is flagged before it can reach the document.

## Why the Word layout doesn't move

`js/docx-engine.js` edits the text inside your existing Word runs and never rebuilds the document.

- **Mixed formatting stays put.** A bold `Client:` label keeps its bold because text is edited segment by segment.
- **Some paragraphs are locked.** Anything with tabs, breaks, fields, images or tracked changes is never touched.
- **Length is capped.** Rewrites are limited to about the original length, which protects the page count.

## AI engine: pick a free option

| Engine | Cost | How |
|---|---|---|
| **Your Claude plan** | No extra cost | Open the claude.ai version of CV Tailor. It runs on the Claude subscription you already have, with no key. |
| **Google Gemini** | Free tier | Get a free key at [aistudio.google.com](https://aistudio.google.com/app/apikey) and choose Gemini in **Settings**. Daily limits apply, and free-tier prompts may be used by Google to improve its models. |
| **Anthropic API** | Pay as you go | Key from [console.anthropic.com](https://console.anthropic.com). |

## Setup

1. In **Settings**, choose an AI engine (see above).
2. In **Career profile**, upload your master CV (.docx), fill in contact details and targets, and add 5+ achievements with numbers.
3. Press **New application** and paste a job.

All data stays in your browser (IndexedDB). API calls go straight from your browser to Anthropic, and there is no server. Use **Settings → Export backup** regularly.

## Project layout

| Path | What it is |
|---|---|
| `index.html`, `assets/styles.css` | App shell and styles (light and dark) |
| `js/docx-engine.js` | Word parsing, in-place edits, cover letter builder, ATS checks, keyword coverage |
| `js/agent.js` | Prompts and Anthropic API calls |
| `js/store.js` | IndexedDB storage, statuses, follow-up rules, backup, v1 migration |
| `js/ui.js` | Shared helpers |
| `js/views.js` | Dashboard, Pipeline, Career profile, Settings |
| `js/workspace.js` | The application workspace (Job → Apply) |
| `js/autofill.js` | The autofill bookmarklet |
| `js/app.js` | Routing and startup |
| `tests/` | Demo CV generator, a test application form, and an end-to-end Playwright test with a mocked API |
| `docs/PROMPT.md` | The project brief |

## Running the test

```bash
npm i playwright jszip@3.10.1 docx-preview@0.3.5
mkdir -p samples && python3 tests/make_demo_cv.py
node tests/e2e.mjs /tmp/cvt-out
```

## Limits

- **LinkedIn pages can't be read by other sites.** Paste the job text instead of the link.
- **The page count in the preview is approximate.** Confirm it in Word.
- **Salary and rate guidance comes from your own figures and the advert.** The app has no market-rate data.
