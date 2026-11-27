import { useEffect, useState } from 'preact/hooks';
import { Block, Chips, Seg, Sheet, WhenPicker } from '../components/ui';
import { IconCamera } from '../components/Icons';
import { HELPED_LABELS, POSTURES, POSTURE_DURATIONS, TREATMENT_KINDS } from '../lib/catalog';
import { closeSheet } from '../lib/nav';
import { rememberChip, rememberPosture, rememberTreatment, settings, uid } from '../lib/store';
import { getPhoto, putPhoto } from '../lib/db';
import { dayKey, fmtDay, fromDayKey } from '../lib/time';
import type { ActivityEntry, DayEntry, Helped, MealEntry, PostureEntry, TreatmentEntry } from '../lib/types';
import { ActivityTiles, DeleteRow, PostureTiles, commit } from './common';

const base = () => ({ id: uid(), time: Date.now(), createdAt: 0, updatedAt: 0, note: '' });

function DurationChips({ value, onChange }: { value: number | null; onChange: (m: number | null) => void }) {
  return (
    <div class="chips">
      {POSTURE_DURATIONS.map((o) => (
        <button key={o.label} class={'chip' + (value === o.minutes ? ' on' : '')} onClick={() => onChange(o.minutes)}>{o.label}</button>
      ))}
    </div>
  );
}

function Note({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <Block title="Note">
      <textarea class="input" style={{ minHeight: 64 }} value={value} onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)} />
    </Block>
  );
}

/* ---------------- posture ---------------- */
export function PostureForm({ entry }: { entry?: PostureEntry }) {
  const isNew = !entry;
  const [d, setD] = useState<PostureEntry>(() => entry ?? { ...base(), type: 'posture', posture: '', minutes: undefined as unknown as null, breaks: null });
  const set = (p: Partial<PostureEntry>) => setD({ ...d, ...p });
  return (
    <Sheet title="Posture" onClose={closeSheet} tall action={{ label: isNew ? 'Add' : 'Save', onClick: () => d.posture ? commit({ ...d, minutes: d.minutes ?? null }, isNew) : alert('Pick a posture first.') }}>
      <WhenPicker value={d.time} onChange={(time) => set({ time })} />
      <Block title="How was your head and neck mostly?">
        <PostureTiles single options={settings.value.postures} value={d.posture ? [d.posture] : []} onChange={(v) => set({ posture: v[0] ?? '' })} onAdd={(v) => rememberPosture(v)} />
      </Block>
      <Block title="Roughly how long?">
        <DurationChips value={d.minutes} onChange={(minutes) => set({ minutes })} />
      </Block>
      <Block title="Did you take breaks?">
        <Seg options={[{ v: 'yes', label: 'Yes' }, { v: 'some', label: 'A few' }, { v: 'no', label: 'No' }]} value={d.breaks} onChange={(breaks) => set({ breaks })} />
      </Block>
      <Note value={d.note} onChange={(note) => set({ note })} />
      <DeleteRow isNew={isNew} id={d.id} />
    </Sheet>
  );
}

/* ---------------- activity ---------------- */
export function ActivityForm({ entry }: { entry?: ActivityEntry }) {
  const isNew = !entry;
  const [d, setD] = useState<ActivityEntry>(() => entry ?? { ...base(), type: 'activity', activity: '', minutes: undefined as unknown as null, effort: null });
  const set = (p: Partial<ActivityEntry>) => setD({ ...d, ...p });
  return (
    <Sheet title="Activity" onClose={closeSheet} tall action={{ label: isNew ? 'Add' : 'Save', onClick: () => d.activity ? commit({ ...d, minutes: d.minutes ?? null }, isNew) : alert('Pick an activity first.') }}>
      <WhenPicker value={d.time} onChange={(time) => set({ time })} />
      <Block title="What were you doing?">
        <ActivityTiles single options={settings.value.activities} value={d.activity ? [d.activity] : []} onChange={(v) => set({ activity: v[0] ?? '' })} onAdd={(v) => rememberChip('activities', v)} />
      </Block>
      <Block title="Roughly how long?">
        <DurationChips value={d.minutes} onChange={(minutes) => set({ minutes })} />
      </Block>
      <Block title="How demanding was it?">
        <Seg options={[{ v: 'light', label: 'Light' }, { v: 'moderate', label: 'Moderate' }, { v: 'hard', label: 'Hard' }]} value={d.effort} onChange={(effort) => set({ effort })} />
      </Block>
      <Note value={d.note} onChange={(note) => set({ note })} />
      <DeleteRow isNew={isNew} id={d.id} />
    </Sheet>
  );
}

