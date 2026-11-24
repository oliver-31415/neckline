import OpenAI from 'openai';
import { SYSTEM_PROMPT } from './prompt';
import { runTool, type AgentEvents, type AiConfig, type Conversation } from './agent';
import type { AiTool, ToolContext } from './tools';

/*
 * OpenAI and the many services that copy its Chat Completions API (OpenRouter, and others under
 * "Other"), called straight from the phone with the person's key. Not streamed, because
 * compatible services differ most in their streaming; the chat shows tool progress meanwhile.
 */

type Msg = OpenAI.Chat.ChatCompletionMessageParam;

const client = (cfg: AiConfig) => new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.endpoint, dangerouslyAllowBrowser: true, maxRetries: 2 });

/** After a stop mid-turn, answers any tool calls left open so the next request is valid. */
function repair(history: Msg[]) {
  const last = history[history.length - 1];
  if (last?.role !== 'assistant' || !last.tool_calls?.length) return;
  for (const call of last.tool_calls) history.push({ role: 'tool', tool_call_id: call.id, content: 'Stopped by the person.' });
}

export async function askOpenAI(conv: Conversation, cfg: AiConfig, question: string, tools: AiTool[], ctx: ToolContext, ev: AgentEvents, signal: AbortSignal) {
  const c = client(cfg);
  const history = conv.history as Msg[];
  repair(history);
  history.push({ role: 'user', content: question });
  const defs: OpenAI.Chat.ChatCompletionTool[] = tools.map((t) => ({
    type: 'function', function: { name: t.name, description: t.description, parameters: t.input as unknown as OpenAI.FunctionParameters },
  }));

  for (let step = 0; step < 20; step++) {
    ev.turn();
    const res = await c.chat.completions.create({ model: cfg.model, messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history], tools: defs }, { signal });
    const choice = res.choices[0];
    if (!choice) throw new Error('The service sent back an empty reply.');
    const m = choice.message;
    history.push({ role: 'assistant', content: m.content ?? null, ...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}) });
    if (m.content) ev.text(m.content);
    if (m.refusal) ev.text(m.refusal);
    const calls = (m.tool_calls ?? []).filter((t): t is OpenAI.Chat.ChatCompletionMessageFunctionToolCall => t.type === 'function');
    if (!calls.length) return;
    if (choice.finish_reason === 'length') { repair(history); throw new Error('The answer was too long and got cut off.'); }
    for (const call of calls) {
      let input: unknown;
      try {
        input = JSON.parse(call.function.arguments || '{}');
      } catch {
        history.push({ role: 'tool', tool_call_id: call.id, content: 'Arguments were not valid JSON. Send them again as a JSON object.' });
        continue;
      }
      const r = await runTool(tools, call.function.name, input, ctx, ev, call.id);
      history.push({ role: 'tool', tool_call_id: call.id, content: r.output });
    }
  }
  ev.text('\n\nStopped after many steps. Ask a narrower question to continue.');
}

export async function openAIModels(cfg: AiConfig) {
  const ids: string[] = [];
  for await (const m of client(cfg).models.list()) ids.push(m.id);
  return ids.sort();
}

export function openAIError(e: unknown) {
  if (e instanceof OpenAI.AuthenticationError) return 'The API key was rejected. Check it in Settings → Assistant.';
  if (e instanceof OpenAI.PermissionDeniedError) return 'This key isn’t allowed to use that model.';
  if (e instanceof OpenAI.NotFoundError) return 'That model or address wasn’t found. Check Settings → Assistant.';
  if (e instanceof OpenAI.RateLimitError) return 'Too many requests, or the account is out of credit. Try again later.';
  if (e instanceof OpenAI.APIConnectionError) return 'Couldn’t reach the service. Check the address and your connection.';
  if (e instanceof OpenAI.APIError) return `The service replied with an error (${e.status ?? 'no status'}).`;
  return null;
}
