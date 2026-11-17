import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { entries, rememberChip, removeEntry, saveEntry, settings, uid } from '../lib/store';
import { closeSheet, go, openSheet, pendingSlot } from '../lib/nav';
import { AREA_KINDS, DURATIONS, IMPACTS, MAIN_SYMPTOMS } from '../lib/catalog';
import { ago, fmtSlot, fmtTime } from '../lib/time';
import { slotStatus } from '../lib/env';
import type { Level, PainEntry, Sensation } from '../lib/types';
import { BodyMap, SPINE, regionLabel, spineRangeLabel } from '../components/BodyMap';
import { Chips, PainPill, PainSlider, Seg, Sheet, WhenPicker, showToast } from '../components/ui';
import { IconChevron, IconClose, IconDownChev, IconGear, IconPlus, IconUpChev } from '../components/Icons';
import { ActivityTiles } from '../forms/common';
import { SinceLast, itemsToEntries, type Item } from '../forms/QuickAdd';

type Draft = Omit<PainEntry, 'intensity'> & { intensity: number | null | undefined; levels: Record<string, number>; kinds: Record<string, Sensation[]> };
type Detail = 'time' | 'trend' | 'duration' | 'impact' | 'context' | 'note';

const TRENDS = [{ v: 'better', label: 'Better' }, { v: 'same', label: 'Same' }, { v: 'worse', label: 'Worse' }] as const;

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
          <button key={k.id} class={'kind' + (on ? ' on' : '')} aria-pressed={on} aria-label={k.label} onClick={() => onChange(on ? value.filter((x) => x !== k.id) : [...value, k.id])}>{k.short}</button>
        );
      })}
    </div>
  );
}

const spineIdx = (id: string) => SPINE.indexOf(id.slice(6));
const byIdx = (a: string, b: string) => spineIdx(a) - spineIdx(b);

/** Linked vertebrae as runs of neighbours that are still marked (a gap splits a run; one alone isn't a group). */
function groupsOf(links: string[][], regions: Draft['regions']) {
  const out: string[][] = [];
  for (const g of links) {
    let run: string[] = [];
    for (const id of g.filter((x) => regions[x]).sort(byIdx)) {
      if (run.length && spineIdx(id) !== spineIdx(run[run.length - 1]) + 1) { if (run.length > 1) out.push(run); run = []; }
      run.push(id);
    }
    if (run.length > 1) out.push(run);
  }
  return out;
}

/** When reopening an entry: neighbouring vertebrae with the same level and pain types go back together. */
function initialLinks(d: Draft) {
  const ids = Object.keys(d.regions).filter((id) => id.startsWith('spine-')).sort(byIdx);
  const same = (a: string, b: string) => spineIdx(b) === spineIdx(a) + 1 && d.levels[a] === d.levels[b] && [...(d.kinds[a] ?? [])].sort().join() === [...(d.kinds[b] ?? [])].sort().join();
  const out: string[][] = [];
  for (const id of ids) {
    const last = out[out.length - 1];
    if (last && same(last[last.length - 1], id)) last.push(id);
    else out.push([id]);
  }
  return out.filter((g) => g.length > 1);
}

