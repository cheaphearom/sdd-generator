// Pulls plain text out of an uploaded BRD (.pdf, .docx, .md or .txt).
const fs = require('fs/promises');
const path = require('path');
const mammoth = require('mammoth');
// Require the library file directly: the package index runs a debug self-test when loaded.
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

const SUPPORTED = ['.pdf', '.docx', '.md', '.txt'];

async function extractText(filePath, originalName = filePath) {
  const ext = path.extname(originalName).toLowerCase();
  const buffer = await fs.readFile(filePath);

  let text;
  if (ext === '.pdf') {
    text = (await pdfParse(buffer)).text;
  } else if (ext === '.docx') {
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (ext === '.md' || ext === '.txt') {
    text = buffer.toString('utf8');
  } else {
    throw new Error(`Unsupported BRD file type "${ext}". Use one of: ${SUPPORTED.join(', ')}`);
  }

  text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < 200) {
    throw new Error('The BRD contains too little text to design from. If it is a scanned PDF, upload a text-based PDF or a Word file.');
  }
  return text;
}

module.exports = { extractText, SUPPORTED };
