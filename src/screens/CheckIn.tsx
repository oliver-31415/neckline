import { useEffect, useRef, useState } from 'preact/hooks';
import { entries, removeEntry, rememberChip, saveEntry, settings, uid } from '../lib/store';
import { closeSheet, go, openSheet, pendingSlot } from '../lib/nav';
import { AREA_KINDS, DURATIONS, IMPACTS, MAIN_SYMPTOMS } from '../lib/catalog';
import { ago, fmtSlot } from '../lib/time';
import { slotStatus } from '../lib/env';
import type { Level, PainEntry, Sensation } from '../lib/types';
import { BodyMap, SPINE, regionLabel, spineRangeLabel } from '../components/BodyMap';
import { PainPill, PainSlider, Sheet, showToast } from '../components/ui';
import { IconClose, IconDownChev, IconGear, IconPlus, IconUpChev } from '../components/Icons';
import { CARD_STYLE, CardShell, FieldRow, OtherCardView, Pick, WhenRow, cardEntry, cardReady, type CardKind, type OtherCard } from '../forms/LogCards';

/** A symptom being logged. `when` null = now; `links` are spine ranges sharing one score (not saved). */
type Draft = PainEntry & { levels: Record<string, number>; kinds: Record<string, Sensation[]>; when: number | null; links: string[][] };
type Card = { key: string; kind: 'symptom'; d: Draft } | OtherCard;

const blank = (): Draft => ({
  id: uid(), type: 'pain', mode: 'checkin', time: Date.now(), createdAt: 0, updatedAt: 0,
  intensity: null, trend: null, regions: {}, levels: {}, kinds: {}, qualities: [], duration: null, impacts: {},
  symptoms: [], symptomLevels: {}, postures: [], activities: [], slot: null, note: '', when: null, links: [],
});

function newCard(kind: CardKind): Card {
  const key = uid();
  if (kind === 'symptom') return { key, kind, d: blank() };
  if (kind === 'med') return { key, kind, dose: '', when: null };
  return { key, kind, when: null } as OtherCard;
}

const painTouched = (d: Draft) =>
  Object.keys(d.regions).length > 0 || d.symptoms.length > 0 || !!d.note || !!d.duration || Object.values(d.impacts).some((v) => v);

/** Draft → saved entry. Overall pain is the worst marked area; older entries without area levels keep their own. */
function toEntry(d: Draft, now: number, extra: Partial<PainEntry> = {}): PainEntry {
  const { when, links: _links, ...rest } = d;
  const lv = Object.values(d.levels);
  return { ...rest, intensity: lv.length ? Math.max(...lv) : d.intensity ?? null, time: when ?? now, ...extra };
}

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

/** Headache and migraine as chips (with a strength once chosen); every other symptom comes from a dropdown or is typed in. */
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

