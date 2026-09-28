# Project brief: CV and cover-letter tailoring agent

**Goal.** A personal website plus an agent. It takes a master Word CV and a job description, and produces:

- a tailored CV that is visually identical to the master: same fonts, sizes, margins, colours, section order, headers and footers, and page count
- a UK cover letter of 250–350 words in the same style
- a match report covering fit score, requirement evidence (direct / adjacent / gap), keyword coverage, the change log and interview talking points

**Hard rules**

- No fabrication. Every claim must trace to the master CV or to facts the candidate confirmed.
- Only the text changes. Existing paragraphs and runs are edited in place, and sections, tables and styles are never added or removed.
- Allowed changes: rewrite the summary, reword or reorder bullets within a role, reorder the skills list, use JD terminology where it's true, and trim low-relevance bullets to hold the page count.
- For adjacent roles, reframe real experience and report gaps honestly instead of hiding them.
- The CV must be ATS-safe and follow UK conventions.

**Workflow.** Parse the JD, map requirements to CV evidence, propose a diff, approve it, then generate the .docx, write the cover letter and log the application.

**Out of scope for v1.** Auto-applying on LinkedIn, and scraping behind a login.

## v2 additions

- **Job-search workspace.** A dashboard (goal, rates, due actions, coach notes, job-board shortcuts), a pipeline board with automatic follow-ups, and a per-application workspace.
- **Fit decision.** Apply / apply with an angle / stretch / skip, with red flags covering IR35, rate, location, seniority and eligibility.
- **Outreach.** A LinkedIn note, hiring-manager message, recruiter email, follow-up and thank-you.
- **Interview prep.** A pitch, STAR outlines from real experience, topics, gap handling, questions to ask and a 90-day plan.
- **Apply.** Drafted form and screening answers, plus an autofill bookmarklet that fills recognised fields and never submits. The candidate gives final approval.
- **Career profile.** Multiple master CVs, an achievements bank, a never-claim list and LinkedIn optimisation.
- **Storage.** Local IndexedDB with JSON backup and restore.
