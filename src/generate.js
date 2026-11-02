// Calls Claude to turn BRD text into SDD JSON that matches src/schema.js.
const Anthropic = require('@anthropic-ai/sdk');
const { sddSchema } = require('./schema');
const { SYSTEM_PROMPT, buildUserPrompt } = require('./prompt');

const MODEL = process.env.SDD_MODEL || 'claude-opus-5-5';
const EFFORT = process.env.SDD_EFFORT || 'high';

async function generateSdd({ brdText, projectName, preparedBy, date }) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new Error('ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.');
  }
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY

  // Streaming: an SDD is long, and streaming avoids HTTP timeouts on big outputs.
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    // If a safety classifier declines, the API re-runs the request on a recommended fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: EFFORT,
      format: { type: 'json_schema', schema: sddSchema },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt({ brdText, projectName, preparedBy, date }) }],
  });

  let message;
  try {
    message = await stream.finalMessage();
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      throw new Error('ANTHROPIC_API_KEY is invalid. Check the key in your .env file (see .env.example).');
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new Error('The Claude API rate limit was reached. Wait a minute and try again.');
    }
    throw err;
  }

  if (message.stop_reason === 'refusal') {
    const why = message.stop_details?.explanation || 'no reason given';
    throw new Error(`The model declined to generate this SDD: ${why}`);
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('The SDD was cut off because it exceeded the output limit. Try a shorter BRD or split it by module.');
  }

  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('The model returned output that is not valid SDD JSON.');
  }
}

module.exports = { generateSdd, MODEL };