/** Headache and migraine as chips; every other symptom is picked from a dropdown or typed in. */
function SymptomPicker({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const shown = [...MAIN_SYMPTOMS, ...value.filter((v) => !MAIN_SYMPTOMS.includes(v))];
  const rest = options.filter((o) => !shown.includes(o));
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  function commit() {
    const t = text.trim();
    if (t) { rememberChip('symptoms', t); if (!value.includes(t)) onChange([...value, t]); }
    setText('');
    setTyping(false);
  }
  return (
    <div class="chips">
      {shown.map((o) => (
        <button key={o} class={'chip' + (value.includes(o) ? ' on' : '')} aria-pressed={value.includes(o)} onClick={() => toggle(o)}>{o}</button>
      ))}
      {typing ? (
        <input class="input chip-input" autoFocus value={text} placeholder="Symptom" onInput={(e) => setText((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && commit()} onBlur={commit} />
      ) : (
        <label class="chip add select-chip">
          <IconPlus /> Other
          <select
            aria-label="Other symptom" value=""
            onChange={(e) => {
              const el = e.target as HTMLSelectElement;
              const v = el.value;
              el.value = '';
              if (v === '__new') setTyping(true);
              else if (v) onChange([...value, v]);
            }}
          >
            <option value="" disabled>Other symptom</option>
            {rest.map((o) => <option key={o} value={o}>{o}</option>)}
            <option value="__new">New…</option>
          </select>
        </label>
      )}
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
  const [extras, setExtras] = useState<Item[]>([]);
  const [links, setLinks] = useState<string[][]>(() => initialLinks(d));
  const set = (p: Partial<Draft>) => setD({ ...d, ...p });

  const regionIds = Object.keys(d.regions);
  const painTouched = d.trend != null || regionIds.length > 0 || d.qualities.length + d.symptoms.length + d.postures.length + d.activities.length > 0 || !!d.note || !!d.duration || Object.values(d.impacts).some((v) => v != null);
  const touched = painTouched || extras.length > 0;

  const groups = groupsOf(links, d.regions);
  const groupOf = new Map(groups.flatMap((g) => g.map((id) => [id, g] as const)));

  /** Move marked vertebrae (one, or a linked run) up (-1) or down (+1) the spine, keeping levels and pain types. */
  function moveSpine(ids: string[], dir: -1 | 1) {
    const map = new Map(ids.map((id) => [id, `spine-${SPINE[spineIdx(id) + dir]}`]));
    if ([...map.values()].some((to) => to === 'spine-undefined' || (d.regions[to] && !map.has(to)))) return;
    const regions: Draft['regions'] = {};
    const levels: Draft['levels'] = {};
    const kinds: Draft['kinds'] = {};
    for (const k of Object.keys(d.regions)) {
      const nk = map.get(k) ?? k;
      regions[nk] = d.regions[k];
      if (d.levels[k] != null) levels[nk] = d.levels[k];
      if (d.kinds[k]) kinds[nk] = d.kinds[k];
    }
    set({ regions, levels, kinds });
    setLinks(links.map((g) => (g.some((x) => map.has(x)) ? g.map((x) => map.get(x) ?? x) : g)));
  }

  function tapRegion(id: string) {
    const regions = { ...d.regions };
    const levels = { ...d.levels };
    const kinds = { ...d.kinds };
    if (regions[id]) { delete regions[id]; delete levels[id]; delete kinds[id]; setLinks(links.map((g) => g.filter((x) => x !== id))); }
    else { regions[id] = 'pain'; levels[id] = 5; kinds[id] = []; }
    set({ regions, levels, kinds });
    navigator.vibrate?.(8);
  }

  /** A drag along the spine: mark every vertebra in it with one shared level and pain types. */
  function addRange(ids: string[]) {
    const first = ids.find((id) => d.regions[id]);
    const level = first ? d.levels[first] ?? 5 : 5;
    const ks = first ? d.kinds[first] ?? [] : [];
    const regions = { ...d.regions };
    const levels = { ...d.levels };
    const kinds = { ...d.kinds };
    for (const id of ids) { regions[id] = ks[0] ?? 'pain'; levels[id] = level; kinds[id] = [...ks]; }
    set({ regions, levels, kinds });
    setLinks([...links.map((g) => g.filter((x) => !ids.includes(x))), ids]);
  }

  /** Apply a change to one area, or to every vertebra in its linked run. */
  function setArea(id: string, patch: { level?: number; kinds?: Sensation[] }) {
    const ids = groupOf.get(id) ?? [id];
    const levels = { ...d.levels };
    const kinds = { ...d.kinds };
    const regions = { ...d.regions };
    for (const x of ids) {
      if (patch.level != null) levels[x] = patch.level;
      if (patch.kinds) { kinds[x] = [...patch.kinds]; regions[x] = patch.kinds[0] ?? 'pain'; }
    }
    set({ levels, kinds, regions });
  }

  function removeArea(id: string) {
    const ids = groupOf.get(id) ?? [id];
    const regions = { ...d.regions };
    const levels = { ...d.levels };
    const kinds = { ...d.kinds };
    for (const x of ids) { delete regions[x]; delete levels[x]; delete kinds[x]; }
    set({ regions, levels, kinds });
    setLinks(links.map((g) => g.filter((x) => !ids.includes(x))));
  }

  async function save() {
    const pains = entries.value.filter((e): e is PainEntry => e.type === 'pain');
    const slot = editing ? d.slot : pendingSlot.value ?? s.checkinTimes.find((t) => slotStatus(t, pains) === 'due') ?? null;
    // Overall pain is the worst marked area; older entries without area levels keep their own.
    const lv = Object.values(d.levels);
    const out: PainEntry = {
      ...d,
      intensity: lv.length ? Math.max(...lv) : d.intensity ?? null,
      time: timeSet ? d.time : Date.now(),
      slot: d.mode === 'checkin' ? slot : null,
    };
    if (editing) { await saveEntry(out); closeSheet(); showToast('Saved'); return; }
    const ids: string[] = [];
    for (const x of itemsToEntries(extras)) ids.push((await saveEntry(x)).id);
    if (painTouched) ids.push((await saveEntry(out)).id);
    navigator.vibrate?.(12);
    pendingSlot.value = null;
    setD(blank());
    setExtras([]);
    setLinks([]);
    setTimeSet(false);
    setOpen(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const msg = 'Saved';
    showToast(msg, { label: 'Undo', run: () => ids.forEach((id) => removeEntry(id)) });
  }

  const body = (
    <>
      {s.steps.where && (
        <section class="section">
          <div class="group pad tight">
            <BodyMap value={d.regions} levels={d.levels} onTap={tapRegion} onRange={addRange} incision={s.incision} />
          </div>
          {regionIds.length > 0 && (
            <div class="group" style={{ marginTop: 8 }}>
              {regionIds.filter((id) => (groupOf.get(id)?.[0] ?? id) === id).map((id) => {
                const g = groupOf.get(id);
                const label = g ? spineRangeLabel(spineIdx(g[0]), spineIdx(g[g.length - 1])) : regionLabel(id);
                return (
                  <div class="arow" key={g ? g.join() : id}>
                    <div class="arow-line">
                      {g ? (
                        <button class="arow-label group-label" aria-label={`${label}, ${g.length} vertebrae. Separate`} onClick={() => setLinks(links.filter((x) => !x.some((y) => g.includes(y))))}>
                          {label}<span class="group-count">{g.length}</span>
                        </button>
                      ) : <span class="arow-label">{label}</span>}
                      <PainSlider value={d.levels[id]} onChange={(level) => setArea(id, { level })} label={label} />
                      {id.startsWith('spine-') && (
                        <span class="spine-step">
                          <button class="x-btn" aria-label="One vertebra higher" onClick={() => moveSpine(g ?? [id], -1)}><IconUpChev /></button>
                          <button class="x-btn" aria-label="One vertebra lower" onClick={() => moveSpine(g ?? [id], 1)}><IconDownChev /></button>
                        </span>
                      )}
                      <PainPill n={d.levels[id] ?? null} />
                      <button class="x-btn" aria-label={`Remove ${label}`} onClick={() => removeArea(id)}><IconClose /></button>
                    </div>
                    <KindChips value={d.kinds[id] ?? []} onChange={(kinds) => setArea(id, { kinds })} />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {s.steps.symptoms && (
        <section class="section">
          <div class="sec-head"><span>Symptoms</span></div>
          <div class="group pad">
            <SymptomPicker options={s.symptoms} value={d.symptoms} onChange={(symptoms) => set({ symptoms })} />
          </div>
        </section>
      )}

      {!editing && <SinceLast items={extras} onChange={setExtras} />}

      <section class="section">
        <div class="sec-head"><span>Details</span></div>
        <div class="group">
          <Expand id="time" open={open} setOpen={setOpen} label="Time" value={timeSet ? fmtTime(d.time) : 'Now'} isSet={timeSet}>
            <WhenPicker value={d.time} onChange={(time) => { set({ time }); setTimeSet(true); }} />
          </Expand>
          <Expand id="trend" open={open} setOpen={setOpen} label="Since last time" value={TRENDS.find((t) => t.v === d.trend)?.label ?? ''}>
            <Seg
              options={TRENDS.map((t) => ({ ...t }))}
              value={d.trend ?? null}
              onChange={(trend) => set({ trend: trend as Draft['trend'], mode: trend === 'better' || trend === 'worse' ? 'change' : 'checkin' })}
            />
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
      <header class="bar">
        <h1>Check In</h1>
        <LastReading />
        <span class="grow" />
        <button class="nav-btn" aria-label="Log something else" onClick={() => openSheet('add')}><IconPlus /></button>
        <button class="nav-btn" aria-label="Settings" onClick={() => go('settings')}><IconGear /></button>
      </header>
      {body}
      <div class="savebar">
        <button class="btn primary wide" disabled={!touched} onClick={save}>
          {pendingSlot.value ? `Save ${fmtSlot(pendingSlot.value)} Check-In` : 'Save'}
        </button>
      </div>
    </div>
  );
}

function LastReading() {
  const last = [...entries.value].reverse().find((e): e is PainEntry => e.type === 'pain');
  if (!last) return null;
  return (
    <button class="last" onClick={() => go('history')}>
      <PainPill n={last.intensity} /> {ago(last.time)}
    </button>
  );
}

function Expand({ id, open, setOpen, label, value, isSet = !!value, children }: {
  id: Detail; open: Detail | null; setOpen: (d: Detail | null) => void; label: string; value?: string; isSet?: boolean; children: ComponentChildren;
}) {
  const isOpen = open === id;
  return (
    <div class={'expand' + (isOpen ? ' open' : '')}>
      <button class="row-item" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : id)}>
        <span class="row-label">{label}</span>
        <span class={'row-value' + (isSet ? ' set' : '')}>{value}</span>
        <span class="row-chev"><IconChevron /></span>
      </button>
      {isOpen && <div class="expand-body">{children}</div>}
    </div>
  );
}
