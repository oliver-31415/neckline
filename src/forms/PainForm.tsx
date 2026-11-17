import { useState } from 'preact/hooks';
import { Block, Chips, PainScale, Seg, Sheet, WhenPicker } from '../components/ui';
import { BodyMap } from '../components/BodyMap';
import { IconDown, IconPin, IconSame, IconUp } from '../components/Icons';
import { DURATIONS, IMPACTS } from '../lib/catalog';
import { rememberChip, settings, uid } from '../lib/store';
import { closeSheet } from '../lib/nav';
import { fmtSlot } from '../lib/time';
import type { Level, PainEntry } from '../lib/types';
import { ActivityTiles, FormFooter, PostureTiles, commit } from './common';

const TRENDS = [
  { v: 'worse', label: 'Worse', Icon: IconUp },
  { v: 'better', label: 'Better', Icon: IconDown },
  { v: 'same', label: 'About the same', Icon: IconSame },
  { v: 'new', label: 'New spot', Icon: IconPin },
] as const;

export function PainForm({ mode, entry, slot }: { mode: 'checkin' | 'change'; entry?: PainEntry; slot?: string | null }) {
  const s = settings.value;
  const isNew = !entry;
  const [d, setD] = useState<PainEntry>(() => entry ?? {
    id: uid(), type: 'pain', mode, time: Date.now(), createdAt: 0, updatedAt: 0,
    intensity: undefined as unknown as number | null, trend: null, regions: {}, qualities: [], duration: null,
    impacts: {}, symptoms: [], postures: [], activities: [], slot: slot ?? null, note: '',
  });
  const [showMap, setShowMap] = useState(mode === 'checkin' || Object.keys(d.regions).length > 0);
  const set = (patch: Partial<PainEntry>) => setD({ ...d, ...patch });
  const on = (k: keyof typeof s.steps) => mode === 'checkin' ? s.steps[k] : ['intensity', 'where', 'context', 'note'].includes(k);

  function save() {
    const out: PainEntry = { ...d, intensity: d.intensity === undefined ? null : d.intensity };
    commit(out, isNew, mode === 'change' ? 'Pain change logged' : 'Check-in saved');
  }

  const title = mode === 'change' ? 'Pain changed' : slot ? `${fmtSlot(slot)} check-in` : 'Check-in';

  return (
    <Sheet title={isNew ? title : 'Edit entry'} onClose={closeSheet} tall footer={<FormFooter isNew={isNew} id={d.id} onSave={save} />}>
      <WhenPicker value={d.time} onChange={(time) => set({ time })} />

      {mode === 'change' && (
        <Block title="What changed?">
          <div class="tiles" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {TRENDS.map(({ v, label, Icon }) => (
              <button key={v} class={'tile' + (d.trend === v ? ' on' : '')} onClick={() => set({ trend: d.trend === v ? null : v })} style={{ padding: '12px 4px' }}>
                <span style={{ width: 30, height: 30, color: v === 'worse' ? 'var(--pain)' : v === 'better' ? 'var(--good)' : 'currentColor' }}><Icon /></span>
                {label}
              </button>
            ))}
          </div>
        </Block>
      )}

      {on('intensity') && (
        <Block title={mode === 'change' ? 'How strong now?' : 'Pain right now'}>
          <PainScale value={d.intensity} onChange={(intensity) => set({ intensity })} />
        </Block>
      )}

      {on('where') && (
        <Block title="Where do you feel it?" aside={Object.keys(d.regions).length ? `${Object.keys(d.regions).length} marked` : 'optional'}>
          {showMap ? (
            <BodyMap value={d.regions} onChange={(regions) => set({ regions })} incision={s.incision} />
          ) : (
            <button class="btn wide" onClick={() => setShowMap(true)}>Mark it on the body map</button>
          )}
        </Block>
      )}

      {on('quality') && (
        <Block title="What does it feel like?">
          <Chips options={s.qualities} value={d.qualities} onChange={(qualities) => set({ qualities })} onAdd={(v) => rememberChip('qualities', v)} />
        </Block>
      )}

      {on('duration') && (
        <Block title="How long does it last?">
          <Chips single options={DURATIONS} value={d.duration ? [d.duration] : []} onChange={(v) => set({ duration: v[0] ?? null })} />
        </Block>
      )}

      {on('impact') && (
        <Block title="Is it getting in the way of…" aside="skip any">
          {IMPACTS.map((im) => (
            <div class="impact-row" key={im.id}>
              <span>{im.label}</span>
              <Seg<Level | null>
                options={[{ v: 0, label: 'No' }, { v: 1, label: 'Some' }, { v: 2, label: 'A lot' }]}
                value={d.impacts[im.id] ?? null}
                onChange={(v) => set({ impacts: { ...d.impacts, [im.id]: v } })}
              />
            </div>
          ))}
        </Block>
      )}

      {on('symptoms') && (
        <Block title="Anything else you’re noticing?">
          <Chips options={s.symptoms} value={d.symptoms} onChange={(symptoms) => set({ symptoms })} onAdd={(v) => rememberChip('symptoms', v)} />
        </Block>
      )}

      {on('context') && (
        <Block title={mode === 'change' ? 'What were you doing?' : 'Mostly, over the last couple of hours…'} aside="optional">
          <PostureTiles options={s.postures} value={d.postures} onChange={(postures) => set({ postures })} />
          <ActivityTiles options={s.activities} value={d.activities} onChange={(activities) => set({ activities })} onAdd={(v) => rememberChip('activities', v)} />
        </Block>
      )}

      {on('note') && (
        <Block title="Note" aside="optional">
          <textarea class="input" placeholder="Anything you want to remember for your clinician" value={d.note} onInput={(e) => set({ note: (e.target as HTMLTextAreaElement).value })} />
        </Block>
      )}
      <p class="small muted center">Every field is optional. Save whatever you know.</p>
    </Sheet>
  );
}
