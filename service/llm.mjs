// Small chat client for the writer robots. Zero deps. Grok (xAI) first, OpenAI as the fallback.
// Keys: C:/Users/User/keys/xai/key.txt (or XAI_API_KEY), ../../.openai-key (or OPENAI_API_KEY).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const CREDIT_USD = 0.01; // 1 credit = $0.01, as Quota prices it
function readFile(p) { try { return fs.readFileSync(p, 'utf8').trim(); } catch { return ''; } }
const XAI_KEY = process.env.XAI_API_KEY || readFile('C:/Users/User/keys/xai/key.txt') || readFile(path.join(here, '..', '..', 'keys', 'xai', 'key.txt'));
const OPENAI_KEY = process.env.OPENAI_API_KEY || readFile(path.join(here, '..', '..', '.openai-key'));

export const PROVIDER = XAI_KEY ? 'xai' : OPENAI_KEY ? 'openai' : null;
export const MODEL = process.env.ROBOT_MODEL || (PROVIDER === 'xai' ? 'grok-4-fast-non-reasoning' : 'gpt-5.4-mini');
// Fallback list prices (USD per 1M tokens) when the provider doesn't report cost. xAI reports cost_in_usd_ticks (1e-10 USD) and that wins.
export const PRICE = PROVIDER === 'xai' ? { in: 0.2, out: 0.5 } : { in: 0.25, out: 2.0 };
export const KEY = XAI_KEY || OPENAI_KEY;
export const hasLLM = () => !!KEY;
const URL = PROVIDER === 'xai' ? 'https://api.x.ai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';

/** Ask the model for a short piece of writing. Returns { text, usage, cost, credits, ms, model, provider }. Throws on HTTP error. */
export async function write({ system, user, maxTokens = 500 }) {
  if (!KEY) throw new Error('no model key');
  const t0 = Date.now();
  const body = { model: MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
  if (PROVIDER === 'xai') body.max_tokens = maxTokens; else body.max_completion_tokens = maxTokens;
  const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`${PROVIDER} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const text = (j.choices?.[0]?.message?.content || '').trim();
  const usage = j.usage || { prompt_tokens: 0, completion_tokens: 0 };
  const cost = usage.cost_in_usd_ticks != null ? usage.cost_in_usd_ticks / 1e10 : (usage.prompt_tokens * PRICE.in + usage.completion_tokens * PRICE.out) / 1e6;
  return { text, usage: { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, reported: usage.cost_in_usd_ticks != null }, cost, credits: +(cost / CREDIT_USD).toFixed(3), ms: Date.now() - t0, model: MODEL, provider: PROVIDER };
}
