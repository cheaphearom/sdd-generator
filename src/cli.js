#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true }); // loads ANTHROPIC_API_KEY etc. from .env
// Usage:
//   node src/cli.js path/to/BRD.pdf [--out output] [--project "Name"] [--prepared-by "Team"]
//   node src/cli.js --from-json examples/sample-sdd.json [--out output]   (render only, no API call)
//   node src/cli.js --prompt path/to/BRD.pdf [--out output]   (write a prompt to paste into claude.ai)
const fs = require('fs/promises');
const path = require('path');
const { brdToSdd, buildDocuments, today } = require('./pipeline');
const { extractText } = require('./extract');
const { sddSchema } = require('./schema');
const { SYSTEM_PROMPT, buildUserPrompt } = require('./prompt');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) args[a.slice(2)] = argv[++i];
    else args._.push(a);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args.out || 'output');
  const log = (msg) => console.log(`• ${msg}`);

  if (args.prompt) {
    // Manual mode: build one prompt to paste into claude.ai, then render the reply with --from-json.
    const brdText = await extractText(args.prompt);
    const text = [
      SYSTEM_PROMPT,
      '',
      'Reply with ONLY one JSON object (no explanation, no markdown fences) that matches this JSON Schema:',
      JSON.stringify(sddSchema),
      '',
      buildUserPrompt({ brdText, projectName: args.project, preparedBy: args['prepared-by'], date: today() }),
    ].join('\n');
    await fs.mkdir(outDir, { recursive: true });
    const file = path.join(outDir, `${path.basename(args.prompt).replace(/\.[^.]+$/, '')}-prompt.txt`);
    await fs.writeFile(file, text);
    console.log(`Prompt written to: ${file}

Next steps:
  1. Open https://claude.ai, start a new chat and paste the whole file.
  2. Save Claude's reply as a .json file, e.g. my-sdd.json
     (if the reply is cut off, type "continue" and join the parts).
  3. Run: node src/cli.js --from-json my-sdd.json`);
    return;
  }

  let result;
  if (args['from-json']) {
    const raw = (await fs.readFile(args['from-json'], 'utf8')).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    let sdd;
    try {
      sdd = JSON.parse(raw);
    } catch (err) {
      throw new Error(`${args['from-json']} is not valid JSON (${err.message}). Make sure you copied the whole reply.`);
    }
    result = await buildDocuments(sdd, outDir, { onProgress: log });
  } else if (args._[0]) {
    result = await brdToSdd({
      brdPath: args._[0],
      originalName: args._[0],
      outDir,
      projectName: args.project,
      preparedBy: args['prepared-by'],
      onProgress: log,
    });
  } else {
    console.error('Usage: node src/cli.js <BRD.pdf|.docx|.md|.txt> [--out dir] [--project name]\n       node src/cli.js --from-json sdd.json [--out dir]\n       node src/cli.js --prompt <BRD file> [--out dir]');
    process.exit(1);
  }

  console.log(`\nWord: ${result.docxPath}\nPDF:  ${result.pdfPath || '(not created)'}\nJSON: ${result.jsonPath}`);
  if (result.warning) console.log(`\nNote: ${result.warning}`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