/* ---------------- meal ---------------- */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob((b) => r(b ?? file), 'image/jpeg', 0.8));
}

export function MealForm({ entry }: { entry?: MealEntry }) {
  const isNew = !entry;
  const [d, setD] = useState<MealEntry>(() => entry ?? { ...base(), type: 'meal', tags: [], photoId: null });
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const set = (p: Partial<MealEntry>) => setD({ ...d, ...p });

  useEffect(() => {
    if (d.photoId && !photo) getPhoto(d.photoId).then((b) => b && setPhoto({ blob: b, url: URL.createObjectURL(b) }));
  }, []);

  async function save() {
    let photoId = d.photoId ?? null;
    if (photo && !photoId) {
      photoId = uid();
      await putPhoto(photoId, photo.blob);
    }
    commit({ ...d, photoId }, isNew, 'Meal logged');
  }

  return (
    <Sheet title="Food & Drink" onClose={closeSheet} tall action={{ label: isNew ? 'Add' : 'Save', onClick: save }}>
      <WhenPicker value={d.time} onChange={(time) => set({ time })} />
      <Block title="Quick tags">
        <Chips options={settings.value.mealTags} value={d.tags} onChange={(tags) => set({ tags })} onAdd={(v) => rememberChip('mealTags', v)} />
      </Block>
      <Block title="Photo">
        <label class="photo-drop">
          {photo ? <img src={photo.url} alt="Meal photo" /> : <span class="row"><span style={{ width: 24, height: 24 }}><IconCamera /></span> Add a photo</span>}
          <input type="file" accept="image/*" onChange={async (e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (!f) return;
            const blob = await shrink(f);
            setPhoto({ blob, url: URL.createObjectURL(blob) });
            set({ photoId: null });
          }} />
        </label>
        {photo && <button class="link" onClick={() => { setPhoto(null); set({ photoId: null }); }}>Remove photo</button>}
      </Block>
      <Block title="What did you have?">
        <textarea class="input" style={{ minHeight: 64 }} value={d.note} onInput={(e) => set({ note: (e.target as HTMLTextAreaElement).value })} />
      </Block>
      <DeleteRow isNew={isNew} id={d.id} />
    </Sheet>
  );
}

/* ---------------- treatment ---------------- */
export function TreatmentForm({ entry }: { entry?: TreatmentEntry }) {
  const isNew = !entry;
  const s = settings.value;
  const [d, setD] = useState<TreatmentEntry>(() => entry ?? { ...base(), type: 'treatment', kind: 'medication', name: '', dose: '', helped: null, sideEffects: [] });
  const set = (p: Partial<TreatmentEntry>) => setD({ ...d, ...p });
  const kindLabel = TREATMENT_KINDS.find((k) => k.id === d.kind)?.label ?? 'Other';

  function save() {
    const name = d.name.trim() || (d.kind !== 'medication' ? kindLabel : '');
    if (!name) { alert('Add a name for this treatment.'); return; }
    rememberTreatment(name, d.kind, d.dose?.trim());
    commit({ ...d, name, dose: d.dose?.trim() }, isNew, 'Treatment logged');
  }

  return (
    <Sheet title="Treatment" onClose={closeSheet} tall action={{ label: isNew ? 'Add' : 'Save', onClick: save }}>
      <WhenPicker value={d.time} onChange={(time) => set({ time })} />
      {isNew && s.treatments.length > 0 && (
        <Block title="Your usual">
          <div class="chips">
            {s.treatments.map((t) => (
              <button key={t.name} class={'chip' + (d.name === t.name ? ' on' : '')} onClick={() => set({ name: t.name, kind: t.kind, dose: t.dose ?? '' })}>
                {t.name}{t.dose ? <span style={{ opacity: 0.7 }}> · {t.dose}</span> : null}
              </button>
            ))}
          </div>
        </Block>
      )}
      <Block title="Type">
        <Chips single options={TREATMENT_KINDS.map((k) => k.id)} labels={Object.fromEntries(TREATMENT_KINDS.map((k) => [k.id, k.label]))} value={[d.kind]} onChange={(v) => set({ kind: v[0] ?? 'other' })} />
      </Block>
      <Block title="Details">
        <label class="field"><span>{d.kind === 'medication' ? 'Medication name' : 'Name'}</span>
          <input class="input" value={d.name} placeholder={d.kind === 'medication' ? 'e.g. Ibuprofen' : kindLabel} autocomplete="off" onInput={(e) => set({ name: (e.target as HTMLInputElement).value })} />
        </label>
        <label class="field"><span>{d.kind === 'medication' ? 'Dose' : 'Amount / duration'}</span>
          <input class="input" value={d.dose} placeholder={d.kind === 'medication' ? 'e.g. 400 mg' : 'e.g. 15 min'} autocomplete="off" onInput={(e) => set({ dose: (e.target as HTMLInputElement).value })} />
        </label>
      </Block>
      <Block title="Did it seem to help?">
        <Chips single options={Object.keys(HELPED_LABELS)} labels={HELPED_LABELS} value={d.helped ? [d.helped] : []} onChange={(v) => set({ helped: (v[0] as Helped) ?? null })} />
      </Block>
      <Block title="Side effects">
        <Chips options={s.sideEffects} value={d.sideEffects} onChange={(sideEffects) => set({ sideEffects })} onAdd={(v) => rememberChip('sideEffects', v)} />
      </Block>
      <Note value={d.note} onChange={(note) => set({ note })} />
      <DeleteRow isNew={isNew} id={d.id} />
    </Sheet>
  );
}

