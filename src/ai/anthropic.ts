import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from './prompt';
import { runTool, type AgentEvents, type AiConfig, type Conversation } from './agent';
import type { AiTool, ToolContext } from './tools';

/*
 * Claude through the official SDK, called straight from the phone with the person's own key
 * (hence dangerouslyAllowBrowser: the key never leaves their device except to Anthropic).
 * Streaming manual loop: text streams in, tool calls run here on the phone, and the
 * conversation is kept append-only, exactly as the API returned it.
 */

const OFFICIAL = 'https://api.anthropic.com';
/** Models that accept the server-side refusal fallback (Claude API only). */
const FALLBACK_MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1'];
/** Models that take the effort setting. */
const HAS_EFFORT = /^claude-(opus-4-[5-9]|(sonnet|opus|haiku|fable|mythos)-[5-9])/;

const client = (cfg: AiConfig) =>
  new Anthropic({ apiKey: cfg.apiKey, baseURL: cfg.endpoint || OFFICIAL, dangerouslyAllowBrowser: true, maxRetries: 2 });

type Msg = Anthropic.Beta.BetaMessageParam;

/** After a stop mid-turn, answers any tool calls left open so the next request is valid. */
function repair(history: Msg[]) {
  const last = history[history.length - 1];
  if (last?.role !== 'assistant' || !Array.isArray(last.content)) return;
  const open = last.content.filter((b): b is Anthropic.Beta.BetaToolUseBlockParam => b.type === 'tool_use');
  if (open.length) history.push({ role: 'user', content: open.map((b) => ({ type: 'tool_result' as const, tool_use_id: b.id, content: 'Stopped by the person.', is_error: true })) });
}

export async function askClaude(conv: Conversation, cfg: AiConfig, question: string, tools: AiTool[], ctx: ToolContext, ev: AgentEvents, signal: AbortSignal) {
  const c = client(cfg);
  const history = conv.history as Msg[];
  repair(history);
  history.push({ role: 'user', content: question });

  const defs: Anthropic.Beta.BetaTool[] = tools.map((t) => ({
    name: t.name, description: t.description, input_schema: t.input as Anthropic.Beta.BetaTool.InputSchema,
    eager_input_streaming: true, // inputs are validated in runTool before anything runs
  }));
  const official = (cfg.endpoint || OFFICIAL).replace(/\/+$/, '') === OFFICIAL;
  const extra = official && FALLBACK_MODELS.includes(cfg.model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {};
  let jsonRetries = 0;

  for (let step = 0; step < 20; step++) {
    ev.turn();
    const stream = c.beta.messages.stream({
      model: cfg.model,
      max_tokens: 64000,
      system: [{ type: 'text', text: SYSTEM_PROMPT }],
      tools: defs,
      messages: history,
      cache_control: { type: 'ephemeral' },
      ...(HAS_EFFORT.test(cfg.model) ? { output_config: { effort: 'medium' as const } } : {}),
      ...extra,
    }, { signal });
    stream.on('text', (d) => ev.text(d));

    let msg: Anthropic.Beta.BetaMessage;
    try {
      msg = await stream.finalMessage();
      jsonRetries = 0;
    } catch (e) {
      // Only a tool input that couldn't be parsed at all is retried; API errors and stops are not.
      if (e instanceof Anthropic.APIError || signal.aborted || jsonRetries++ >= 2) throw e;
      continue;
    }

    history.push({ role: 'assistant', content: msg.content });
    if (msg.stop_reason === 'pause_turn') continue;
    if (msg.stop_reason === 'refusal') { ev.text('\n\nClaude declined to answer this one. Try asking it another way.'); return; }
    const calls = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (!calls.length) return; // end_turn, or a text answer cut off at max_tokens
    if (msg.stop_reason === 'max_tokens') { repair(history); throw new Error('The answer was too long and got cut off.'); }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      const r = await runTool(tools, call.name, call.input, ctx, ev, call.id);
      results.push({ type: 'tool_result', tool_use_id: call.id, content: r.output, ...(r.ok ? {} : { is_error: true }) });
    }
    history.push({ role: 'user', content: results });
  }
  ev.text('\n\nStopped after many steps. Ask a narrower question to continue.');
}

export async function claudeModels(cfg: AiConfig) {
  const ids: string[] = [];
  for await (const m of client(cfg).models.list()) ids.push(m.id);
  return ids;
}

/** A friendly message for common failures. */
export function claudeError(e: unknown) {
  if (e instanceof Anthropic.AuthenticationError) return 'The API key was rejected. Check it in Settings → Assistant.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'This key isn’t allowed to use that model.';
  if (e instanceof Anthropic.NotFoundError) return 'That model wasn’t found. Pick another in Settings → Assistant.';
  if (e instanceof Anthropic.RateLimitError) return 'Too many requests right now. Try again in a minute.';
  if (e instanceof Anthropic.APIConnectionError) return 'Couldn’t reach Anthropic. Check your connection.';
  if (e instanceof Anthropic.APIError) return `Anthropic replied with an error (${e.status ?? 'no status'}).`;
  return null;
}
