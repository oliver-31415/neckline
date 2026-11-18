import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { Fragment, type ComponentChildren } from 'preact';
import { IconCheck, IconUpDown } from './Icons';

/*
 * iOS-style pop-up menu: tap a row, a rounded list opens beside it with a checkmark on the
 * current choice. Single choice closes on tap; multi choice stays open until you tap away.
 */

export interface MenuItem {
  v: string;
  label: string;
  section?: string; // items with the same section are grouped under a small heading
  action?: boolean; // runs onAction instead of being selected (e.g. "New…")
}

interface Props {
  items: MenuItem[];
  value: string[];
  multi?: boolean;
  onChange: (v: string[]) => void;
  onAction?: (v: string) => void;
  autoOpen?: boolean;
  class?: string;
  label: string;
  children: ComponentChildren;
}

export function MenuButton({ items, value, multi, onChange, onAction, autoOpen, class: cls, label, children }: Props) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const place = () => btn.current && setRect(btn.current.getBoundingClientRect());
  useEffect(() => {
    if (!autoOpen) return;
    const t = window.setTimeout(() => { place(); setOpen(true); }, 380);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(it: MenuItem) {
    navigator.vibrate?.(6);
    if (it.action) { setOpen(false); onAction?.(it.v); return; }
    if (!multi) { onChange([it.v]); setOpen(false); return; }
    onChange(value.includes(it.v) ? value.filter((x) => x !== it.v) : [...value, it.v]);
  }

  return (
    <>
      <button ref={btn} type="button" class={cls} aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => { place(); setOpen(true); }}>
        {children}
      </button>
      {open && rect && createPortal(
        <div class="menu-backdrop" onClick={() => setOpen(false)}>
          <MenuList rect={rect} items={items} value={value} multi={multi} label={label} onPick={pick} />
        </div>,
        document.body,
      )}
    </>
  );
}

function MenuList({ rect, items, value, multi, label, onPick }: { rect: DOMRect; items: MenuItem[]; value: string[]; multi?: boolean; label: string; onPick: (it: MenuItem) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<Record<string, string | number>>({ visibility: 'hidden' });

  // Open below the row when there's room, otherwise above; keep clear of the tab bar.
  useLayoutEffect(() => {
    const el = list.current!;
    const vh = window.innerHeight, vw = window.innerWidth;
    const width = Math.min(280, vw - 32);
    // Line up with the side of the screen the button sits on, and stay on screen.
    const fromLeft = rect.left + rect.width / 2 < vw / 2;
    const left = Math.min(vw - width - 16, Math.max(16, fromLeft ? rect.left : rect.right - width));
    const want = Math.min(el.scrollHeight, 420);
    const below = vh - rect.bottom - 136; // clear of the save bar and tab bar
    const above = rect.top - 24;
    const down = below >= want || below >= above;
    setStyle({
      width, left, maxHeight: Math.max(160, down ? below : above),
      ...(down ? { top: rect.bottom + 6 } : { bottom: vh - rect.top + 6 }),
      transformOrigin: `${down ? 'top' : 'bottom'} ${fromLeft ? 'left' : 'right'}`,
    });
    // Bring the current choice into view in a long list.
    el.querySelector<HTMLElement>('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [rect.top, rect.bottom, rect.right]);

  let section: string | undefined;
  return (
    <div ref={list} class="menu" role="menu" aria-label={label} style={style} onClick={(e) => e.stopPropagation()}>
      {items.map((it) => {
        const head = it.section && it.section !== section ? it.section : null;
        section = it.section;
        const on = value.includes(it.v);
        return (
          <Fragment key={it.v}>
            {head && <div class="menu-section">{head}</div>}
            <button
              type="button" class={'menu-item' + (it.action ? ' action' : '')}
              role={multi ? 'menuitemcheckbox' : 'menuitemradio'} aria-checked={on} onClick={() => onPick(it)}
            >
              <span class="menu-check">{on && <IconCheck />}</span>
              <span>{it.label}</span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

/** A grouped-list row that opens a menu: label on the left, current choice on the right. */
export function MenuRow({ label, display, placeholder = 'Not set', ...rest }: Omit<Props, 'children' | 'class'> & { display?: string; placeholder?: string }) {
  return (
    <MenuButton class="mrow" label={label} {...rest}>
      <span class="mrow-label">{label}</span>
      <span class={'mrow-value' + (display ? ' set' : '')}>{display || placeholder}</span>
      <span class="mrow-icon"><IconUpDown /></span>
    </MenuButton>
  );
}