/* ---------------- sleep & day ---------------- */
export function DayForm({ entry, date }: { entry?: DayEntry; date?: string }) {
  const isNew = !entry;
  const [d, setD] = useState<DayEntry>(() => entry ?? {
    ...base(), type: 'day', date: date ?? dayKey(Date.now()), sleepHours: null, sleepQuality: null, stress: null, exertion: null,
  });
  const set = (p: Partial<DayEntry>) => setD({ ...d, ...p });
  const hours = [4, 5, 6, 7, 8, 9, 10];
  return (
    <Sheet title="Sleep & Day" onClose={closeSheet} tall action={{ label: isNew ? 'Add' : 'Save', onClick: () => commit({ ...d, time: fromDayKey(d.date) + 12 * 3600_000 }, isNew) }}>
      <div class="row between">
        <span class="sub">For {fmtDay(fromDayKey(d.date), { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <input type="date" class="dt-input" value={d.date} max={dayKey(Date.now())} onChange={(e) => set({ date: (e.target as HTMLInputElement).value || d.date })} />
      </div>
      <Block title="Sleep last night" aside={d.sleepHours != null ? `${d.sleepHours} h` : 'hours'}>
        <div class="chips">
          {hours.map((h) => (
            <button key={h} class={'chip' + (d.sleepHours === h ? ' on' : '')} onClick={() => set({ sleepHours: d.sleepHours === h ? null : h })}>{h === 4 ? '≤4' : h === 10 ? '10+' : h}</button>
          ))}
          <button class={'chip' + (d.sleepHours != null && !hours.includes(d.sleepHours) ? ' on' : '')} onClick={() => {
            const v = prompt('Hours of sleep (e.g. 6.5)');
            if (v && !isNaN(+v)) set({ sleepHours: +v });
          }}>Other</button>
        </div>
        <Seg options={[{ v: 'poor', label: 'Poor' }, { v: 'ok', label: 'Okay' }, { v: 'good', label: 'Good' }]} value={d.sleepQuality} onChange={(sleepQuality) => set({ sleepQuality })} />
      </Block>
      <Block title="Stress today" aside={d.stress != null ? `${d.stress}/10` : ''}>
        <Seg options={[{ v: 2, label: 'Low' }, { v: 5, label: 'Medium' }, { v: 8, label: 'High' }]} value={d.stress} onChange={(stress) => set({ stress })} />
      </Block>
      <Block title="Unusual physical exertion?">
        <Seg options={[{ v: false as boolean | null, label: 'No' }, { v: true, label: 'Yes' }]} value={d.exertion} onChange={(exertion) => set({ exertion })} />
      </Block>
      <Note value={d.note} onChange={(note) => set({ note })} />
      <DeleteRow isNew={isNew} id={d.id} />
    </Sheet>
  );
}
