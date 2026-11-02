// Generates the SDD with the Claude Code command line ("claude -p") instead of the API.
// Claude Code can be logged in with a Claude Pro or Max subscription, so this needs
// no API credit. Intended for personal use on your own computer.
const { spawn } = require('child_process');
const { sddSchema } = require('./schema');
const { SYSTEM_PROMPT, buildUserPrompt } = require('./prompt');

const CLAUDE_BIN = process.env.CLAUDE_CLI_PATH || 'claude';
const TIMEOUT_MS = Number(process.env.SDD_CLI_TIMEOUT_MS || 20 * 60 * 1000);

function runClaude(args, input) {
  return new Promise((resolve, reject) => {
    // Remove API credentials so Claude Code uses your subscription login, not API credit.
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;

    const child = spawn(CLAUDE_BIN, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Claude Code did not finish within ${Math.round(TIMEOUT_MS / 60000)} minutes.`));
    }, TIMEOUT_MS);

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err.code === 'ENOENT'
        ? new Error('Claude Code is not installed. Install it with "npm install -g @anthropic-ai/claude-code", run "claude" once and log in with your Claude account.')
        : err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(input);
  });
}

async function generateSddWithClaudeCode({ brdText, projectName, preparedBy, date }) {
  const args = [
    '-p',
    '--output-format', 'json',
    '--tools', '', // no file or shell access: it only writes the SDD
    '--system-prompt', SYSTEM_PROMPT,
    '--json-schema', JSON.stringify(sddSchema),
  ];
  if (process.env.SDD_MODEL) args.push('--model', process.env.SDD_MODEL);

  const { code, stdout, stderr } = await runClaude(args, buildUserPrompt({ brdText, projectName, preparedBy, date }));

  let out;
  try {
    out = JSON.parse(stdout);
  } catch {
    const detail = (stderr || stdout).trim().split('\n').slice(-3).join(' ');
    throw new Error(`Claude Code failed (exit code ${code}). ${detail || 'Run "claude" once to make sure you are logged in.'}`);
  }

  if (out.is_error) {
    throw new Error(`Claude Code returned an error: ${out.result || out.subtype}. If you hit your plan's usage limit, wait for it to reset and try again.`);
  }
  if (out.structured_output) return out.structured_output;

  // Fallback: parse the text result.
  try {
    return JSON.parse(String(out.result).replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new Error('Claude Code did not return valid SDD JSON.');
  }
}

module.exports = { generateSddWithClaudeCode };
