// Converts the .docx to PDF with LibreOffice, so the PDF matches the Word file,
// and reads back which page each heading landed on (for the table of contents).
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const { pathToFileURL } = require('url');
const fsSync = require('fs');

const run = promisify(execFile);

// Usual LibreOffice install locations, used when soffice is not on the PATH.
const KNOWN_PATHS = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/usr/bin/soffice',
  '/usr/local/bin/soffice',
  '/opt/homebrew/bin/soffice',
  '/snap/bin/libreoffice',
];

function findSoffice() {
  if (process.env.SOFFICE_PATH) return process.env.SOFFICE_PATH;
  return KNOWN_PATHS.find((p) => fsSync.existsSync(p)) || 'soffice';
}

const INSTALL_HELP =
  'LibreOffice is not installed, so only the Word file was produced. Install LibreOffice ' +
  '(https://www.libreoffice.org/download/) and restart the app, or set SOFFICE_PATH in .env.';

async function docxToPdf(docxPath, outDir) {
  // A private profile directory lets several conversions run at the same time.
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'sdd-lo-'));
  try {
    await run(findSoffice(), [
      `-env:UserInstallation=${pathToFileURL(profile).href}`,
      '--headless', '--norestore', '--convert-to', 'pdf', '--outdir', outDir, docxPath,
    ], { timeout: 180000 });
  } catch (err) {
    if (err.code === 'ENOENT') throw Object.assign(new Error(INSTALL_HELP), { code: 'NO_LIBREOFFICE' });
    throw err;
  } finally {
    await fs.rm(profile, { recursive: true, force: true });
  }
  const pdfPath = path.join(outDir, path.basename(docxPath).replace(/\.docx$/i, '.pdf'));
  await fs.access(pdfPath);
  return pdfPath;
}

// Returns { "<heading label>": pageNumber } by finding each heading at the start of a line.
// Returns null when pdftotext (poppler-utils) is not installed; the TOC then has no page numbers.
async function headingPages(pdfPath, labels) {
  let text;
  try {
    ({ stdout: text } = await run('pdftotext', ['-layout', pdfPath, '-'], { maxBuffer: 64 * 1024 * 1024 }));
  } catch {
    return null;
  }
  const norm = (s) => s.replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
  const pages = text.split('\f').map((p) => p.split('\n').map(norm));
  const map = {};
  let from = 1; // skip the cover page; headings are searched in document order
  for (const label of labels) {
    const want = norm(label);
    // Long headings may wrap; match on the first 40 characters.
    const probe = want.slice(0, 40);
    for (let p = from; p < pages.length; p++) {
      // TOC lines end in dot leaders, so lines containing "...." are skipped.
      if (pages[p].some((line) => line.startsWith(probe) && !line.includes('....'))) {
        map[label] = p + 1;
        from = p;
        break;
      }
    }
  }
  return map;
}

module.exports = { docxToPdf, headingPages };
