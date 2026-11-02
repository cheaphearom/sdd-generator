# BRD → SDD Generator

Upload a **Business Requirements Document (BRD)** and get a **Software Design Document (SDD)** back as **Word (.docx)** and **PDF**.

The SDD follows the house template (*SDD_Simple1_1*): cover page, table of contents, 16 numbered sections and appendices A–B. It includes:

- architecture, data-flow, ER, program-flow and UML sequence diagrams
- tables with brown headers and alternating cream rows
- consistent IDs that link across sections: F-xx, FR-xx, NFR-xx, TC-xx, AC-xx and OD-xx

See `examples/` for a full sample:

| File | What it is |
|---|---|
| `examples/sample-brd.md` | Input: a BRD for a "Parent Absence Notification" feature in SAMS |
| `examples/output/parent-absence-notification-SDD.docx` | Output: the SDD as Word |
| `examples/output/parent-absence-notification-SDD.pdf` | Output: the same SDD as PDF |
| `examples/sample-sdd.json` | The structured SDD data the documents were rendered from |

## How it works

```
BRD (.pdf / .docx / .md / .txt)
  → extract text               src/extract.js
  → Claude writes the SDD      src/generate.js   (JSON matching src/schema.js, prompt in src/prompt.js)
  → draw Mermaid diagrams      src/diagrams.js   (headless Chromium)
  → build the Word file        src/render-docx.js
  → convert to PDF             src/pdf.js        (LibreOffice; a second pass adds TOC page numbers)
```

The AI returns **structured JSON**, not free text. The code controls layout, numbering and styling, so every SDD comes out in the same format.

## Requirements

- Node.js 18+
- An Anthropic API key in `ANTHROPIC_API_KEY`, **or** Claude Code logged in with a Claude Pro/Max plan (see below)
- LibreOffice (`soffice`) for the PDF. Set `SOFFICE_PATH` if it is not on the `PATH`.
- `pdftotext` (poppler-utils) for page numbers in the table of contents. Optional.
- Playwright with Chromium for diagrams. Optional; without it, diagrams appear as Mermaid source. Set `CHROMIUM_PATH` to use a specific browser.

On Ubuntu/Debian:

```bash
sudo apt-get install -y libreoffice-writer poppler-utils
```

```bash
npm install playwright && npx playwright install chromium
```

## Setup

```bash
git clone https://github.com/cheaphearom/sdd-generator.git
```

```bash
cd sdd-generator
```

```bash
npm install
```

Add your Claude API key. Create a key at https://platform.claude.com/settings/keys, then copy the example settings file:

```bash
cp .env.example .env
```

Open `.env` and replace `sk-ant-your-key-here` with your key:

```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

The app reads `.env` automatically when it starts. `.env` is in `.gitignore`, so your key is never committed. Instead of a `.env` file, you can also set the variable in your terminal (`export ANTHROPIC_API_KEY=...` on macOS/Linux, `set ANTHROPIC_API_KEY=...` in Windows CMD, `$env:ANTHROPIC_API_KEY="..."` in PowerShell) or in your hosting provider's environment settings.

## No API credit? Use your Claude Pro or Max plan

The API is billed separately from Claude Pro/Max. If you don't want to buy API credit, there are two other ways.

### Option A: Claude Code (automatic, uses your Pro/Max login)

1. Install Claude Code and log in once with your Claude account:

   ```bash
   npm install -g @anthropic-ai/claude-code
   ```

   ```bash
   claude
   ```

   Choose "Claude account with subscription" and log in, then type `/exit`.

2. In `.env`, set:

   ```
   SDD_PROVIDER=claude-code
   ```

   No `ANTHROPIC_API_KEY` is needed. If one is set, it is ignored in this mode.

3. Use the web page (`npm start`) or the command line as normal.

Each SDD counts toward your plan's usage limits. If you hit the limit, wait for it to reset. This option is meant for your own use on your own computer, not for a public website used by other people. For that, use an API key.

### Option B: claude.ai (manual copy and paste)

```bash
node src/cli.js --prompt path/to/BRD.pdf
```

This writes `output/<name>-prompt.txt`. Paste the whole file into a new chat on https://claude.ai and save Claude's reply as `my-sdd.json`. If the reply is cut off, type "continue" and join the parts. Then render it:

```bash
node src/cli.js --from-json my-sdd.json
```

## Use it

**Web page and API**

```bash
npm start
```

Open http://localhost:4000, upload a BRD and download the Word or PDF file when it is ready (usually 2–5 minutes).

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/sdd` | Multipart form: `brd` (file), optional `projectName` and `preparedBy`. Returns `{ id }` (202). |
| GET | `/api/sdd/:id` | Job status: `processing`, `done` or `failed`, plus progress text and download links. |
| GET | `/api/sdd/:id/download?format=docx` | Download the Word file. Use `format=pdf` for the PDF. |

**Command line**

```bash
node src/cli.js path/to/BRD.pdf --out output --project "My Project"
```

Re-render an existing SDD JSON without calling the API (for example after editing the JSON by hand):

```bash
node src/cli.js --from-json examples/sample-sdd.json --out output
```

## Settings

All settings can go in `.env` (see `.env.example`) or be set as environment variables.


| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | – | Claude API key (required to generate). Put it in `.env`. |
| `SDD_PROVIDER` | `api` | `api` (API key) or `claude-code` (Claude Code with your Pro/Max login) |
| `SDD_MODEL` | `claude-opus-5-5` | Model used to write the SDD (in `claude-code` mode, your Claude Code default unless set) |
| `SDD_EFFORT` | `high` | Reasoning effort: `low`, `medium`, `high`, `xhigh`, `max` |
| `PORT` | `4000` | Web server port |
| `SDD_DATA_DIR` | `./data` | Where uploads and generated files are kept (deleted after 24 h) |
| `SOFFICE_PATH` | `soffice` | LibreOffice binary |
| `CHROMIUM_PATH` | – | Chromium binary for diagrams |

## Changing the template

- **Sections and rules:** edit the outline in `src/prompt.js`.
- **Colours, fonts, page size, header and footer:** edit the constants at the top of `src/render-docx.js`.
- **New content types** (for example a callout box): add the type to `block.type` in `src/schema.js` and a `case` in `renderBlock()` in `src/render-docx.js`.

## Notes

- Scanned PDFs (images only) contain no text. Upload a text-based PDF or the original Word file.
- Jobs are kept in memory. On restart, running jobs are lost. For several servers, use a queue and a database.
- Treat the generated SDD as a strong first draft. It records its assumptions in section 1.1 and section 16, and it leaves approver names blank for real sign-off.
