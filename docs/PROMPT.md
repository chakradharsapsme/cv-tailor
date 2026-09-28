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
