import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { POSTURES } from '../lib/catalog';
import { rememberChip, rememberTreatment, settings, uid } from '../lib/store';
import { HOUR, fmtDayRelative, fmtMinutes, fmtTime, fromLocalInput, toLocalInput } from '../lib/time';
import type { PostureEntry, TreatmentEntry } from '../lib/types';
import { IconBody, IconClose, IconPill, IconPosture, IconSymptom } from '../components/Icons';
import { MenuRow, type MenuItem } from '../components/Menu';

/*
 * The home screen is built from cards: pain, a symptom, a medication, or a posture/exercise.
 * Any number can be stacked and saved together; each keeps its own time and length.
 */

export type CardKind = 'pain' | 'symptom' | 'med' | 'move';
/** when: null means "now", resolved at save time. fresh: just added, so its first menu opens by itself. */
export interface MedCard { key: string; kind: 'med'; fresh?: boolean; name?: string; dose: string; when: number | null }
/** pick: "p:<posture id>" or "x:<exercise name>". */
export interface MoveCard { key: string; kind: 'move'; fresh?: boolean; pick?: string; when: number | null; minutes?: number; hold?: number }
export type OtherCard = MedCard | MoveCard;

export const CARD_STYLE: Record<CardKind, { label: string; color: string; Icon: () => preact.JSX.Element }> = {
  pain: { label: 'Pain', color: 'var(--pain)', Icon: IconBody },
  symptom: { label: 'Symptom', color: 'var(--symptom)', Icon: IconSymptom },
  med: { label: 'Medication', color: 'var(--treatment)', Icon: IconPill },
  move: { label: 'Posture or exercise', color: 'var(--posture)', Icon: IconPosture },
};

const FOR = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360];
const HOLDS = [5, 10, 15, 20, 30, 45, 60];
const AGO = [0, 0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 24];
const agoLabel = (h: number) => (h === 0 ? 'Now' : h === 24 ? 'Yesterday, same time' : h < 1 ? `${h * 60} min ago` : `${h} h ago`);

/** Stretch-type exercises also get a "hold" row. */
const hasHolds = (name: string) => /stretch|physio|yoga|pilates|tuck|glide|hold/i.test(name);

export function exerciseDose(minutes: number | null | undefined, hold: number | null | undefined) {
  return [minutes ? `${minutes} min` : '', hold ? `${hold} s holds` : ''].filter(Boolean).join(', ');
}

export const moveLabel = (pick: string) => (pick.startsWith('p:') ? POSTURES[pick.slice(2)]?.label ?? pick.slice(2) : pick.slice(2));

export function cardReady(c: OtherCard) {
  return c.kind === 'move' ? !!c.pick : !!c.name;
}

/** Turns a finished card into a diary entry. A posture or exercise logged "now" with a length is taken to have just ended. */
export function cardEntry(c: OtherCard, now: number, group?: string): PostureEntry | TreatmentEntry {
  const base = (time: number) => ({ id: uid(), time, createdAt: 0, updatedAt: 0, note: '', group });
  if (c.kind === 'med') {
    rememberTreatment(c.name!, 'medication', c.dose.trim() || undefined);
    return { ...base(c.when ?? now), type: 'treatment', kind: 'medication', name: c.name!, dose: c.dose.trim(), helped: null, sideEffects: [] };
  }
  const start = c.when ?? now - (c.minutes ?? 0) * 60_000;
  if (c.pick!.startsWith('p:')) {
    return { ...base(start), type: 'posture', posture: c.pick!.slice(2), minutes: c.minutes ?? null, breaks: null };
  }
  return {
    ...base(start), type: 'treatment', kind: 'exercises', name: c.pick!.slice(2),
    dose: exerciseDose(c.minutes, c.hold), minutes: c.minutes ?? null, holdSeconds: c.hold ?? null, helped: null, sideEffects: [],
  };
}

/**
 * iOS only opens the keyboard for a focus made during the tap itself, but the field a menu choice
 * reveals only exists after the next render. Focusing a stand-in field during the tap opens the
 * keyboard, and it stays open when TextRow then moves focus to the real field.
 */
