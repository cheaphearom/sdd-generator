// BRD file -> SDD JSON -> Word + PDF.
const fs = require('fs/promises');
const path = require('path');
const { extractText } = require('./extract');
const { generateSdd } = require('./generate');
const { generateSddWithClaudeCode } = require('./generate-claude-code');
const { renderDiagrams } = require('./diagrams');
const { renderDocx, collectDiagrams } = require('./render-docx');
const { docxToPdf, headingPages } = require('./pdf');

function slug(s) {
  return String(s || 'sdd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'sdd';
}

function today() {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Fills in missing fields and checks the basic shape, so hand-made or pasted JSON
// (for example from claude.ai) renders without errors.
function normalizeSdd(sdd) {
  if (!sdd || typeof sdd !== 'object') throw new Error('The SDD JSON must be an object.');
  if (!sdd.meta || typeof sdd.meta !== 'object') throw new Error('The SDD JSON has no "meta" object.');
  if (!Array.isArray(sdd.sections) || !sdd.sections.length) throw new Error('The SDD JSON has no "sections" array.');
  const metaDefaults = {
    title: 'SOFTWARE DESIGN', subtitle: 'Software Design Document (SDD)', tagline: '',
    guideline: 'Prepared in alignment with the Phase-2 (Software Design) guideline', system: '', module: '',
    documentType: 'Software Design Document', version: '1.0', preparedBy: 'Software Design Team', date: today(),
    status: 'Completed Design Baseline - Pending Stakeholder Approval',
  };
  sdd.meta = { ...metaDefaults, ...sdd.meta };
  const fixSection = (sec, where) => {
    if (!sec || typeof sec.heading !== 'string') throw new Error(`A section in ${where} has no "heading".`);
    sec.blocks = (sec.blocks || []).map((b) => ({ type: 'paragraph', text: '', items: [], columns: [], rows: [], caption: '', ...b }));
    sec.blocks.forEach((b) => {
      b.rows = b.rows.map((r) => (Array.isArray(r) ? r.map(String) : [String(r)]));
    });
    sec.subsections = (sec.subsections || []).map((x) => fixSection(x, `"${sec.heading}"`));
    return sec;
  };
  sdd.sections = sdd.sections.map((x) => fixSection(x, 'sections'));
  sdd.appendices = (sdd.appendices || []).map((x) => fixSection(x, 'appendices'));
  return sdd;
}

// Renders an SDD object to <outDir>/<name>.docx and .pdf.
// Two passes: the first PDF tells us which page each heading is on, the second
// build writes those page numbers into the table of contents.
async function buildDocuments(sdd, outDir, { onProgress = () => {} } = {}) {
  sdd = normalizeSdd(sdd);
  await fs.mkdir(outDir, { recursive: true });
  const base = `${slug(sdd.meta.title)}-SDD`;
  const docxPath = path.join(outDir, `${base}.docx`);

  // Save the SDD data first, so the AI's work is never lost if a later step fails.
  const jsonPath = path.join(outDir, `${base}.json`);
  await fs.writeFile(jsonPath, JSON.stringify(sdd, (k, v) => (k.startsWith('_') ? undefined : v), 2));

  onProgress('Rendering diagrams');
  const images = await renderDiagrams(collectDiagrams(sdd));

  onProgress('Building Word document');
  let { buffer, entries } = await renderDocx(sdd, { images });
  await fs.writeFile(docxPath, buffer);

  // The PDF is optional: if LibreOffice is missing or fails, still return the Word file.
  let pdfPath = null;
  let warning = null;
  try {
    onProgress('Converting to PDF');
    pdfPath = await docxToPdf(docxPath, outDir);

    const pageMap = await headingPages(pdfPath, entries.map((e) => e.label));
    if (pageMap) {
      onProgress('Adding page numbers to the table of contents');
      ({ buffer } = await renderDocx(sdd, { images, pageMap }));
      await fs.writeFile(docxPath, buffer);
      pdfPath = await docxToPdf(docxPath, outDir);
    }
  } catch (err) {
    pdfPath = null;
    warning = err.code === 'NO_LIBREOFFICE' ? err.message : `The PDF could not be created (${err.message.split('\n')[0]}). The Word file is ready.`;
    console.warn(`[pdf] ${warning}`);
  }

  return { docxPath, pdfPath, jsonPath, warning };
}

async function brdToSdd({ brdPath, originalName, outDir, projectName, preparedBy, onProgress = () => {} }) {
  onProgress('Reading BRD');
  const brdText = await extractText(brdPath, originalName);

  // SDD_PROVIDER=claude-code uses the Claude Code CLI (Pro/Max subscription) instead of the API.
  const useCli = (process.env.SDD_PROVIDER || 'api').toLowerCase() === 'claude-code';
  onProgress(`Designing the SDD with Claude${useCli ? ' Code' : ''} (this can take a few minutes)`);
  const generate = useCli ? generateSddWithClaudeCode : generateSdd;
  const sdd = await generate({ brdText, projectName, preparedBy, date: today() });

  return buildDocuments(sdd, outDir, { onProgress });
}

module.exports = { brdToSdd, buildDocuments, today };
