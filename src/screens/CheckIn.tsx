import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { entries, rememberChip, removeEntry, saveEntry, settings, uid } from '../lib/store';
import { closeSheet, go, openSheet, pendingSlot } from '../lib/nav';
import { AREA_KINDS, DURATIONS, IMPACTS } from '../lib/catalog';
import { ago, fmtSlot, fmtTime } from '../lib/time';
import { slotStatus } from '../lib/env';
import type { Level, PainEntry, Sensation } from '../lib/types';
import { BodyMap, SPINE, regionLabel } from '../components/BodyMap';
import { Chips, Nav, PainPill, Seg, Sheet, SliderRow, WhenPicker, showToast } from '../components/ui';
import { IconChevron, IconClose, IconDownChev, IconExercise, IconGear, IconPill, IconPlus, IconPosture, IconUpChev } from '../components/Icons';
import { ActivityTiles } from '../forms/common';
import { QuickExercise, QuickMed, QuickPosture, extraSummary, type Extra } from '../forms/QuickAdd';

type Draft = Omit<PainEntry, 'intensity'> & { intensity: number | null | undefined; levels: Record<string, number>; kinds: Record<string, Sensation[]> };
type Detail = 'time' | 'duration' | 'impact' | 'context' | 'note';

const blank = (): Draft => ({
  id: uid(), type: 'pain', mode: 'checkin', time: Date.now(), createdAt: 0, updatedAt: 0,
  intensity: undefined, trend: null, regions: {}, levels: {}, kinds: {}, qualities: [], duration: null, impacts: {},
  symptoms: [], postures: [], activities: [], slot: null, note: '',
});

/** Multi-select: what this area feels like. */
function KindChips({ value, onChange }: { value: Sensation[]; onChange: (v: Sensation[]) => void }) {
  return (
    <div class="kinds">
      {AREA_KINDS.map((k) => {
        const on = value.includes(k.id);
        return (
          <button key={k.id} class={'kind' + (on ? ' on' : '')} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== k.id) : [...value, k.id])}>{k.label}</button>
        );
      })}
    </div>
  );
}

