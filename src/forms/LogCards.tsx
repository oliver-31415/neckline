import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { POSTURES } from '../lib/catalog';
import { rememberChip, rememberTreatment, settings, uid } from '../lib/store';
import { HOUR, fmtMinutes, fromLocalInput, toLocalInput } from '../lib/time';
import type { PostureEntry, TreatmentEntry } from '../lib/types';
import { ActivityFallback, IconClose, IconExercise, IconPill, IconPosture, IconPulse, POSTURE_ART } from '../components/Icons';

/*
 * The home screen is built from cards: a symptom, a posture, a medication or an exercise.
 * Any number can be stacked and saved together; each keeps its own time and length.
 */

export type CardKind = 'symptom' | 'posture' | 'med' | 'exercise';
/** when: null means "now", resolved at save time. */
export interface PostureCard { key: string; kind: 'posture'; posture?: string; when: number | null; minutes?: number }
export interface MedCard { key: string; kind: 'med'; name?: string; dose: string; when: number | null }
export interface ExerciseCard { key: string; kind: 'exercise'; name?: string; when: number | null; minutes?: number; hold?: number }
export type OtherCard = PostureCard | MedCard | ExerciseCard;

export const CARD_STYLE: Record<CardKind, { label: string; color: string; Icon: () => preact.JSX.Element }> = {
  symptom: { label: 'Symptom', color: 'var(--pain)', Icon: IconPulse },
  posture: { label: 'Posture', color: 'var(--posture)', Icon: IconPosture },
  med: { label: 'Medication', color: 'var(--treatment)', Icon: IconPill },
  exercise: { label: 'Exercise', color: 'var(--activity)', Icon: IconExercise },
};

const HELD = [5, 15, 30, 60, 120, 180, 240];
const DONE_FOR = [10, 20, 30, 45, 60, 90, 120];
const HOLDS = [5, 10, 20, 30, 60];
const AGO = [0, 0.5, 1, 2, 4, 8, 24];

/** Stretch-type exercises also get a "hold" row. */
const hasHolds = (name: string) => /stretch|physio|yoga|pilates|tuck|glide|hold/i.test(name);

export function exerciseDose(minutes: number | null | undefined, hold: number | null | undefined) {
  return [minutes ? `${minutes} min` : '', hold ? `${hold} s holds` : ''].filter(Boolean).join(', ');
}

export function cardReady(c: OtherCard) {
  return c.kind === 'posture' ? !!c.posture : !!c.name;
}

/** Turns a finished card into a diary entry. A posture or exercise logged "now" with a length is taken to have just ended. */
export function cardEntry(c: OtherCard, now: number, group?: string): PostureEntry | TreatmentEntry {
  const base = (time: number) => ({ id: uid(), time, createdAt: 0, updatedAt: 0, note: '', group });
  const start = (minutes?: number) => c.when ?? now - (minutes ?? 0) * 60_000;
  if (c.kind === 'posture') {
    return { ...base(start(c.minutes)), type: 'posture', posture: c.posture!, minutes: c.minutes ?? null, breaks: null };
  }
  if (c.kind === 'med') {
    rememberTreatment(c.name!, 'medication', c.dose.trim() || undefined);
    return { ...base(c.when ?? now), type: 'treatment', kind: 'medication', name: c.name!, dose: c.dose.trim(), helped: null, sideEffects: [] };
  }
  return {
    ...base(start(c.minutes)), type: 'treatment', kind: 'exercises', name: c.name!,
    dose: exerciseDose(c.minutes, c.hold), minutes: c.minutes ?? null, holdSeconds: c.hold ?? null, helped: null, sideEffects: [],
  };
}

