import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Toggle } from './ui';
import { IconChevron, IconClose } from './Icons';
import { TextRow } from '../forms/LogCards';

/*
 * iOS Settings-style rows for grouped lists (inside a flush Block): a switch, a plain value,
 * a row that opens something, a tappable action, and a small list editor.
 */

export function ToggleRow({ label, sub, checked, onChange, disabled }: { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div class={'set-row' + (disabled ? ' dim' : '')}>
      <span class="set-text"><span>{label}</span>{sub && <span class="set-sub">{sub}</span>}</span>
      <Toggle checked={checked} label={label} onChange={(v) => !disabled && onChange(v)} />
    </div>
  );
}

export function ValueRow({ label, value, children }: { label: string; value?: ComponentChildren; children?: ComponentChildren }) {
  return (
    <div class="set-row">
      <span class="set-text"><span>{label}</span></span>
      {value != null && <span class="set-value">{value}</span>}
      {children}
    </div>
  );
}

export function NavRow({ label, value, onClick }: { label: string; value?: ComponentChildren; onClick: () => void }) {
  return (
    <button type="button" class="set-row tap" onClick={onClick}>
      <span class="set-text"><span>{label}</span></span>
      {value != null && <span class="set-value">{value}</span>}
      <span class="row-chev"><IconChevron /></span>
    </button>
  );
}

export function ActionRow({ label, onClick, danger, disabled, icon }: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean; icon?: ComponentChildren }) {
  return (
    <button type="button" class={'set-row tap action' + (danger ? ' danger' : '')} disabled={disabled} onClick={onClick}>
      {icon && <span class="set-icon">{icon}</span>}
      <span>{label}</span>
    </button>
  );
}

export function DateRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label class="trow">
      <span class="mrow-label">{label}</span>
      <input type="date" class="trow-input" value={value} onChange={(e) => onChange((e.target as HTMLInputElement).value)} />
    </label>
  );
}

/** A list you can remove from (−) and add to (bottom row). */
export function ListEditor({ items, label = (v) => v, onRemove, onAdd, addLabel }: {
  items: string[]; label?: (v: string) => string; onRemove: (v: string) => void; onAdd?: (v: string) => void; addLabel?: string;
}) {
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim();
    if (v && onAdd && !items.some((x) => x.toLowerCase() === v.toLowerCase())) onAdd(v);
    setText('');
  };
  return (
    <div class="group">
      {items.map((v) => (
        <div class="set-row" key={v}>
          <span class="set-text"><span>{label(v)}</span></span>
          <button type="button" class="x-btn" aria-label={`Remove ${label(v)}`} onClick={() => onRemove(v)}><IconClose /></button>
        </div>
      ))}
      {onAdd && <TextRow label="Add" placeholder={addLabel} actionLabel="Add" value={text} onInput={setText} onDone={add} />}
    </div>
  );
}
