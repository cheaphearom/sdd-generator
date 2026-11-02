#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true }); // loads ANTHROPIC_API_KEY etc. from .env
// Usage:
//   node src/cli.js path/to/BRD.pdf [--out output] [--project "Name"] [--prepared-by "Team"]
//   node src/cli.js --from-json examples/sample-sdd.json [--out output]   (render only, no API call)
const fs = require('fs/promises');
const path = require('path');
const { brdToSdd, buildDocuments } = require('./pipeline');

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

  let result;
  if (args['from-json']) {
    const sdd = JSON.parse(await fs.readFile(args['from-json'], 'utf8'));
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
    console.error('Usage: node src/cli.js <BRD.pdf|.docx|.md|.txt> [--out dir] [--project name]\n       node src/cli.js --from-json sdd.json [--out dir]');
    process.exit(1);
  }

  console.log(`\nWord: ${result.docxPath}\nPDF:  ${result.pdfPath}\nJSON: ${result.jsonPath}`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
