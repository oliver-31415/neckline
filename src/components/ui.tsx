import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { IconChevron, IconMinus, IconPlus } from './Icons';
import { painWord } from '../lib/catalog';
import { fromLocalInput, toLocalInput, HOUR } from '../lib/time';
import { sheet } from '../lib/nav';

/* ---------- pain colour ramp (single warm hue, light → dark) ---------- */
const RAMP = ['#e9e4dc', '#fde3d2', '#fbcdb0', '#f8b58c', '#f49c6a', '#ee844c', '#e66c35', '#d65426', '#bf401d', '#a12f16', '#7f2211'];
export function painBg(n: number | null) {
  return n === null ? 'var(--fill)' : RAMP[Math.max(0, Math.min(10, Math.round(n)))];
}
export function painInk(n: number | null) {
  return n !== null && n >= 6 ? '#ffffff' : '#2a1a12';
}
export function PainPill({ n }: { n: number | null }) {
  return <span class="pain-pill" style={{ background: painBg(n), color: n === null ? 'var(--ink-2)' : painInk(n) }}>{n ?? '?'}</span>;
}

/* ---------- navigation bar with large title ---------- */
export function Nav({ title, sub, children }: { title: string; sub?: ComponentChildren; children?: ComponentChildren }) {
  return (
    <header class="nav">
      <div class="nav-actions">{children}</div>
      <h1>{title}</h1>
      {sub && <div class="nav-sub">{sub}</div>}
    </header>
  );
}

/* ---------- sheet (iOS page sheet: Cancel · Title · Action) ---------- */
export function Sheet({ title, onClose, children, action, tall }: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  action?: { label: string; onClick: () => void; disabled?: boolean };
  tall?: boolean;
}) {
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
          <button class="bar-btn" onClick={onClose}>{action ? 'Cancel' : ''}</button>
          <h2>{title}</h2>
          {action
            ? <button class="bar-btn strong" disabled={action.disabled} onClick={action.onClick}>{action.label}</button>
            : <button class="bar-btn strong" onClick={() => { (document.activeElement as HTMLElement | null)?.blur?.(); onClose(); }}>Done</button>}
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </>
  );
}

/* ---------- grouped sections ---------- */
export function Block({ title, aside, children, foot, flush }: { title?: string; aside?: ComponentChildren; children: ComponentChildren; foot?: ComponentChildren; flush?: boolean }) {
  return (
    <section class="section">
      {(title || aside) && <div class="sec-head"><span>{title}</span>{aside && <span class="sec-aside">{aside}</span>}</div>}
      <div class={'group' + (flush ? ' flush' : ' pad')}>{children}</div>
      {foot && <div class="sec-foot">{foot}</div>}
    </section>
  );
}

export function Row({ label, value, onClick, icon, danger }: { label: ComponentChildren; value?: ComponentChildren; onClick?: () => void; icon?: ComponentChildren; danger?: boolean }) {
  return (
    <button class={'row-item' + (danger ? ' danger' : '')} onClick={onClick} disabled={!onClick}>
      {icon && <span class="row-icon">{icon}</span>}
      <span class="row-label">{label}</span>
      {value != null && <span class="row-value">{value}</span>}
      {onClick && !danger && <span class="row-chev"><IconChevron /></span>}
    </button>
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
          class="input chip-input" autoFocus value={text} 
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === 'Enter' && commit()} onBlur={commit}
        />
      ) : (
        <button class="chip add" onClick={() => setAdding(true)}><IconPlus /> Add</button>
      ))}
    </div>
  );
}

export function Seg<T extends string | number | boolean | null>({ options, value, onChange, required }: { options: { v: T; label: string }[]; value: T; onChange: (v: T) => void; required?: boolean }) {
  return (
    <div class="seg">
      {options.map((o) => (
        <button key={String(o.v)} class={value === o.v ? 'on' : ''} onClick={() => onChange(value === o.v && !required ? (null as T) : o.v)}>{o.label}</button>
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

/* ---------- pain slider (0–10) ----------
 * Drag sideways or tap anywhere on the track, or step with − and + either side.
 * A vertical swipe scrolls the page instead, so starting a scroll on the slider never changes the value.
 * Unrated, the thumb rests in the middle, so the first − or + steps from 5. */
export function PainSlider({ value, onChange, label }: { value: number | null | undefined; onChange: (v: number) => void; label: string }) {
  const track = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const set = value != null;
  const f = set ? value! / 10 : 0.5;

  const step = (d: number) => {
    const v = Math.max(0, Math.min(10, (value ?? 5) + d));
    if (v !== value) { onChange(v); navigator.vibrate?.(4); }
  };
  function at(clientX: number) {
    const r = track.current!.getBoundingClientRect();
    const v = Math.round(Math.max(0, Math.min(1, (clientX - r.left - 14) / (r.width - 28))) * 10);
    if (v !== value) { onChange(v); navigator.vibrate?.(4); }
  }
  return (
    <div class="pain-adjust">
      <button type="button" class="step-btn" aria-label={`Decrease ${label}`} disabled={value === 0} onClick={() => step(-1)}><IconMinus /></button>
      <div
        ref={track} class={'slider' + (set ? ' set' : '')}
        role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={10} aria-valuenow={value ?? undefined}
        aria-valuetext={set ? `${value}, ${painWord(value!)}` : 'not rated'}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') step(1);
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') step(-1);
        }}
        onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY, dragging: false }; }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          if (!s.dragging && Math.abs(e.clientX - s.x) > 6 && Math.abs(e.clientX - s.x) > Math.abs(e.clientY - s.y)) s.dragging = true;
          if (s.dragging) at(e.clientX);
        }}
        onPointerUp={(e) => {
          const s = start.current;
          if (s && !s.dragging && Math.abs(e.clientX - s.x) < 8 && Math.abs(e.clientY - s.y) < 8) at(e.clientX);
          start.current = null;
        }}
        onPointerCancel={() => { start.current = null; }}
      >
        <div class="slider-track">
          <div class="slider-fill" style={{ clipPath: `inset(0 calc(100% - ${f} * (100% - 28px) - 14px) 0 0)` }} />
        </div>
        <div class="slider-thumb" style={{ left: `calc(${f} * (100% - 28px))` }} />
      </div>
      <button type="button" class="step-btn" aria-label={`Increase ${label}`} disabled={value === 10} onClick={() => step(1)}><IconPlus /></button>
    </div>
  );
}

/** Label + value readout + slider; the building block of the check-in screen. */
export function SliderRow({ label, value, onChange, accessory, children, compact }: {
  label: ComponentChildren;
  value: number | null | undefined;
  onChange: (v: number) => void;
  accessory?: ComponentChildren;
  children?: ComponentChildren;
  compact?: boolean;
}) {
  return (
    <div class={'srow' + (compact ? ' compact' : '')}>
      <div class="srow-top">
        <span class="srow-label">{label}</span>
        <span class="srow-value">
          {value === undefined ? null : value === null ? <span class="muted">Not sure</span> : <>{!compact && <span>{painWord(value)}</span>}<PainPill n={value} /></>}
        </span>
        {accessory}
      </div>
      <PainSlider value={value} onChange={onChange} label={typeof label === 'string' ? label : 'Pain'} />
      {children}
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
