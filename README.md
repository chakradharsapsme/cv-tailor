# CV Tailor

A personal web app and agent that tailors a **Word CV** to a job description **without changing the template**, then writes a matching cover letter. It's built for SAP Ariba, S2P/P2P, SAP MM and S/4HANA roles, but it works with any CV.

## How it works

1. **Master CV.** Upload your `.docx` CV once. It stays in your browser.
2. **Job description.** Paste the advert from LinkedIn. You can add notes on what to emphasise.
3. **Agent.** Claude compares the job with your CV and sends back:
   - a fit score with a requirement-by-requirement evidence map (direct / adjacent / gap)
   - keywords you cover and keywords you're missing
   - proposed in-place edits to your CV
   - interview talking points
4. **Review.** Every change is shown as a word-level diff that you can accept, reject or reword. The app flags:
   - any number or product name that isn't in your master CV
   - JD terms you should only keep if they're true
   - text that is longer than the original
5. **Documents.** Download the tailored CV and a cover letter (both `.docx`), compare them side by side with the master, and log the application to your tracker.

### Why the layout doesn't move

The engine (`js/docx-engine.js`) edits the text inside the existing Word runs. It never rebuilds the document. So fonts, sizes, colours, bullets, tables, margins, headers and footers all stay the same.

- Paragraphs with mixed formatting, such as a bold `Client:` label followed by normal text, are edited segment by segment, so the bold stays bold.
- Paragraphs that contain tabs, line breaks, fields, images or tracked changes are **locked** and never touched. Your letterhead and contact line are usually among them.
- The agent may rewrite text, reorder adjacent bullets and remove a few low-value bullets. It can't add paragraphs.
- Each rewrite has a character budget of about 105% of the original, which protects the page count.

The cover letter reuses the CV's own page setup, fonts, header, footer and letterhead.

## Setup

1. Get an API key from [console.anthropic.com](https://console.anthropic.com).
2. Open the site and go to **Settings**. Paste the key, then choose **Save and test**. Pick a Sonnet or Opus model.
3. Go to **Tailor**. Upload your CV, paste a job and run it.

The key, your CV and your application tracker are stored only in your browser's local storage. API calls go straight from your browser to Anthropic, and there is no server.

## Hosting on GitHub Pages

In the repo, open **Settings → Pages**. Under **Source**, choose *Deploy from a branch*, then pick `main` and `/ (root)`. The site will be at `https://<your-user>.github.io/cv-tailor/`.

Keep the repository **private** if you commit anything personal. The app itself never commits your CV.

## Project layout

| Path | What it is |
|---|---|
| `index.html`, `assets/styles.css` | The app shell and styles |
| `js/docx-engine.js` | Opens the .docx, maps paragraphs and segments, and applies edits in place. Also builds the cover letter. |
| `js/agent.js` | Prompts and Anthropic API calls (tailoring and cover letter) |
| `js/app.js` | UI: review, diffs, fact flags, downloads, applications tracker |
| CDN | JSZip (cdnjs) and docx-preview (jsDelivr), pinned versions |
| `tests/` | Fictional demo CV generator and an end-to-end Playwright test with a mocked API |
| `docs/PROMPT.md` | The project brief this was built from |

## Running the test

```bash
npm i playwright jszip@3.10.1 docx-preview@0.3.5   # once
mkdir -p samples && python3 tests/make_demo_cv.py
node tests/e2e.mjs /tmp/cvt-out
```

## Limits

- **LinkedIn links can't be fetched.** LinkedIn blocks cross-site reads, so paste the job text instead.
- **The page count in the preview is approximate.** Open the file in Word to confirm it.
- **PDF CVs aren't supported.** Save your CV as .docx first.