/** One-tap choices in a horizontally scrolling row; tapping the chosen one clears it. */
export function Pick<T extends string | number>({ options, value, onChange }: { options: { v: T; label: string }[]; value: T | undefined | null; onChange: (v: T | undefined) => void }) {
  return (
    <div class="kinds">
      {options.map((o) => (
        <button key={String(o.v)} class={'kind' + (value === o.v ? ' on' : '')} aria-pressed={value === o.v} onClick={() => onChange(value === o.v ? undefined : o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

export function FieldRow({ label, children }: { label: string; children: ComponentChildren }) {
  return <div class="frow"><span class="pick-label">{label}</span>{children}</div>;
}

/** Now / so long ago / yesterday, or an exact date and time. null = now. */
export function WhenRow({ label = 'When', value, onChange }: { label?: string; value: number | null; onChange: (t: number | null) => void }) {
  const [base] = useState(() => Date.now());
  const is = (h: number) => (h === 0 ? value == null : value != null && Math.abs(base - h * HOUR - value) < 60_000);
  const custom = value != null && !AGO.some((h) => h && is(h));
  return (
    <FieldRow label={label}>
      <div class="kinds">
        {AGO.map((h) => (
          <button key={h} class={'kind' + (is(h) ? ' on' : '')} aria-pressed={is(h)} onClick={() => onChange(h ? base - h * HOUR : null)}>
            {h === 0 ? 'Now' : h === 24 ? 'Yesterday' : h < 1 ? '30 min ago' : `${h} h ago`}
          </button>
        ))}
        <input
          type="datetime-local" class={'kind dt' + (custom ? ' on' : '')} aria-label={`${label}: exact time`}
          value={toLocalInput(value ?? base)} max={toLocalInput(Date.now() + 60_000)}
          onChange={(e) => { const v = (e.target as HTMLInputElement).value; if (v) onChange(fromLocalInput(v)); }}
        />
      </div>
    </FieldRow>
  );
}

/** Card frame: coloured icon, title, optional "Change", remove. */
export function CardShell({ kind, title, onChange, onRemove, children }: { kind: CardKind; title?: string; onChange?: () => void; onRemove?: () => void; children: ComponentChildren }) {
  const st = CARD_STYLE[kind];
  return (
    <section class="section log-card">
      <div class="group">
        <div class="card-top">
          <span class="row-icon small" style={{ background: st.color }}><st.Icon /></span>
          <span class="card-title">{title ?? st.label}</span>
          {onChange && <button class="link small" onClick={onChange}>Change</button>}
          <span class="grow" />
          {onRemove && <button class="x-btn" aria-label={`Remove ${title ?? st.label}`} onClick={onRemove}><IconClose /></button>}
        </div>
        {children}
      </div>
    </section>
  );
}

export function OtherCardView({ card, onChange, onRemove }: { card: OtherCard; onChange: (c: OtherCard) => void; onRemove: () => void }) {
  const s = settings.value;
  const [picking, setPicking] = useState(false);
  const [text, setText] = useState('');
  const set = (p: Partial<OtherCard>) => onChange({ ...card, ...p } as OtherCard);
  const ready = cardReady(card) && !picking;
  const choose = (p: Partial<OtherCard>) => { set(p); setPicking(false); setText(''); navigator.vibrate?.(8); };

  if (card.kind === 'posture') {
    const title = card.posture ? POSTURES[card.posture]?.label ?? card.posture : undefined;
    return (
      <CardShell kind="posture" title={ready ? title : undefined} onChange={ready ? () => setPicking(true) : undefined} onRemove={onRemove}>
        {!ready ? (
          <div class="pad-box">
            <div class="mini-tiles">
              {s.postures.map((p) => {
                const Art = POSTURE_ART[p] ?? ActivityFallback;
                return <button key={p} class={'mini-tile' + (card.posture === p ? ' on' : '')} onClick={() => choose({ posture: p })}><Art />{POSTURES[p]?.label ?? p}</button>;
              })}
            </div>
          </div>
        ) : (
          <>
            <WhenRow value={card.when} onChange={(when) => set({ when })} />
            <FieldRow label="For">
              <Pick options={HELD.map((m) => ({ v: m, label: fmtMinutes(m) }))} value={card.minutes} onChange={(minutes) => set({ minutes })} />
            </FieldRow>
          </>
        )}
      </CardShell>
    );
  }

  const isMed = card.kind === 'med';
  const names = isMed ? s.treatments.filter((t) => t.kind === 'medication').map((t) => t.name) : s.exercises;
  const add = (e: Event) => {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    if (!isMed) rememberChip('exercises', v);
    const saved = isMed ? s.treatments.find((t) => t.name.toLowerCase() === v.toLowerCase()) : undefined;
    choose(isMed ? { name: v, dose: saved?.dose ?? card.dose } : { name: v });
  };
  return (
    <CardShell kind={card.kind} title={ready ? card.name : undefined} onChange={ready ? () => setPicking(true) : undefined} onRemove={onRemove}>
      {!ready ? (
        <div class="pad-box stack">
          {names.length > 0 && (
            <div class="chips">
              {names.map((n) => (
                <button
                  key={n} class={'chip' + (card.name === n ? ' on' : '')}
                  onClick={() => choose(isMed ? { name: n, dose: s.treatments.find((t) => t.name === n)?.dose ?? '' } : { name: n })}
                >{n}</button>
              ))}
            </div>
          )}
          <form class="row" onSubmit={add}>
            <input class="input grow" placeholder={isMed ? 'Medication' : 'Other exercise'} value={text} autocomplete="off" onInput={(e) => setText((e.target as HTMLInputElement).value)} />
            <button class="btn sm" type="submit" disabled={!text.trim()}>Add</button>
          </form>
        </div>
      ) : card.kind === 'med' ? (
        <>
          <FieldRow label="Dose">
            <input class="input dose" value={card.dose} onInput={(e) => set({ dose: (e.target as HTMLInputElement).value })} />
          </FieldRow>
          <WhenRow label="Taken" value={card.when} onChange={(when) => set({ when })} />
        </>
      ) : (
        <>
          <WhenRow value={card.when} onChange={(when) => set({ when })} />
          <FieldRow label="For">
            <Pick options={DONE_FOR.map((m) => ({ v: m, label: fmtMinutes(m) }))} value={card.minutes} onChange={(minutes) => set({ minutes })} />
          </FieldRow>
          {hasHolds(card.name!) && (
            <FieldRow label="Hold">
              <Pick options={HOLDS.map((x) => ({ v: x, label: `${x} s` }))} value={card.hold} onChange={(hold) => set({ hold })} />
            </FieldRow>
          )}
        </>
      )}
    </CardShell>
  );
}