/** Home screen: rate pain, tap where it is, save. Also used (in a sheet) to edit a past check-in. */
export function CheckIn({ entry }: { entry?: PainEntry }) {
  const s = settings.value;
  const editing = !!entry;
  const [d, setD] = useState<Draft>(() => (entry ? {
    ...entry,
    levels: entry.levels ?? {},
    kinds: entry.kinds ?? Object.fromEntries(Object.entries(entry.regions).map(([k, v]) => [k, [v]])),
  } : blank()));
  const [timeSet, setTimeSet] = useState(editing);
  const [open, setOpen] = useState<Detail | null>(null);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [adding, setAdding] = useState<'posture' | 'med' | 'exercise' | null>(null);
  const set = (p: Partial<Draft>) => setD({ ...d, ...p });

  const regionIds = Object.keys(d.regions);
  const painTouched = d.intensity !== undefined || regionIds.length > 0 || d.qualities.length + d.symptoms.length + d.postures.length + d.activities.length > 0 || !!d.note || !!d.duration || Object.values(d.impacts).some((v) => v != null);
  const touched = painTouched || extras.length > 0;

  /** Move a marked vertebra up (-1) or down (+1) the spine, keeping its level and sensation. */
  function moveSpine(id: string, dir: -1 | 1) {
    const i = SPINE.indexOf(id.slice(6)) + dir;
    const to = `spine-${SPINE[i]}`;
    if (i < 0 || i >= SPINE.length || d.regions[to]) return;
    const regions: Draft['regions'] = {};
    const levels: Draft['levels'] = {};
    const kinds: Draft['kinds'] = {};
    for (const k of Object.keys(d.regions)) {
      const nk = k === id ? to : k;
      regions[nk] = d.regions[k];
      if (d.levels[k] != null) levels[nk] = d.levels[k];
      if (d.kinds[k]) kinds[nk] = d.kinds[k];
    }
    set({ regions, levels, kinds });
  }

  function tapRegion(id: string) {
    const regions = { ...d.regions };
    const levels = { ...d.levels };
    const kinds = { ...d.kinds };
    if (regions[id]) { delete regions[id]; delete levels[id]; delete kinds[id]; }
    else { regions[id] = 'pain'; levels[id] = d.intensity ?? 5; kinds[id] = []; }
    set({ regions, levels, kinds });
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
    if (editing) { await saveEntry(out); closeSheet(); showToast('Saved'); return; }
    const ids: string[] = [];
    for (const x of extras) ids.push((await saveEntry(x)).id);
    if (painTouched) ids.push((await saveEntry(out)).id);
    navigator.vibrate?.(12);
    pendingSlot.value = null;
    setD(blank());
    setExtras([]);
    setTimeSet(false);
    setOpen(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const msg = !painTouched ? 'Saved' : d.mode === 'change' ? 'Pain change saved' : 'Check-in saved';
    showToast(msg, { label: 'Undo', run: () => ids.forEach((id) => removeEntry(id)) });
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
          <div class="sec-head"><span>Where</span></div>
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
                  accessory={<>
                    {id.startsWith('spine-') && (
                      <>
                        <button class="x-btn" aria-label="One vertebra higher" onClick={() => moveSpine(id, -1)}><IconUpChev /></button>
                        <button class="x-btn" aria-label="One vertebra lower" onClick={() => moveSpine(id, 1)}><IconDownChev /></button>
                      </>
                    )}
                    <button class="x-btn" aria-label={`Remove ${regionLabel(id)}`} onClick={() => tapRegion(id)}><IconClose /></button>
                  </>}
                >
                  <KindChips value={d.kinds[id] ?? []} onChange={(ks) => set({ kinds: { ...d.kinds, [id]: ks }, regions: { ...d.regions, [id]: ks[0] ?? 'pain' } })} />
                </SliderRow>
              ))}
            </div>
          )}
        </section>
      )}

      {s.steps.symptoms && (
        <section class="section">
          <div class="sec-head"><span>Symptoms</span></div>
          <div class="group pad">
            <Chips options={s.symptoms} value={d.symptoms} onChange={(symptoms) => set({ symptoms })} onAdd={(v) => rememberChip('symptoms', v)} />
          </div>
        </section>
      )}

      {!editing && (
        <section class="section">
          <div class="sec-head"><span>Since your last check-in</span></div>
          <div class="quick-add">
            <button onClick={() => setAdding('posture')}><span style={{ background: 'var(--posture)' }}><IconPosture /></span>Posture</button>
            <button onClick={() => setAdding('med')}><span style={{ background: 'var(--treatment)' }}><IconPill /></span>Medication</button>
            <button onClick={() => setAdding('exercise')}><span style={{ background: 'var(--activity)' }}><IconExercise /></span>Exercise</button>
          </div>
          {extras.length > 0 && (
            <div class="group" style={{ marginTop: 10 }}>
              {extras.map((x) => {
                const sm = extraSummary(x);
                const color = x.type === 'posture' ? 'var(--posture)' : x.kind === 'exercises' ? 'var(--activity)' : 'var(--treatment)';
                const Icon = x.type === 'posture' ? IconPosture : x.kind === 'exercises' ? IconExercise : IconPill;
                return (
                  <div class="row-item" key={x.id}>
                    <span class="row-icon" style={{ background: color }}><Icon /></span>
                    <span class="row-label">{sm.title}{sm.detail && <span class="row-sub">{sm.detail}</span>}</span>
                    <button class="x-btn" aria-label={`Remove ${sm.title}`} onClick={() => setExtras(extras.filter((e) => e !== x))}><IconClose /></button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
      {adding === 'posture' && <QuickPosture onClose={() => setAdding(null)} onAdd={(x) => { setExtras([...extras, x]); setAdding(null); }} />}
      {adding === 'med' && <QuickMed onClose={() => setAdding(null)} onAdd={(x) => { setExtras([...extras, x]); setAdding(null); }} />}
      {adding === 'exercise' && <QuickExercise onClose={() => setAdding(null)} onAdd={(x) => { setExtras([...extras, x]); setAdding(null); }} />}

      <section class="section">
        <div class="sec-head"><span>Details</span></div>
        <div class="group">
          <Expand id="time" open={open} setOpen={setOpen} label="Time" value={timeSet ? fmtTime(d.time) : 'Now'}>
            <WhenPicker value={d.time} onChange={(time) => { set({ time }); setTimeSet(true); }} />
          </Expand>
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
          {s.steps.context && (
            <Expand id="context" open={open} setOpen={setOpen} label="Activities" value={d.activities.join(', ')}>
              <ActivityTiles options={s.activities} value={d.activities} onChange={(activities) => set({ activities })} onAdd={(v) => rememberChip('activities', v)} />
            </Expand>
          )}
          {s.steps.note && (
            <Expand id="note" open={open} setOpen={setOpen} label="Note" value={d.note}>
              <textarea class="input"  value={d.note} onInput={(e) => set({ note: (e.target as HTMLTextAreaElement).value })} />
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
      {body}
      <div class="savebar">
        <button class="btn primary wide" disabled={!touched} onClick={save}>
          {!painTouched && extras.length ? 'Save' : d.mode === 'change' ? 'Save Pain Change' : pendingSlot.value ? `Save ${fmtSlot(pendingSlot.value)} Check-In` : 'Save Check-In'}
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
  if (!last) return null;
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
