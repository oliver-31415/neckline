import { useState } from 'preact/hooks';
import { POSTURES } from '../lib/catalog';
import { rememberChip, rememberTreatment, settings, uid } from '../lib/store';
import { HOUR, fmtMinutes } from '../lib/time';
import type { PostureEntry, TreatmentEntry } from '../lib/types';
import { ActivityFallback, IconClose, IconExercise, IconPill, IconPosture, POSTURE_ART } from '../components/Icons';

/*
 * "Since your last check-in": pick postures, medications and exercises inline.
 * Every tap adds an item (the same one can be added more than once); each item then
 * takes its own duration / dose chips. Items are saved together with the check-in.
 */

export type Kind = 'posture' | 'med' | 'exercise';
export interface Item {
  key: string;
  kind: Kind;
  name: string; // posture id, or medication / exercise name
  minutes?: number; // posture held for / exercise done for
  hold?: number; // exercise: seconds per hold
  dose?: string; // medication
  agoHours?: number; // medication: taken this long ago
}

const HELD = [5, 15, 30, 60, 120, 180];
const DONE_FOR = [2, 5, 10, 15, 30, 45];
const HOLDS = [5, 10, 20, 30, 60];
const TAKEN = [{ v: 0, label: 'Now' }, { v: 0.5, label: '30 min' }, { v: 1, label: '1 h' }, { v: 2, label: '2 h' }, { v: 4, label: '4 h' }];

export function exerciseDose(minutes: number | null | undefined, hold: number | null | undefined) {
  return [minutes ? `${minutes} min` : '', hold ? `${hold} s holds` : ''].filter(Boolean).join(', ');
}

/** Turns picked items into diary entries, timed relative to `now`. */
export function itemsToEntries(items: Item[], now = Date.now()): (PostureEntry | TreatmentEntry)[] {
  const base = (time: number) => ({ id: uid(), time, createdAt: 0, updatedAt: 0, note: '' });
  return items.map((it) => {
    if (it.kind === 'posture') {
      return { ...base(now - (it.minutes ?? 0) * 60_000), type: 'posture', posture: it.name, minutes: it.minutes ?? null, breaks: null };
    }
    if (it.kind === 'med') {
      rememberTreatment(it.name, 'medication', it.dose?.trim() || undefined);
      return { ...base(now - (it.agoHours ?? 0) * HOUR), type: 'treatment', kind: 'medication', name: it.name, dose: it.dose?.trim() ?? '', helped: null, sideEffects: [] };
    }
    return {
      ...base(now - (it.minutes ?? 0) * 60_000), type: 'treatment', kind: 'exercises', name: it.name,
      dose: exerciseDose(it.minutes, it.hold), minutes: it.minutes ?? null, holdSeconds: it.hold ?? null, helped: null, sideEffects: [],
    };
  });
}

