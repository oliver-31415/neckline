import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { settings } from '../lib/store';
import { go } from '../lib/nav';
import { Sheet, showToast } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { IconSend, IconShare, IconStop } from '../components/Icons';
import { shareOrDownload } from '../export/files';
import { PROVIDERS, ask, currentConfig, describeError, newConversation, type AgentEvents, type Conversation } from '../ai/agent';
import { allTools, type Attachment, type ToolContext } from '../ai/tools';

/*
 * The assistant chat. The conversation lives in memory until "New chat" or a reload, so closing
 * the sheet and coming back carries on. Each tool call shows as a chip you can open to see
 * exactly what was sent; actions wait on an Allow card.
 */

type Item =
  | { kind: 'user'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'tool'; id: string; name: string; label: string; input: unknown; state: 'running' | 'ok' | 'error'; output?: string }
  | { kind: 'approval'; id: string; title: string; detail?: string; state: 'waiting' | 'allowed' | 'declined' }
  | { kind: 'file'; att: Attachment }
  | { kind: 'error'; text: string };

const items = signal<Item[]>([]);
const busy = signal(false);
let conversation: Conversation | null = null;
let controller: AbortController | null = null;
const waiting = new Map<string, (ok: boolean) => void>();

/** Open the assistant, optionally with a question ready to send. */
export const assistant = signal<{ prompt?: string } | null>(null);
export const openAssistant = (prompt?: string) => { assistant.value = { prompt }; };

const ACTIONS = new Set(allTools().filter((t) => t.action).map((t) => t.name));

const SUGGESTIONS = [
  'What seems to make my pain worse?',
  'How did this fortnight compare with the one before?',
  'Has my medication seemed to help?',
  'Write a report for my next appointment',
];

function push(it: Item) { items.value = [...items.value, it]; }
function patch(pred: (it: Item) => boolean, change: Partial<Item>) {
  items.value = items.value.map((it) => (pred(it) ? ({ ...it, ...change } as Item) : it));
}

async function send(question: string) {
  const cfg = currentConfig();
  if (!cfg || busy.value) return;
  if (!conversation || conversation.provider !== cfg.provider || conversation.model !== cfg.model) conversation = newConversation(cfg);
  push({ kind: 'user', text: question });
  busy.value = true;
  controller = new AbortController();
  let textAt = -1; // index of the assistant text item being written, or -1 before the first piece of a turn
  const ev: AgentEvents = {
    turn: () => { textAt = -1; },
    text: (d) => {
      if (textAt < 0) { push({ kind: 'text', text: '' }); textAt = items.value.length - 1; }
      const list = items.value.slice();
      const cur = list[textAt] as Extract<Item, { kind: 'text' }>;
      list[textAt] = { ...cur, text: cur.text + d };
      items.value = list;
    },
    toolStart: (id, name, label, input) => { textAt = -1; push({ kind: 'tool', id, name, label, input, state: 'running' }); },
    toolEnd: (id, ok, output) => patch((it) => it.kind === 'tool' && it.id === id, { state: ok ? 'ok' : 'error', output }),
  };
  const ctx: ToolContext = {
    notes: settings.value.ai.notes,
    attach: (att) => { textAt = -1; push({ kind: 'file', att }); },
    approve: (req) => new Promise<boolean>((resolve) => {
      const id = Math.random().toString(36).slice(2);
      textAt = -1;
      push({ kind: 'approval', id, ...req, state: 'waiting' });
      waiting.set(id, resolve);
      controller?.signal.addEventListener('abort', () => answer(id, false));
    }),
  };
  try {
    await ask(conversation, cfg, question, allTools(), ctx, ev, controller.signal);
  } catch (e) {
    push({ kind: 'error', text: await describeError(e, cfg) });
  } finally {
    busy.value = false;
    controller = null;
  }
}

function answer(id: string, ok: boolean) {
  const resolve = waiting.get(id);
  if (!resolve) return;
  waiting.delete(id);
  patch((it) => it.kind === 'approval' && it.id === id, { state: ok ? 'allowed' : 'declined' });
  resolve(ok);
}

function newChat() {
  controller?.abort();
  conversation = null;
  items.value = [];
}

