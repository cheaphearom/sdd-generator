// BRD file -> SDD JSON -> Word + PDF.
const fs = require('fs/promises');
const path = require('path');
const { extractText } = require('./extract');
const { generateSdd } = require('./generate');
const { renderDiagrams } = require('./diagrams');
const { renderDocx, collectDiagrams } = require('./render-docx');
const { docxToPdf, headingPages } = require('./pdf');

function slug(s) {
  return String(s || 'sdd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'sdd';
}

function today() {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Renders an SDD object to <outDir>/<name>.docx and .pdf.
// Two passes: the first PDF tells us which page each heading is on, the second
// build writes those page numbers into the table of contents.
async function buildDocuments(sdd, outDir, { onProgress = () => {} } = {}) {
  await fs.mkdir(outDir, { recursive: true });
  const base = `${slug(sdd.meta.title)}-SDD`;
  const docxPath = path.join(outDir, `${base}.docx`);

  onProgress('Rendering diagrams');
  const images = await renderDiagrams(collectDiagrams(sdd));

  onProgress('Building Word document');
  let { buffer, entries } = await renderDocx(sdd, { images });
  await fs.writeFile(docxPath, buffer);

  onProgress('Converting to PDF');
  let pdfPath = await docxToPdf(docxPath, outDir);

  const pageMap = await headingPages(pdfPath, entries.map((e) => e.label));
  if (pageMap) {
    onProgress('Adding page numbers to the table of contents');
    ({ buffer } = await renderDocx(sdd, { images, pageMap }));
    await fs.writeFile(docxPath, buffer);
    pdfPath = await docxToPdf(docxPath, outDir);
  }

  const jsonPath = path.join(outDir, `${base}.json`);
  await fs.writeFile(jsonPath, JSON.stringify(sdd, (k, v) => (k.startsWith('_') ? undefined : v), 2));

  return { docxPath, pdfPath, jsonPath };
}

async function brdToSdd({ brdPath, originalName, outDir, projectName, preparedBy, onProgress = () => {} }) {
  onProgress('Reading BRD');
  const brdText = await extractText(brdPath, originalName);

  onProgress('Designing the SDD with Claude (this can take a few minutes)');
  const sdd = await generateSdd({ brdText, projectName, preparedBy, date: today() });

  return buildDocuments(sdd, outDir, { onProgress });
}

module.exports = { brdToSdd, buildDocuments };
