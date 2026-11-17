import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { entries, rememberChip, removeEntry, saveEntry, settings, uid } from '../lib/store';
import { closeSheet, go, openSheet, pendingSlot } from '../lib/nav';
import { DURATIONS, IMPACTS, POSTURES } from '../lib/catalog';
import { ago, fmtSlot, fmtTime } from '../lib/time';
import { isIOS, isStandalone, slotStatus } from '../lib/env';
import type { Level, PainEntry, Sensation } from '../lib/types';
import { BodyMap, regionLabel } from '../components/BodyMap';
import { Chips, Nav, PainPill, Seg, Sheet, SliderRow, WhenPicker, showToast } from '../components/ui';
import { IconChevron, IconClose, IconGear, IconPlus, IconShare } from '../components/Icons';
import { ActivityTiles, PostureTiles } from '../forms/common';

type Draft = Omit<PainEntry, 'intensity'> & { intensity: number | null | undefined; levels: Record<string, number> };
type Detail = 'time' | 'quality' | 'duration' | 'impact' | 'symptoms' | 'context' | 'note';

const blank = (): Draft => ({
  id: uid(), type: 'pain', mode: 'checkin', time: Date.now(), createdAt: 0, updatedAt: 0,
  intensity: undefined, trend: null, regions: {}, levels: {}, qualities: [], duration: null, impacts: {},
  symptoms: [], postures: [], activities: [], slot: null, note: '',
});

const SENSATIONS: Sensation[] = ['pain', 'tingling', 'numb'];
const SENSATION_NAME: Record<Sensation, string> = { pain: 'Pain', tingling: 'Tingling', numb: 'Numb' };

/** Small segmented pill: what this area feels like. */
function SensationPill({ value, onChange }: { value: Sensation; onChange: (s: Sensation) => void }) {
  return (
    <div class="sens" role="radiogroup" aria-label="Feels like">
      {SENSATIONS.map((x) => (
        <button key={x} role="radio" aria-checked={value === x} class={'sens-opt ' + x + (value === x ? ' on' : '')} onClick={() => onChange(x)}>
          <i />{SENSATION_NAME[x]}
        </button>
      ))}
    </div>
  );
}