export function AssistantSheet() {
  const open = assistant.value;
  const [text, setText] = useState(open?.prompt ?? '');
  const end = useRef<HTMLDivElement>(null);
  const cfg = currentConfig();

  useEffect(() => { if (open?.prompt) setText(open.prompt); }, [open?.prompt]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [items.value.length, busy.value]);
  if (!open) return null;

  const submit = (q = text) => {
    if (!q.trim() || busy.value) return;
    send(q.trim());
    setText('');
  };
  const close = () => { assistant.value = null; };

  return (
    <Sheet title="Assistant" onClose={close} tall>
      {!cfg ? (
        <div class="chat-empty">
          <div class="chat-empty-title">Add an API key to start</div>
          <button class="btn primary" onClick={() => { close(); go('settings'); }}>Open Settings</button>
        </div>
      ) : (
        <div class="chat">
          {items.value.length > 0 && (
            <div class="chat-top">
              <span class="muted small">{PROVIDERS[cfg.provider].label} · {cfg.model}</span>
              <button class="link small" onClick={newChat}>New chat</button>
            </div>
          )}
          {!items.value.length && (
            <div class="chat-suggest">
              {SUGGESTIONS.map((q) => <button key={q} class="suggest" onClick={() => submit(q)}>{q}</button>)}
            </div>
          )}
          <ChatItems />
          {busy.value && !waiting.size && <div class="chat-dots" aria-label="Working"><span /><span /><span /></div>}
          <div ref={end} />
          <form class="chat-bar" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <textarea
              class="chat-input" rows={1} placeholder="Ask about your diary" value={text}
              onInput={(e) => { const el = e.target as HTMLTextAreaElement; setText(el.value); el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 140)}px`; }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            />
            {busy.value
              ? <button type="button" class="chat-send stop" aria-label="Stop" onClick={() => controller?.abort()}><IconStop /></button>
              : <button type="submit" class="chat-send" aria-label="Send" disabled={!text.trim()}><IconSend /></button>}
          </form>
        </div>
      )}
    </Sheet>
  );
}

/** Messages, with runs of tool calls shown together as one row of chips. */
function ChatItems() {
  const list = items.value;
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    if (it.kind === 'tool') {
      const run: Extract<Item, { kind: 'tool' }>[] = [];
      while (i < list.length && list[i].kind === 'tool') run.push(list[i++] as Extract<Item, { kind: 'tool' }>);
      i--;
      out.push(<ToolChips key={run[0].id} tools={run} />);
    } else if (it.kind === 'user') out.push(<div key={i} class="bubble me">{it.text}</div>);
    else if (it.kind === 'text') out.push(it.text.trim() ? <div key={i} class="bubble ai"><Markdown text={it.text} /></div> : null);
    else if (it.kind === 'approval') out.push(<ApprovalCard key={it.id} it={it} />);
    else if (it.kind === 'file') out.push(
      <div key={i} class="chat-file">
        <span class="grow">{it.att.label}</span>
        <button class="btn sm" onClick={() => window.open(URL.createObjectURL(it.att.file), '_blank')}>Preview</button>
        <button class="btn sm primary" onClick={() => shareOrDownload(it.att.file)}><IconShare /> Share</button>
      </div>,
    );
    else out.push(<div key={i} class="chat-error">{it.text}</div>);
  }
  return <>{out}</>;
}

function ToolChips({ tools }: { tools: Extract<Item, { kind: 'tool' }>[] }) {
  const [shown, setShown] = useState<string | null>(null);
  const sel = tools.find((t) => t.id === shown);
  return (
    <div class="chat-tools">
      <div class="chips-row">
        <span class="muted small">{tools.some((t) => ACTIONS.has(t.name)) ? 'Used' : 'Looked at'}</span>
        {tools.map((t) => (
          <button key={t.id} class={'tool-chip ' + t.state + (shown === t.id ? ' on' : '')} onClick={() => setShown(shown === t.id ? null : t.id)}>{t.label}</button>
        ))}
      </div>
      {sel && (
        <pre class="tool-data">{`Asked for: ${JSON.stringify(sel.input)}\n\nSent: ${pretty(sel.output)}`}</pre>
      )}
    </div>
  );
}

function pretty(s?: string) {
  if (!s) return '…';
  try { return JSON.stringify(JSON.parse(s), null, 1).slice(0, 6000); } catch { return s.slice(0, 6000); }
}

function ApprovalCard({ it }: { it: Extract<Item, { kind: 'approval' }> }) {
  return (
    <div class={'approval ' + it.state}>
      <div class="approval-title">{it.title}</div>
      {it.detail && <div class="approval-detail">{it.detail}</div>}
      {it.state === 'waiting' ? (
        <div class="row">
          <button class="btn grow" onClick={() => answer(it.id, false)}>Don’t</button>
          <button class="btn primary grow" onClick={() => answer(it.id, true)}>Allow</button>
        </div>
      ) : <div class="small muted">{it.state === 'allowed' ? 'Allowed' : 'Not allowed'}</div>}
    </div>
  );
}

/** Quick check that the key and address work, without spending tokens. */
export async function testAssistant() {
  const cfg = currentConfig();
  if (!cfg) { showToast('Add an API key first'); return; }
  try {
    const { listModels } = await import('../ai/agent');
    await listModels(cfg);
    showToast('Connected');
  } catch (e) {
    showToast(await describeError(e, cfg));
  }
}
