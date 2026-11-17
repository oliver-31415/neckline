import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { IconClose, IconPlus } from './Icons';
import { painWord } from '../lib/catalog';
import { fromLocalInput, toLocalInput, HOUR } from '../lib/time';
import { sheet } from '../lib/nav';

/* ---------- pain colour ramp (single warm hue, light → dark) ---------- */
const RAMP = ['#efe9e1', '#fde3d2', '#fbcdb0', '#f8b58c', '#f49c6a', '#ee844c', '#e66c35', '#d65426', '#bf401d', '#a12f16', '#7f2211'];
export function painBg(n: number | null) {
  return n === null ? 'var(--surface-3)' : RAMP[Math.max(0, Math.min(10, Math.round(n)))];
}
export function painInk(n: number | null) {
  return n !== null && n >= 6 ? '#ffffff' : '#2a1a12';
}
export function PainPill({ n }: { n: number | null }) {
  return <span class="pain-pill" style={{ background: painBg(n), color: n === null ? 'var(--ink-2)' : painInk(n) }}>{n ?? '?'}</span>;
}

/* ---------- sheet ---------- */
export function Sheet({ title, onClose, children, footer, tall }: { title: string; onClose: () => void; children: ComponentChildren; footer?: ComponentChildren; tall?: boolean }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', key); };
  }, []);
  return (
    <>
      <div class="sheet-backdrop" onClick={onClose} />
      <div class={'sheet' + (tall ? ' tall' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div class="sheet-grab" />
        <div class="sheet-head">
          <h2>{title}</h2>
          <button class="icon-btn" style={{ boxShadow: 'none', background: 'var(--surface-3)', width: 34, height: 34 }} onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>
        <div class="sheet-body">{children}</div>
        {footer && <div class="sheet-foot">{footer}</div>}
      </div>
    </>
  );
}

export function Block({ title, aside, children }: { title: string; aside?: ComponentChildren; children: ComponentChildren }) {
  return (
    <section class="block">
      <div class="block-title"><h3>{title}</h3>{aside && <span class="muted">{aside}</span>}</div>
      {children}
    </section>
  );
}

/* ---------- chips ---------- */
export function Chips({ options, value, onChange, single, onAdd, labels, tint }: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  single?: boolean;
  onAdd?: (v: string) => void;
  labels?: Record<string, string>;
  tint?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const all = [...options, ...value.filter((v) => !options.includes(v))];
  function toggle(o: string) {
    if (single) onChange(value[0] === o ? [] : [o]);
    else onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  }
  function commit() {
    const t = text.trim();
    if (t) {
      onAdd?.(t);
      if (!value.includes(t)) onChange(single ? [t] : [...value, t]);
    }
    setText('');
    setAdding(false);
  }
  return (
    <div class="chips">
      {all.map((o) => (
        <button key={o} class={'chip' + (value.includes(o) ? ' on' : '') + (tint ? ' ' + tint : '')} aria-pressed={value.includes(o)} onClick={() => toggle(o)}>
          {labels?.[o] ?? o}
        </button>
      ))}
      {onAdd && (adding ? (
        <input
          class="input" style={{ width: 160, minHeight: 40, padding: '7px 12px', borderRadius: 999 }}
          autoFocus value={text} placeholder="Type & press return"
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === 'Enter' && commit()} onBlur={commit}
        />
      ) : (
        <button class="chip add" onClick={() => setAdding(true)}><IconPlus /> Add</button>
      ))}
    </div>
  );
}

export function Seg<T extends string | number | boolean | null>({ options, value, onChange }: { options: { v: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div class="seg">
      {options.map((o) => (
        <button key={String(o.v)} class={value === o.v ? 'on' : ''} onClick={() => onChange(value === o.v ? (null as T) : o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label class="toggle">
      <input type="checkbox" checked={checked} aria-label={label} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <span />
    </label>
  );
}

/* ---------- pain scale ---------- */
export function PainScale({ value, onChange }: { value: number | null | undefined; onChange: (v: number | null) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const v = value === undefined ? undefined : value;
  function pick(clientX: number) {
    const r = track.current!.getBoundingClientRect();
    const n = Math.max(0, Math.min(10, Math.floor(((clientX - r.left) / r.width) * 11)));
    if (n !== value) { onChange(n); navigator.vibrate?.(5); }
  }
  return (
    <div class="painscale">
      <div class="painscale-readout">
        <div class="painscale-num" style={{ background: v === undefined ? 'var(--surface-3)' : painBg(v), color: v === undefined || v === null ? 'var(--muted)' : painInk(v) }}>
          {v === undefined ? '–' : v === null ? '?' : v}
        </div>
        <div class="grow">
          <div class="painscale-word">{v === undefined ? 'How strong is it?' : painWord(v)}</div>
          <div class="small muted">Tap or slide across the scale</div>
        </div>
        <button class={'chip' + (v === null ? ' on' : '')} onClick={() => onChange(null)}>Not sure</button>
      </div>
      <div
        class="painscale-track" ref={track}
        onPointerDown={(e) => { (e.target as Element).releasePointerCapture?.(e.pointerId); pick(e.clientX); }}
        onPointerMove={(e) => e.buttons && pick(e.clientX)}
        role="radiogroup" aria-label="Pain from 0 to 10"
      >
        {Array.from({ length: 11 }, (_, i) => (
          <button key={i} class={value === i ? 'on' : ''} role="radio" aria-checked={value === i} aria-label={`${i}, ${painWord(i)}`} onClick={() => onChange(i)} style={{ background: RAMP[i], color: painInk(i) }}>{i}</button>
        ))}
      </div>
      <div class="painscale-ends"><span>No pain</span><span>Moderate</span><span>Worst imaginable</span></div>
    </div>
  );
}

/* ---------- "when" picker ---------- */
export function WhenPicker({ value, onChange }: { value: number; onChange: (t: number) => void }) {
  const [base] = useState(() => Date.now());
  const presets = [
    { label: 'Now', t: base },
    { label: '30 min ago', t: base - HOUR / 2 },
    { label: '1 h ago', t: base - HOUR },
    { label: '2 h ago', t: base - 2 * HOUR },
  ];
  const isPreset = presets.some((p) => Math.abs(p.t - value) < 60_000);
  return (
    <div class="when-row">
      {presets.map((p) => (
        <button key={p.label} class={'chip' + (Math.abs(p.t - value) < 60_000 ? ' on' : '')} onClick={() => onChange(p.t)}>{p.label}</button>
      ))}
      <input
        type="datetime-local" class={'dt-input' + (isPreset ? '' : ' on')} aria-label="Exact time"
        style={!isPreset ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)' } : undefined}
        value={toLocalInput(value)} max={toLocalInput(Date.now() + 60_000)}
        onChange={(e) => { const v = (e.target as HTMLInputElement).value; if (v) onChange(fromLocalInput(v)); }}
      />
    </div>
  );
}

/* ---------- toast ---------- */
export const toast = signal<{ text: string; action?: { label: string; run: () => void } } | null>(null);
let toastTimer: number | undefined;
export function showToast(text: string, action?: { label: string; run: () => void }) {
  toast.value = { text, action };
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = null), action ? 5000 : 2200);
}
export function Toast() {
  const t = toast.value;
  if (!t) return null;
  return (
    <div class="toast" role="status" style={sheet.value ? { bottom: 'auto', top: 'calc(var(--safe-top) + 10px)' } : undefined}>
      {t.text}
      {t.action && <button onClick={() => { t.action!.run(); toast.value = null; }}>{t.action.label}</button>}
    </div>
  );
}