/** Home screen: rate pain, tap where it is, save. Also used (in a sheet) to edit a past check-in. */
export function CheckIn({ entry }: { entry?: PainEntry }) {
  const s = settings.value;
  const editing = !!entry;
  const [d, setD] = useState<Draft>(() => (entry ? { ...entry, levels: entry.levels ?? {} } : blank()));
  const [timeSet, setTimeSet] = useState(editing);
  const [open, setOpen] = useState<Detail | null>(null);
  const set = (p: Partial<Draft>) => setD({ ...d, ...p });

  const regionIds = Object.keys(d.regions);
  const touched = d.intensity !== undefined || regionIds.length > 0 || d.qualities.length + d.symptoms.length + d.postures.length + d.activities.length > 0 || !!d.note || !!d.duration || Object.values(d.impacts).some((v) => v != null);

  function tapRegion(id: string) {
    const regions = { ...d.regions };
    const levels = { ...d.levels };
    if (regions[id]) { delete regions[id]; delete levels[id]; }
    else { regions[id] = 'pain'; levels[id] = d.intensity ?? 5; }
    set({ regions, levels });
    navigator.vibrate?.(8);
  }

  async function save() {
    const pains = entries.value.filter((e): e is PainEntry => e.type === 'pain');
    const slot = editing ? d.slot : pendingSlot.value ?? s.checkinTimes.find((t) => slotStatus(t, pains) === 'due') ?? null;
    const out: PainEntry = {
      ...d,
      intensity: d.intensity === undefined ? null : d.intensity,
      time: timeSet ? d.time : Date.now(),
      slot: d.mode === 'checkin' ? slot : null,
    };
    const saved = await saveEntry(out);
    navigator.vibrate?.(12);
    if (editing) { closeSheet(); showToast('Saved'); return; }
    pendingSlot.value = null;
    setD(blank());
    setTimeSet(false);
    setOpen(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(d.mode === 'change' ? 'Pain change saved' : 'Check-in saved', { label: 'Undo', run: () => removeEntry(saved.id) });
  }

  const body = (
    <>
      {!editing && <ModeSwitch mode={d.mode} onChange={(mode) => set({ mode, trend: mode === 'checkin' ? null : d.trend })} />}

      <section class="section">
        <div class="group">
          <SliderRow
            label={d.mode === 'change' ? 'Pain now' : 'Overall pain'}
            value={d.intensity}
            onChange={(intensity) => set({ intensity })}
            accessory={d.intensity === undefined && <button class="link small" onClick={() => set({ intensity: null })}>Not sure</button>}
          />
          {d.mode === 'change' && (
            <div class="srow">
              <Seg
                options={[{ v: 'worse', label: 'Worse' }, { v: 'better', label: 'Better' }, { v: 'new', label: 'New spot' }]}
                value={d.trend ?? null}
                onChange={(trend) => set({ trend: trend as Draft['trend'] })}
              />
            </div>
          )}
        </div>
      </section>

      {s.steps.where && (
        <section class="section">
          <div class="sec-head"><span>Where</span><span class="sec-aside">tap the body to mark it</span></div>
          <div class="group pad">
            <BodyMap value={d.regions} levels={d.levels} onTap={tapRegion} incision={s.incision} />
          </div>
          {regionIds.length > 0 && (
            <div class="group" style={{ marginTop: 10 }}>
              {regionIds.map((id) => (
                <SliderRow
                  key={id}
                  compact
                  label={regionLabel(id)}
                  value={d.levels[id]}
                  onChange={(v) => set({ levels: { ...d.levels, [id]: v } })}
                  accessory={<button class="x-btn" aria-label={`Remove ${regionLabel(id)}`} onClick={() => tapRegion(id)}><IconClose /></button>}
                >
                  <SensationPill value={d.regions[id]} onChange={(v) => set({ regions: { ...d.regions, [id]: v } })} />
                </SliderRow>
              ))}
            </div>
          )}
        </section>
      )}

      <section class="section">
        <div class="sec-head"><span>Details</span><span class="sec-aside">optional</span></div>
        <div class="group">
          <Expand id="time" open={open} setOpen={setOpen} label="Time" value={timeSet ? fmtTime(d.time) : 'Now'}>
            <WhenPicker value={d.time} onChange={(time) => { set({ time }); setTimeSet(true); }} />
          </Expand>
          {s.steps.quality && (
            <Expand id="quality" open={open} setOpen={setOpen} label="Feels like" value={d.qualities.join(', ')}>
              <Chips options={s.qualities} value={d.qualities} onChange={(qualities) => set({ qualities })} onAdd={(v) => rememberChip('qualities', v)} />
            </Expand>
          )}
          {s.steps.duration && (
            <Expand id="duration" open={open} setOpen={setOpen} label="How long it lasts" value={d.duration ?? ''}>
              <Chips single options={DURATIONS} value={d.duration ? [d.duration] : []} onChange={(v) => set({ duration: v[0] ?? null })} />
            </Expand>
          )}
          {s.steps.impact && (
            <Expand id="impact" open={open} setOpen={setOpen} label="Getting in the way of" value={IMPACTS.filter((i) => (d.impacts[i.id] ?? 0) > 0).map((i) => i.label).join(', ')}>
              <div class="stack">
                {IMPACTS.map((im) => (
                  <div class="impact-row" key={im.id}>
                    <span>{im.label}</span>
                    <Seg<Level | null> options={[{ v: 0, label: 'No' }, { v: 1, label: 'Some' }, { v: 2, label: 'A lot' }]} value={d.impacts[im.id] ?? null} onChange={(v) => set({ impacts: { ...d.impacts, [im.id]: v } })} />
                  </div>
                ))}
              </div>
            </Expand>
          )}
          {s.steps.symptoms && (
            <Expand id="symptoms" open={open} setOpen={setOpen} label="Other symptoms" value={d.symptoms.join(', ')}>
              <Chips options={s.symptoms} value={d.symptoms} onChange={(symptoms) => set({ symptoms })} onAdd={(v) => rememberChip('symptoms', v)} />
            </Expand>
          )}
          {s.steps.context && (
            <Expand id="context" open={open} setOpen={setOpen} label="What you were doing" value={[...d.postures.map((p) => POSTURES[p]?.label ?? p), ...d.activities].join(', ')}>
              <div class="stack" style={{ gap: 14 }}>
                <PostureTiles options={s.postures} value={d.postures} onChange={(postures) => set({ postures })} />
                <ActivityTiles options={s.activities} value={d.activities} onChange={(activities) => set({ activities })} onAdd={(v) => rememberChip('activities', v)} />
              </div>
            </Expand>
          )}
          {s.steps.note && (
            <Expand id="note" open={open} setOpen={setOpen} label="Note" value={d.note}>
              <textarea class="input" placeholder="Anything to remember for your clinician" value={d.note} onInput={(e) => set({ note: (e.target as HTMLTextAreaElement).value })} />
            </Expand>
          )}
        </div>
      </section>
    </>
  );

  if (editing) {
    return (
      <Sheet title={d.mode === 'change' ? 'Pain Change' : 'Check-In'} onClose={closeSheet} action={{ label: 'Save', onClick: save }} tall>
        {body}
        <section class="section">
          <div class="group">
            <button class="row-item danger" onClick={async () => { if (confirm('Delete this entry?')) { await removeEntry(d.id); closeSheet(); showToast('Deleted'); } }}>
              <span class="row-label">Delete Entry</span>
            </button>
          </div>
        </section>
      </Sheet>
    );
  }

  return (
    <div class="screen has-savebar">
      <Nav title="Check In" sub={<LastReading />}>
        <button class="nav-btn" aria-label="Log something else" onClick={() => openSheet('add')}><IconPlus /></button>
        <button class="nav-btn" aria-label="Settings" onClick={() => go('settings')}><IconGear /></button>
      </Nav>
      {isIOS && !isStandalone() && (
        <div class="banner"><IconShare /><span>Tap <b>Share → Add to Home Screen</b> to install. Data saved in Safari stays in Safari.</span></div>
      )}
      {body}
      <div class="savebar">
        <button class="btn primary wide" disabled={!touched} onClick={save}>
          {d.mode === 'change' ? 'Save Pain Change' : pendingSlot.value ? `Save ${fmtSlot(pendingSlot.value)} Check-In` : 'Save Check-In'}
        </button>
      </div>
    </div>
  );
}

function ModeSwitch({ mode, onChange }: { mode: PainEntry['mode']; onChange: (m: PainEntry['mode']) => void }) {
  return (
    <Seg required options={[{ v: 'checkin', label: 'Check-in' }, { v: 'change', label: 'Pain changed' }]} value={mode} onChange={(m) => onChange(m as PainEntry['mode'])} />
  );
}

function LastReading() {
  const last = [...entries.value].reverse().find((e): e is PainEntry => e.type === 'pain');
  if (!last) return <>Rate your pain and tap where you feel it.</>;
  return (
    <button class="last" onClick={() => go('history')}>
      Last: <PainPill n={last.intensity} /> {ago(last.time)}
    </button>
  );
}

function Expand({ id, open, setOpen, label, value, children }: {
  id: Detail; open: Detail | null; setOpen: (d: Detail | null) => void; label: string; value?: string; children: ComponentChildren;
}) {
  const isOpen = open === id;
  return (
    <div class={'expand' + (isOpen ? ' open' : '')}>
      <button class="row-item" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : id)}>
        <span class="row-label">{label}</span>
        <span class="row-value">{value}</span>
        <span class="row-chev"><IconChevron /></span>
      </button>
      {isOpen && <div class="expand-body">{children}</div>}
    </div>
  );
}
