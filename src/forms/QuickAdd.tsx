import { useState } from 'preact/hooks';
import { Block, Chips, Seg, Sheet } from '../components/ui';
import { POSTURES } from '../lib/catalog';
import { rememberChip, rememberTreatment, settings, uid } from '../lib/store';
import { HOUR, fmtMinutes } from '../lib/time';
import type { PostureEntry, TreatmentEntry } from '../lib/types';
import { PostureTiles } from './common';

/*
 * Small "add to this check-in" sheets. Each returns an entry to the check-in screen,
 * which saves them together. Every field except the main choice is optional.
 */

export type Extra = PostureEntry | TreatmentEntry;

const stamp = (time: number) => ({ id: uid(), time, createdAt: 0, updatedAt: 0, note: '' });

function Pick<T extends string | number | null>({ options, value, onChange }: { options: { v: T; label: string }[]; value: T | undefined; onChange: (v: T | undefined) => void }) {
  return (
    <div class="chips">
      {options.map((o) => (
        <button key={String(o.v)} class={'chip' + (value === o.v ? ' on' : '')} onClick={() => onChange(value === o.v ? undefined : o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

const HELD = [5, 15, 30, 60, 120, 180].map((m) => ({ v: m, label: m >= 180 ? '3 h +' : fmtMinutes(m) }));

export function QuickPosture({ onAdd, onClose }: { onAdd: (e: Extra) => void; onClose: () => void }) {
  const [posture, setPosture] = useState('');
  const [minutes, setMinutes] = useState<number | undefined>();
  const [breaks, setBreaks] = useState<PostureEntry['breaks']>(null);
  return (
    <Sheet title="Posture" onClose={onClose} tall action={{ label: 'Add', disabled: !posture, onClick: () => {
      const m = minutes ?? null;
      onAdd({ ...stamp(Date.now() - (m ?? 0) * 60_000), type: 'posture', posture, minutes: m, breaks });
    } }}>
      <Block title="Position you were in">
        <PostureTiles single options={settings.value.postures} value={posture ? [posture] : []} onChange={(v) => setPosture(v[0] ?? '')} />
      </Block>
      <Block title="Held for" aside="optional">
        <Pick options={HELD} value={minutes} onChange={setMinutes} />
      </Block>
      <Block title="Breaks" aside="optional">
        <Seg options={[{ v: 'yes', label: 'Yes' }, { v: 'some', label: 'A few' }, { v: 'no', label: 'No' }]} value={breaks} onChange={setBreaks} />
      </Block>
    </Sheet>
  );
}

const TAKEN = [
  { v: 0, label: 'Just now' }, { v: 0.5, label: '30 min ago' }, { v: 1, label: '1 h ago' }, { v: 2, label: '2 h ago' }, { v: 4, label: '4 h ago' },
];

export function QuickMed({ onAdd, onClose }: { onAdd: (e: Extra) => void; onClose: () => void }) {
  const saved = settings.value.treatments.filter((t) => t.kind === 'medication');
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [ago, setAgo] = useState<number | undefined>(0);
  return (
    <Sheet title="Medication" onClose={onClose} tall action={{ label: 'Add', disabled: !name.trim(), onClick: () => {
      rememberTreatment(name.trim(), 'medication', dose.trim() || undefined);
      onAdd({ ...stamp(Date.now() - (ago ?? 0) * HOUR), type: 'treatment', kind: 'medication', name: name.trim(), dose: dose.trim(), helped: null, sideEffects: [] });
    } }}>
      {saved.length > 0 && (
        <Block title="Your medications">
          <div class="chips">
            {saved.map((t) => (
              <button key={t.name} class={'chip' + (name === t.name ? ' on' : '')} onClick={() => { setName(t.name); setDose(t.dose ?? ''); }}>
                {t.name}{t.dose ? <span style={{ opacity: 0.7 }}> · {t.dose}</span> : null}
              </button>
            ))}
          </div>
        </Block>
      )}
      <Block title={saved.length ? 'Or type it' : 'Medication'}>
        <input class="input" placeholder="Name, e.g. Ibuprofen" value={name} autocomplete="off" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <input class="input" placeholder="Dose, e.g. 400 mg (optional)" value={dose} autocomplete="off" onInput={(e) => setDose((e.target as HTMLInputElement).value)} />
      </Block>
      <Block title="Taken" aside="optional">
        <Pick options={TAKEN} value={ago} onChange={setAgo} />
      </Block>
    </Sheet>
  );
}

const DONE_FOR = [2, 5, 10, 15, 30, 45].map((m) => ({ v: m, label: `${m} min` }));
const HOLDS = [5, 10, 20, 30, 60].map((s) => ({ v: s, label: `${s} s` }));

export function exerciseDose(minutes: number | null | undefined, hold: number | null | undefined) {
  return [minutes ? `${minutes} min` : '', hold ? `${hold} s holds` : ''].filter(Boolean).join(', ');
}

export function QuickExercise({ onAdd, onClose }: { onAdd: (e: Extra) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState<number | undefined>();
  const [hold, setHold] = useState<number | undefined>();
  return (
    <Sheet title="Exercise" onClose={onClose} tall action={{ label: 'Add', disabled: !name, onClick: () => {
      onAdd({
        ...stamp(Date.now() - (minutes ?? 0) * 60_000), type: 'treatment', kind: 'exercises', name,
        dose: exerciseDose(minutes, hold), minutes: minutes ?? null, holdSeconds: hold ?? null, helped: null, sideEffects: [],
      });
    } }}>
      <Block title="Exercise">
        <Chips single options={settings.value.exercises} value={name ? [name] : []} onChange={(v) => setName(v[0] ?? '')} onAdd={(v) => rememberChip('exercises', v)} />
      </Block>
      <Block title="Done for" aside="optional">
        <Pick options={DONE_FOR} value={minutes} onChange={setMinutes} />
      </Block>
      <Block title="Each hold" aside="optional">
        <Pick options={HOLDS} value={hold} onChange={setHold} />
      </Block>
    </Sheet>
  );
}

export function extraSummary(e: Extra) {
  if (e.type === 'posture') return { title: POSTURES[e.posture]?.label ?? e.posture, detail: [e.minutes ? `held ${fmtMinutes(e.minutes)}` : '', e.breaks ? `breaks: ${e.breaks === 'some' ? 'a few' : e.breaks}` : ''].filter(Boolean).join(' · ') };
  return { title: e.name, detail: e.dose ?? '' };
}