export function primeKeyboard() {
  const el = document.createElement('input');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;top:40%;left:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0';
  document.body.appendChild(el);
  el.focus({ preventScroll: true });
  setTimeout(() => el.remove(), 1000);
}

/** Label on the left, a text field on the right, like an iOS form row. */
export function TextRow({ label, value, onInput, onDone, placeholder, autoFocus, type = 'text' }: {
  label: string; value: string; onInput: (v: string) => void; onDone?: () => void; placeholder?: string; autoFocus?: boolean; type?: 'text' | 'password' | 'url';
}) {
  const input = useRef<HTMLInputElement>(null);
  // autofocus only works on page load, so focus by hand when the row appears or is asked to.
  useEffect(() => { if (autoFocus) input.current?.focus(); }, [autoFocus]);
  return (
    <label class="trow">
      <span class="mrow-label">{label}</span>
      <input
        ref={input} type={type as 'text'} class="trow-input" value={value} placeholder={placeholder} autocomplete="off" enterkeyhint="done"
        autocapitalize={type === 'text' ? undefined : 'off'} spellcheck={type === 'text' ? undefined : false}
        onInput={(e) => onInput((e.target as HTMLInputElement).value)}
        // Enter just leaves the field; onBlur then finishes it, so it runs once.
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
        onBlur={() => onDone?.()}
      />
    </label>
  );
}

