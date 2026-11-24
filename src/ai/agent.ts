import { findTool, ToolError, type AiTool, type ToolContext } from './tools';
import { validate } from './schema';
import { settings } from '../lib/store';

/*
 * The provider-neutral part of the assistant: which services it can talk to, and running a tool
 * call safely. Each provider module (anthropic.ts, openai.ts) owns its own conversation format
 * and loop, and is only downloaded when the assistant is first used.
 */

export type ProviderId = 'claude' | 'openai' | 'openrouter' | 'other';

export interface Provider {
  label: string;
  /** Which API shape it speaks. */
  wire: 'anthropic' | 'openai';
  endpoint: string;
  /** Offered in the model menu; others can be typed or loaded from the provider. */
  models: string[];
  defaultModel: string;
  keyPlaceholder: string;
}

export const PROVIDERS: Record<ProviderId, Provider> = {
  claude: {
    label: 'Claude', wire: 'anthropic', endpoint: 'https://api.anthropic.com', keyPlaceholder: 'sk-ant-…',
    models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'], defaultModel: 'claude-sonnet-5-5',
  },
  openai: { label: 'OpenAI', wire: 'openai', endpoint: 'https://api.openai.com/v1', keyPlaceholder: 'sk-…', models: [], defaultModel: '' },
  openrouter: { label: 'OpenRouter', wire: 'openai', endpoint: 'https://openrouter.ai/api/v1', keyPlaceholder: 'sk-or-…', models: [], defaultModel: '' },
  other: { label: 'Other (OpenAI-compatible)', wire: 'openai', endpoint: '', keyPlaceholder: 'API key', models: [], defaultModel: '' },
};

export interface AiConfig {
  provider: ProviderId;
  endpoint: string;
  model: string;
  apiKey: string;
}

export interface AgentEvents {
  /** Assistant text as it arrives (streamed in pieces, or whole). */
  text: (delta: string) => void;
  /** A new assistant message is starting (after tool calls, the model writes again). */
  turn: () => void;
  toolStart: (callId: string, name: string, label: string, input: unknown) => void;
  toolEnd: (callId: string, ok: boolean, output: string) => void;
}

/** A conversation in the provider's own message format, so nothing is lost between turns. */
export interface Conversation {
  provider: ProviderId;
  model: string;
  history: unknown[];
}

export const newConversation = (cfg: AiConfig): Conversation => ({ provider: cfg.provider, model: cfg.model, history: [] });

const MAX_OUTPUT = 150_000; // characters of tool output per call

/** Validates and runs one tool call. Never throws: problems go back to the model as an error result. */
export async function runTool(tools: AiTool[], name: string, input: unknown, ctx: ToolContext, ev: AgentEvents, callId: string) {
  const tool = findTool(tools, name);
  const args = input ?? {};
  ev.toolStart(callId, name, tool ? safeLabel(tool, args) : name, args);
  let ok = false;
  let output: string;
  if (!tool) output = `Unknown tool "${name}". Available: ${tools.map((t) => t.name).join(', ')}.`;
  else {
    const errs = validate(tool.input, args);
    if (errs.length) output = `Invalid input: ${errs.join('; ')}.`;
    else {
      try {
        output = JSON.stringify(await tool.run(args, ctx));
        if (output.length > MAX_OUTPUT) output = output.slice(0, MAX_OUTPUT) + ' …[cut off: ask for a shorter date range or a smaller limit]';
        ok = true;
      } catch (e) {
        output = e instanceof ToolError ? e.message : `The tool failed: ${(e as Error).message}`;
      }
    }
  }
  ev.toolEnd(callId, ok, output);
  return { ok, output };
}

function safeLabel(tool: AiTool, input: unknown) {
  try { return tool.label(input); } catch { return tool.name; }
}

/** Sends one question and runs the tool loop until the model has answered. */
export async function ask(conv: Conversation, cfg: AiConfig, question: string, tools: AiTool[], ctx: ToolContext, ev: AgentEvents, signal: AbortSignal) {
  if (PROVIDERS[cfg.provider].wire === 'anthropic') {
    const { askClaude } = await import('./anthropic');
    return askClaude(conv, cfg, question, tools, ctx, ev, signal);
  }
  const { askOpenAI } = await import('./openai');
  return askOpenAI(conv, cfg, question, tools, ctx, ev, signal);
}

/** Model ids the provider offers (for the model menu). */
export async function listModels(cfg: AiConfig): Promise<string[]> {
  if (PROVIDERS[cfg.provider].wire === 'anthropic') {
    const { claudeModels } = await import('./anthropic');
    return claudeModels(cfg);
  }
  const { openAIModels } = await import('./openai');
  return openAIModels(cfg);
}

/** A plain-language message for a failed request. */
export async function describeError(e: unknown, cfg: AiConfig) {
  if ((e as Error)?.name === 'AbortError' || /aborted/i.test((e as Error)?.message ?? '')) return 'Stopped.';
  const msg = PROVIDERS[cfg.provider].wire === 'anthropic'
    ? (await import('./anthropic')).claudeError(e)
    : (await import('./openai')).openAIError(e);
  return msg ?? (e as Error)?.message ?? 'Something went wrong.';
}

/** The assistant settings in use, or null when there's no key for the chosen service yet. */
export function currentConfig(): AiConfig | null {
  const a = settings.value.ai;
  const p = PROVIDERS[a.provider] ?? PROVIDERS.claude;
  const cfg = { provider: a.provider, endpoint: (a.endpoints[a.provider] || p.endpoint).trim().replace(/\/+$/, ''), model: (a.models[a.provider] || p.defaultModel).trim(), apiKey: (a.keys[a.provider] ?? '').trim() };
  return cfg.apiKey && cfg.model && cfg.endpoint ? cfg : null;
}