function Pick({ options, value, onChange }: { options: { v: number; label: string }[]; value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <div class="kinds">
      {options.map((o) => (
        <button key={o.v} class={'kind' + (value === o.v ? ' on' : '')} onClick={() => onChange(value === o.v ? undefined : o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

const KIND_STYLE: Record<Kind, { label: string; color: string; Icon: () => preact.JSX.Element }> = {
  posture: { label: 'Posture', color: 'var(--posture)', Icon: IconPosture },
  med: { label: 'Medication', color: 'var(--treatment)', Icon: IconPill },
  exercise: { label: 'Exercise', color: 'var(--activity)', Icon: IconExercise },
};

export function SinceLast({ items, onChange }: { items: Item[]; onChange: (items: Item[]) => void }) {
  const s = settings.value;
  const [open, setOpen] = useState<Kind | null>(null);
  const [medName, setMedName] = useState('');
  const add = (it: Omit<Item, 'key'>) => { onChange([...items, { ...it, key: uid() }]); navigator.vibrate?.(8); };
  const update = (key: string, patch: Partial<Item>) => onChange(items.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const meds = s.treatments.filter((t) => t.kind === 'medication');
  const count = (k: Kind) => items.filter((x) => x.kind === k).length;

  return (
    <section class="section">
      <div class="sec-head"><span>Since your last check-in</span></div>
      <div class="quick-add">
        {(Object.keys(KIND_STYLE) as Kind[]).map((k) => {
          const st = KIND_STYLE[k];
          return (
            <button key={k} class={open === k ? 'on' : ''} aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>
              <span style={{ background: st.color }}><st.Icon /></span>{st.label}{count(k) > 0 && <b class="count">{count(k)}</b>}
            </button>
          );
        })}
      </div>

      {open && (
        <div class="group pad picker">
          {open === 'posture' && (
            <div class="mini-tiles">
              {s.postures.map((p) => {
                const Art = POSTURE_ART[p] ?? ActivityFallback;
                return <button key={p} class="mini-tile" onClick={() => add({ kind: 'posture', name: p })}><Art />{POSTURES[p]?.label ?? p}</button>;
              })}
            </div>
          )}
          {open === 'exercise' && (
            <div class="chips">
              {s.exercises.map((x) => <button key={x} class="chip add-chip" onClick={() => add({ kind: 'exercise', name: x })}>+ {x}</button>)}
              <button class="chip add" onClick={() => { const v = prompt('Exercise')?.trim(); if (v) { rememberChip('exercises', v); add({ kind: 'exercise', name: v }); } }}>Other…</button>
            </div>
          )}
          {open === 'med' && (
            <>
              {meds.length > 0 && (
                <div class="chips">
                  {meds.map((t) => <button key={t.name} class="chip add-chip" onClick={() => add({ kind: 'med', name: t.name, dose: t.dose ?? '', agoHours: 0 })}>+ {t.name}{t.dose ? ` · ${t.dose}` : ''}</button>)}
                </div>
              )}
              <form class="row" onSubmit={(e) => { e.preventDefault(); const v = medName.trim(); if (v) { add({ kind: 'med', name: v, dose: '', agoHours: 0 }); setMedName(''); } }}>
                <input class="input grow" placeholder="Medication" value={medName} autocomplete="off" onInput={(e) => setMedName((e.target as HTMLInputElement).value)} />
                <button class="btn sm" type="submit" disabled={!medName.trim()}>Add</button>
              </form>
            </>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div class="group" style={{ marginTop: 8 }}>
          {items.map((it) => {
            const st = KIND_STYLE[it.kind];
            return (
              <div class="arow" key={it.key}>
                <div class="arow-line">
                  <span class="row-icon small" style={{ background: st.color }}><st.Icon /></span>
                  <span class="item-name">{it.kind === 'posture' ? POSTURES[it.name]?.label ?? it.name : it.name}</span>
                  {it.kind === 'med' && (
                    <input class="input dose" placeholder="Dose" value={it.dose} onInput={(e) => update(it.key, { dose: (e.target as HTMLInputElement).value })} />
                  )}
                  <button class="x-btn" aria-label={`Remove ${it.name}`} onClick={() => onChange(items.filter((x) => x.key !== it.key))}><IconClose /></button>
                </div>
                {it.kind === 'posture' && (
                  <div class="arow-line"><span class="pick-label">Held</span><Pick options={HELD.map((m) => ({ v: m, label: m >= 180 ? '3 h+' : fmtMinutes(m) }))} value={it.minutes} onChange={(minutes) => update(it.key, { minutes })} /></div>
                )}
                {it.kind === 'exercise' && (
                  <>
                    <div class="arow-line"><span class="pick-label">For</span><Pick options={DONE_FOR.map((m) => ({ v: m, label: `${m} min` }))} value={it.minutes} onChange={(minutes) => update(it.key, { minutes })} /></div>
                    <div class="arow-line"><span class="pick-label">Hold</span><Pick options={HOLDS.map((x) => ({ v: x, label: `${x} s` }))} value={it.hold} onChange={(hold) => update(it.key, { hold })} /></div>
                  </>
                )}
                {it.kind === 'med' && (
                  <div class="arow-line"><span class="pick-label">Taken</span><Pick options={TAKEN.map((t) => ({ v: t.v, label: t.v === 0 ? t.label : `${t.label} ago` }))} value={it.agoHours} onChange={(agoHours) => update(it.key, { agoHours })} /></div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