/** Now / so long ago / yesterday, or an exact date and time. null = now. */
export function WhenRow({ label = 'When', value, onChange }: { label?: string; value: number | null; onChange: (t: number | null) => void }) {
  const [base] = useState(() => Date.now());
  const [picking, setPicking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const preset = value == null ? 0 : AGO.find((h) => h && Math.abs(base - h * HOUR - value) < 60_000);
  const display = value == null ? 'Now' : preset === 24 ? `Yesterday, ${fmtTime(value)}` : preset != null ? agoLabel(preset) : `${fmtDayRelative(value)}, ${fmtTime(value)}`;
  const items: MenuItem[] = [...AGO.map((h) => ({ v: String(h), label: agoLabel(h) })), { v: 'pick', label: 'Choose date & time…', action: true }];
  useEffect(() => {
    if (!picking) return;
    input.current?.focus();
    try { input.current?.showPicker?.(); } catch { /* not allowed without a direct tap on some browsers */ }
  }, [picking]);
  return (
    <>
      <MenuRow
        label={label} display={display} items={items} value={preset != null ? [String(preset)] : []}
        onChange={([v]) => { setPicking(false); onChange(v === '0' ? null : base - Number(v) * HOUR); }}
        onAction={() => setPicking(true)}
      />
      {(picking || (value != null && preset == null)) && (
        <label class="trow">
          <span class="mrow-label">Date & time</span>
          <input
            ref={input} type="datetime-local" class="trow-input" value={toLocalInput(value ?? base)} max={toLocalInput(Date.now() + 60_000)}
            onChange={(e) => { const v = (e.target as HTMLInputElement).value; if (v) onChange(fromLocalInput(v)); }}
          />
        </label>
      )}
    </>
  );
}

export function MinutesRow({ label, value, options = FOR, unit = 'min', onChange }: { label: string; value: number | undefined; options?: number[]; unit?: 'min' | 's'; onChange: (v: number | undefined) => void }) {
  const fmt = (n: number) => (unit === 's' ? `${n} s` : fmtMinutes(n));
  return (
    <MenuRow
      label={label} display={value ? fmt(value) : undefined}
      items={[{ v: '', label: 'Not set' }, ...options.map((m) => ({ v: String(m), label: fmt(m) }))]}
      value={[value ? String(value) : '']} onChange={([v]) => onChange(v ? Number(v) : undefined)}
    />
  );
}

/** Card frame: coloured icon, title, remove. */
export function CardShell({ kind, title, onRemove, children }: { kind: CardKind; title?: string; onRemove?: () => void; children: ComponentChildren }) {
  const st = CARD_STYLE[kind];
  return (
    <section class="section log-card">
      <div class="group">
        <div class="card-top">
          <span class="row-icon small" style={{ background: st.color }}><st.Icon /></span>
          <span class="card-title">{title || st.label}</span>
          <span class="grow" />
          {onRemove && <button class="x-btn" aria-label={`Remove ${title || st.label}`} onClick={onRemove}><IconClose /></button>}
        </div>
        {children}
      </div>
    </section>
  );
}

export function OtherCardView({ card, onChange, onRemove }: { card: OtherCard; onChange: (c: OtherCard) => void; onRemove: () => void }) {
  const s = settings.value;
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const set = (p: Partial<OtherCard>) => onChange({ ...card, ...p } as OtherCard);

  if (card.kind === 'move') {
    const items: MenuItem[] = [
      ...s.postures.map((p) => ({ v: `p:${p}`, label: POSTURES[p]?.label ?? p, section: 'Posture' })),
      ...s.exercises.map((x) => ({ v: `x:${x}`, label: x, section: 'Exercise' })),
      { v: 'new', label: 'Other exercise…', action: true, section: 'Exercise' },
    ];
    const commit = () => {
      const v = text.trim();
      if (v) { rememberChip('exercises', v); set({ pick: `x:${v}` }); }
      setTyping(false);
      setText('');
    };
    const exercise = card.pick?.startsWith('x:');
    return (
      <CardShell kind="move" onRemove={onRemove}>
        <MenuRow
          label="What" placeholder="Choose" display={card.pick ? moveLabel(card.pick) : undefined} autoOpen={card.fresh && !card.pick}
          items={items} value={card.pick ? [card.pick] : []} onChange={([pick]) => set({ pick })} onAction={() => { primeKeyboard(); setTyping(true); }}
        />
        {typing && <TextRow label="Exercise" value={text} onInput={setText} onDone={commit} autoFocus />}
        {card.pick && (
          <>
            <WhenRow value={card.when} onChange={(when) => set({ when })} />
            <MinutesRow label="For" value={card.minutes} onChange={(minutes) => set({ minutes })} />
            {exercise && hasHolds(card.pick.slice(2)) && (
              <MinutesRow label="Each hold" unit="s" options={HOLDS} value={card.hold} onChange={(hold) => set({ hold })} />
            )}
          </>
        )}
      </CardShell>
    );
  }

  const meds = s.treatments.filter((t) => t.kind === 'medication');
  const commit = () => {
    const v = text.trim();
    if (v) set({ name: v, dose: meds.find((t) => t.name.toLowerCase() === v.toLowerCase())?.dose ?? card.dose });
    setTyping(false);
    setText('');
  };
  return (
    <CardShell kind="med" onRemove={onRemove}>
      {!meds.length ? (
        // Nothing saved yet, so there's nothing to pick: just type the name.
        <TextRow
          label="Medication" placeholder="Name" value={card.name ?? ''} autoFocus={card.fresh && !card.name}
          onInput={(name) => set({ name: name || undefined })} onDone={() => set({ name: card.name?.trim() || undefined })}
        />
      ) : typing ? (
        <TextRow label="Medication" placeholder="Name" value={text} onInput={setText} onDone={commit} autoFocus />
      ) : (
        <MenuRow
          label="Medication" placeholder="Choose" display={card.name} autoOpen={card.fresh && !card.name}
          items={[...meds.map((t) => ({ v: t.name, label: t.dose ? `${t.name} · ${t.dose}` : t.name })), { v: 'new', label: 'New medication…', action: true }]}
          value={card.name ? [card.name] : []}
          onChange={([name]) => set({ name, dose: meds.find((t) => t.name === name)?.dose ?? '' })}
          onAction={() => { primeKeyboard(); setTyping(true); }}
        />
      )}
      {card.name && (
        <>
          <TextRow label="Dose" value={card.dose} onInput={(dose) => set({ dose })} />
          <WhenRow label="Taken" value={card.when} onChange={(when) => set({ when })} />
        </>
      )}
    </CardShell>
  );
}