/** Where it hurts, symptoms, when, how long, what it affected. Shared by the home card and the edit sheet. */
function SymptomEditor({ d, onChange }: { d: Draft; onChange: (d: Draft) => void }) {
  const s = settings.value;
  const set = (p: Partial<Draft>) => onChange({ ...d, ...p });
  const regionIds = Object.keys(d.regions);
  const groups = groupsOf(d.links, d.regions);
  const groupOf = new Map(groups.flatMap((g) => g.map((id) => [id, g] as const)));
  const copy = () => ({ regions: { ...d.regions }, levels: { ...d.levels }, kinds: { ...d.kinds } });

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
    set({ regions, levels, kinds, links: d.links.map((g) => (g.some((x) => map.has(x)) ? g.map((x) => map.get(x) ?? x) : g)) });
  }

  function tapRegion(id: string) {
    const { regions, levels, kinds } = copy();
    let links = d.links;
    if (regions[id]) { delete regions[id]; delete levels[id]; delete kinds[id]; links = links.map((g) => g.filter((x) => x !== id)); }
    else { regions[id] = 'pain'; levels[id] = 5; kinds[id] = []; }
    set({ regions, levels, kinds, links });
    navigator.vibrate?.(8);
  }

  /** A drag along the spine: mark every vertebra in it with one shared level and pain types. */
  function addRange(ids: string[]) {
    const first = ids.find((id) => d.regions[id]);
    const level = first ? d.levels[first] ?? 5 : 5;
    const ks = first ? d.kinds[first] ?? [] : [];
    const { regions, levels, kinds } = copy();
    for (const id of ids) { regions[id] = ks[0] ?? 'pain'; levels[id] = level; kinds[id] = [...ks]; }
    set({ regions, levels, kinds, links: [...d.links.map((g) => g.filter((x) => !ids.includes(x))), ids] });
  }

  /** Apply a change to one area, or to every vertebra in its linked run. */
  function setArea(id: string, patch: { level?: number; kinds?: Sensation[] }) {
    const { regions, levels, kinds } = copy();
    for (const x of groupOf.get(id) ?? [id]) {
      if (patch.level != null) levels[x] = patch.level;
      if (patch.kinds) { kinds[x] = [...patch.kinds]; regions[x] = patch.kinds[0] ?? 'pain'; }
    }
    set({ levels, kinds, regions });
  }

  function removeArea(id: string) {
    const ids = groupOf.get(id) ?? [id];
    const { regions, levels, kinds } = copy();
    for (const x of ids) { delete regions[x]; delete levels[x]; delete kinds[x]; }
    set({ regions, levels, kinds, links: d.links.map((g) => g.filter((x) => !ids.includes(x))) });
  }

  function setSymptoms(symptoms: string[]) {
    const symptomLevels = Object.fromEntries(Object.entries(d.symptomLevels ?? {}).filter(([k]) => symptoms.includes(k)));
    set({ symptoms, symptomLevels });
  }

  return (
    <>
      {s.steps.where && (
        <div class="pad-box tight">
          <BodyMap value={d.regions} levels={d.levels} onTap={tapRegion} onRange={addRange} incision={s.incision} />
        </div>
      )}
      {regionIds.filter((id) => (groupOf.get(id)?.[0] ?? id) === id).map((id) => {
        const g = groupOf.get(id);
        const label = g ? spineRangeLabel(spineIdx(g[0]), spineIdx(g[g.length - 1])) : regionLabel(id);
        return (
          <div class="arow" key={g ? g.join() : id}>
            <div class="arow-line">
              {g ? (
                <button class="arow-label group-label" aria-label={`${label}, ${g.length} vertebrae. Separate`} onClick={() => set({ links: d.links.filter((x) => !x.some((y) => g.includes(y))) })}>
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
      {s.steps.symptoms && (
        <div class="pad-box">
          <SymptomPicker options={s.symptoms} value={d.symptoms} onChange={setSymptoms} />
        </div>
      )}
      {MAIN_SYMPTOMS.filter((x) => d.symptoms.includes(x)).map((x) => (
        <div class="arow" key={x}>
          <div class="arow-line">
            <span class="arow-label">{x}</span>
            <PainSlider value={d.symptomLevels?.[x]} onChange={(v) => set({ symptomLevels: { ...d.symptomLevels, [x]: v } })} label={`${x} strength`} />
            <PainPill n={d.symptomLevels?.[x] ?? null} />
          </div>
        </div>
      ))}
      <WhenRow value={d.when} onChange={(when) => set({ when })} />
      {s.steps.duration && (
        <FieldRow label="Lasted">
          <Pick options={[...DURATIONS, ...(d.duration && !DURATIONS.includes(d.duration) ? [d.duration] : [])].map((v) => ({ v, label: v }))} value={d.duration} onChange={(v) => set({ duration: v ?? null })} />
        </FieldRow>
      )}
      {s.steps.impact && (
        <FieldRow label="Affected">
          <div class="kinds">
            {IMPACTS.map((im) => {
              const v = d.impacts[im.id] ?? 0;
              const next = ((v + 1) % 3) as Level;
              return (
                <button key={im.id} class={'kind' + (v ? ' on' : '')} aria-pressed={!!v} onClick={() => set({ impacts: { ...d.impacts, [im.id]: next || null } })}>
                  {im.label}{v === 1 ? ' · some' : v === 2 ? ' · a lot' : ''}
                </button>
              );
            })}
          </div>
        </FieldRow>
      )}
      {s.steps.note && (
        <FieldRow label="Note">
          <input class="input note-input" value={d.note} onInput={(e) => set({ note: (e.target as HTMLInputElement).value })} />
        </FieldRow>
      )}
    </>
  );
}

const fromEntry = (entry: PainEntry): Draft => {
  const d: Draft = {
    ...entry,
    levels: entry.levels ?? {},
    kinds: entry.kinds ?? Object.fromEntries(Object.entries(entry.regions).map(([k, v]) => [k, [v]])),
    symptomLevels: entry.symptomLevels ?? {},
    when: entry.time,
    links: [],
  };
  return { ...d, links: initialLinks(d) };
};

/** Home: pick a symptom, posture, medication or exercise; stack as many as you like; save them together. */
export function CheckIn({ entry }: { entry?: PainEntry }) {
  return entry ? <EditSymptom entry={entry} /> : <Home />;
}

function EditSymptom({ entry }: { entry: PainEntry }) {
  const [d, setD] = useState(() => fromEntry(entry));
  async function save() {
    await saveEntry(toEntry(d, Date.now()));
    closeSheet();
    showToast('Saved');
  }
  return (
    <Sheet title="Symptom" onClose={closeSheet} action={{ label: 'Save', onClick: save }} tall>
      <section class="section"><div class="group"><SymptomEditor d={d} onChange={setD} /></div></section>
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

const KINDS: CardKind[] = ['symptom', 'posture', 'med', 'exercise'];

function Home() {
  const s = settings.value;
  const [cards, setCards] = useState<Card[]>(() => (pendingSlot.value ? [newCard('symptom')] : []));
  const added = useRef<string | null>(null);

  // A reminder opened the app: start with a symptom card.
  useEffect(() => {
    if (pendingSlot.value && !cards.some((c) => c.kind === 'symptom')) setCards((cs) => [newCard('symptom'), ...cs]);
  }, [pendingSlot.value]);

  // Bring a newly added card into view.
  useEffect(() => {
    if (!added.current) return;
    document.getElementById('card-' + added.current)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    added.current = null;
  }, [cards.length]);

  const add = (kind: CardKind) => {
    const c = newCard(kind);
    if (cards.length) added.current = c.key;
    setCards([...cards, c]);
    navigator.vibrate?.(8);
  };
  const update = (key: string, c: Card) => setCards((cs) => cs.map((x) => (x.key === key ? c : x)));
  const remove = (key: string) => setCards((cs) => cs.filter((x) => x.key !== key));
  const ready = cards.filter((c) => (c.kind === 'symptom' ? painTouched(c.d) : cardReady(c)));

  async function save() {
    const now = Date.now();
    const group = ready.length > 1 ? uid() : undefined;
    const pains = entries.value.filter((e): e is PainEntry => e.type === 'pain');
    const due = pendingSlot.value ?? s.checkinTimes.find((t) => slotStatus(t, pains) === 'due') ?? null;
    const ids: string[] = [];
    for (const c of ready) {
      const e = c.kind === 'symptom'
        ? toEntry(c.d, now, { group, slot: c.d.when == null ? due : null })
        : cardEntry(c, now, group);
      ids.push((await saveEntry(e)).id);
    }
    navigator.vibrate?.(12);
    pendingSlot.value = null;
    setCards([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Saved', { label: 'Undo', run: () => ids.forEach((id) => removeEntry(id)) });
  }

  return (
    <div class={'screen' + (cards.length ? ' has-savebar' : '')}>
      <header class="bar">
        <h1>Check In</h1>
        <LastReading />
        <span class="grow" />
        <button class="nav-btn" aria-label="Log something else" onClick={() => openSheet('add')}><IconPlus /></button>
        <button class="nav-btn" aria-label="Settings" onClick={() => go('settings')}><IconGear /></button>
      </header>

      {cards.length === 0 ? (
        <div class="log-pick">
          {KINDS.map((k) => {
            const st = CARD_STYLE[k];
            return <button key={k} onClick={() => add(k)}><span style={{ background: st.color }}><st.Icon /></span>{st.label}</button>;
          })}
        </div>
      ) : (
        <>
          {cards.map((c) => (
            <div id={'card-' + c.key} key={c.key}>
              {c.kind === 'symptom' ? (
                <CardShell kind="symptom" onRemove={() => remove(c.key)}>
                  <SymptomEditor d={c.d} onChange={(d) => update(c.key, { ...c, d })} />
                </CardShell>
              ) : (
                <OtherCardView card={c} onChange={(n) => update(c.key, n)} onRemove={() => remove(c.key)} />
              )}
            </div>
          ))}
          <section class="section">
            <div class="sec-head"><span>Add</span></div>
            <div class="add-row">
              {KINDS.map((k) => {
                const st = CARD_STYLE[k];
                return <button key={k} onClick={() => add(k)}><span style={{ background: st.color }}><st.Icon /></span>{st.label}</button>;
              })}
            </div>
          </section>
          <div class="savebar">
            <button class="btn primary wide" disabled={!ready.length} onClick={save}>
              {pendingSlot.value ? `Save ${fmtSlot(pendingSlot.value)} Check-In` : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function LastReading() {
  const last = [...entries.value].reverse().find((e): e is PainEntry => e.type === 'pain' && e.intensity != null);
  if (!last) return null;
  return (
    <button class="last" onClick={() => go('history')}>
      <PainPill n={last.intensity} /> {ago(last.time)}
    </button>
  );
}
