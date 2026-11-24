import type { ComponentChildren } from 'preact';

/*
 * Just enough Markdown for chat replies: paragraphs, bullet and numbered lists, **bold**,
 * *italic* and `code`. Builds elements directly (no innerHTML), so model output can't inject markup.
 */

function inline(text: string): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\*([^*\s][^*]*?)\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] != null ? <strong>{m[1]}</strong> : m[2] != null ? <code>{m[2]}</code> : <em>{m[3]}</em>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ComponentChildren[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => { if (para.length) blocks.push(<p>{inline(para.join(' '))}</p>); para = []; };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((x) => <li>{inline(x)}</li>);
    blocks.push(list.ordered ? <ol>{items}</ol> : <ul>{items}</ul>);
    list = null;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const num = /^\d+[.)]\s+(.*)$/.exec(line);
    const head = /^#{1,6}\s+(.*)$/.exec(line);
    if (bullet || num) {
      flushPara();
      const ordered = !!num;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? num)![1]);
    } else if (!line) {
      flushPara(); flushList();
    } else if (head) {
      flushPara(); flushList();
      blocks.push(<p><strong>{inline(head[1])}</strong></p>);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara(); flushList();
  return <div class="md">{blocks}</div>;
}
