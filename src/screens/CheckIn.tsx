import { useEffect, useRef, useState } from 'preact/hooks';
import { entries, removeEntry, rememberChip, saveEntry, settings, uid } from '../lib/store';
import { closeSheet, go, openSheet, pendingSlot } from '../lib/nav';
import { AREA_KINDS, DURATIONS, IMPACTS } from '../lib/catalog';
import { ago, fmtSlot } from '../lib/time';
import { slotStatus } from '../lib/env';
import type { PainEntry, Sensation } from '../lib/types';
import { BodyMap, SPINE, regionLabel, spineRangeLabel } from '../components/BodyMap';
import { PainPill, PainSlider, Sheet, showToast } from '../components/ui';
import { IconClose, IconDownChev, IconGear, IconPlus, IconUpChev, IconUpDown } from '../components/Icons';
import { MenuButton, MenuRow } from '../components/Menu';
import { CARD_STYLE, CardShell, OtherCardView, TextRow, primeKeyboard, WhenRow, cardEntry, cardReady, type CardKind, type MoveCard, type OtherCard } from '../forms/LogCards';
import { EntryRow } from '../components/EntryRow';

/** A pain or symptom being logged. `when` null = now; `links` are spine ranges sharing one score (not saved). */
type Draft = PainEntry & { levels: Record<string, number>; kinds: Record<string, Sensation[]>; when: number | null; links: string[][] };
type Card = { key: string; kind: 'pain' | 'symptom'; fresh?: boolean; d: Draft } | OtherCard;

const blank = (): Draft => ({
  id: uid(), type: 'pain', mode: 'checkin', time: Date.now(), createdAt: 0, updatedAt: 0,
  intensity: null, trend: null, regions: {}, levels: {}, kinds: {}, qualities: [], duration: null, impacts: {},
  symptoms: [], symptomLevels: {}, postures: [], activities: [], slot: null, note: '', when: null, links: [],
});

function newCard(kind: CardKind): Card {
  const key = uid();
  if (kind === 'pain' || kind === 'symptom') return { key, kind, fresh: true, d: blank() };
  if (kind === 'med') return { key, kind, fresh: true, dose: '', when: null };
  return { key, kind, fresh: true, when: null };
}

/** Draft → saved entry. Overall pain is the worst marked area; older entries without area levels keep their own. */
function toEntry(d: Draft, now: number, extra: Partial<PainEntry> = {}): PainEntry {
  const { when, links: _links, ...rest } = d;
  const lv = Object.values(d.levels);
  return { ...rest, intensity: lv.length ? Math.max(...lv) : d.intensity ?? null, time: when ?? now, ...extra };
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

/** What an area feels like, chosen from a menu (any number). */
function FeelsLike({ value, onChange }: { value: Sensation[]; onChange: (v: Sensation[]) => void }) {
  const text = AREA_KINDS.filter((k) => value.includes(k.id)).map((k) => k.short).join(', ');
  return (
    <MenuButton
      class={'feels' + (text ? ' set' : '')} label="Feels like" multi
      items={AREA_KINDS.map((k) => ({ v: k.id, label: k.label }))} value={value} onChange={(v) => onChange(v as Sensation[])}
    >
      <span>{text || 'Feels like…'}</span><IconUpDown />
    </MenuButton>
  );
}

/** The diagram and one row per marked area. */
function AreaEditor({ d, set }: { d: Draft; set: (p: Partial<Draft>) => void }) {
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

  return (
    <>
      <div class="pad-box tight">
        <BodyMap value={d.regions} levels={d.levels} onTap={tapRegion} onRange={addRange} />
      </div>
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
              <span class="grow" />
              <FeelsLike value={d.kinds[id] ?? []} onChange={(kinds) => setArea(id, { kinds })} />
              {id.startsWith('spine-') && (
                <span class="spine-step">
                  <button class="x-btn" aria-label="One vertebra higher" onClick={() => moveSpine(g ?? [id], -1)}><IconUpChev /></button>
                  <button class="x-btn" aria-label="One vertebra lower" onClick={() => moveSpine(g ?? [id], 1)}><IconDownChev /></button>
                </span>
              )}
              <button class="x-btn" aria-label={`Remove ${label}`} onClick={() => removeArea(id)}><IconClose /></button>
            </div>
            <div class="arow-line">
              <PainSlider value={d.levels[id]} onChange={(level) => setArea(id, { level })} label={label} />
              <PainPill n={d.levels[id] ?? null} />
            </div>
          </div>
        );
      })}
    </>
  );
}

/** Symptoms from a menu (or typed in), each with its own strength. */
function SymptomRows({ d, set, autoOpen }: { d: Draft; set: (p: Partial<Draft>) => void; autoOpen?: boolean }) {
  const s = settings.value;
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const options = [...s.symptoms, ...d.symptoms.filter((x) => !s.symptoms.includes(x))];
  const choose = (symptoms: string[]) =>
    set({ symptoms, symptomLevels: Object.fromEntries(Object.entries(d.symptomLevels ?? {}).filter(([k]) => symptoms.includes(k))) });
  const commit = () => {
    const v = text.trim();
    if (v) { const name = rememberChip('symptoms', v); if (!d.symptoms.includes(name)) choose([...d.symptoms, name]); }
    setTyping(false);
    setText('');
  };
  return (
    <>
      <MenuRow
        label="Symptoms" placeholder="Choose" multi autoOpen={autoOpen} display={d.symptoms.join(', ')}
        items={[...options.map((x) => ({ v: x, label: x })), { v: 'new', label: 'Something else…', action: true }]}
        value={d.symptoms} onChange={choose} onAction={() => { primeKeyboard(); setTyping(true); }}
      />
      {typing && <TextRow label="Symptom" placeholder="New symptom" actionLabel="Add" value={text} onInput={setText} onDone={commit} autoFocus />}
      {d.symptoms.map((x) => (
        <div class="arow" key={x}>
          <div class="arow-line"><span class="arow-label">{x}</span></div>
          <div class="arow-line">
            <PainSlider value={d.symptomLevels?.[x]} onChange={(v) => set({ symptomLevels: { ...d.symptomLevels, [x]: v } })} label={`${x} strength`} />
            <PainPill n={d.symptomLevels?.[x] ?? null} />
          </div>
        </div>
      ))}
    </>
  );
}

/** When, how long, what it affected, and a note. */
function DetailRows({ d, set }: { d: Draft; set: (p: Partial<Draft>) => void }) {
  const s = settings.value;
  const affected = IMPACTS.filter((i) => d.impacts[i.id]);
  return (
    <>
      <WhenRow value={d.when} onChange={(when) => set({ when })} />
      {s.steps.duration && (
        <MenuRow
          label="Lasted" display={d.duration ?? undefined}
          items={[{ v: '', label: 'Not set' }, ...[...DURATIONS, ...(d.duration && !DURATIONS.includes(d.duration) ? [d.duration] : [])].map((v) => ({ v, label: v }))]}
          value={[d.duration ?? '']} onChange={([v]) => set({ duration: v || null })}
        />
      )}
      {s.steps.impact && (
        <MenuRow
          label="Got in the way of" multi display={affected.map((i) => i.label).join(', ')} placeholder="Nothing"
          items={IMPACTS.map((i) => ({ v: i.id, label: i.label }))} value={affected.map((i) => i.id)}
          onChange={(ids) => set({ impacts: Object.fromEntries(ids.map((id) => [id, d.impacts[id] || 1])) })}
        />
      )}
      {s.steps.note && <TextRow label="Note" placeholder="Add" value={d.note ?? ''} onInput={(note) => set({ note })} />}
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

/** Home: log pain, a symptom, a medication or a posture/activity/exercise; stack as many as you like; save them together. */
export function CheckIn({ entry }: { entry?: PainEntry }) {
  return entry ? <EditEntry entry={entry} /> : <Home />;
}

/** Editing a saved pain or symptom entry from History. */
function EditEntry({ entry }: { entry: PainEntry }) {
  const [d, setD] = useState(() => fromEntry(entry));
  const dRef = useRef(d);
  dRef.current = d;
  const set = (p: Partial<Draft>) => { dRef.current = { ...dRef.current, ...p }; setD(dRef.current); };
  const [moves, setMoves] = useState<MoveCard[]>([]);
  const movesRef = useRef(moves);
  movesRef.current = moves;
  const addedMove = useRef<string | null>(null);
  const hasPain = Object.keys(entry.regions).length > 0 || !entry.symptoms.length;
  const linked = entry.group
    ? entries.value.filter((e) => e.group === entry.group && e.id !== entry.id && (e.type === 'posture' || e.type === 'activity' || (e.type === 'treatment' && e.kind === 'exercises')))
    : [];

  useEffect(() => {
    if (!addedMove.current) return;
    document.getElementById('card-' + addedMove.current)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    addedMove.current = null;
  }, [moves.length]);

  const addMove = () => {
    const c: MoveCard = { key: uid(), kind: 'move', fresh: true, when: null };
    addedMove.current = c.key;
    movesRef.current = [...movesRef.current, c];
    setMoves(movesRef.current);
    navigator.vibrate?.(8);
  };
  const updateMove = (key: string, c: MoveCard) => {
    movesRef.current = movesRef.current.map((x) => (x.key === key ? c : x));
    setMoves(movesRef.current);
  };
  const removeMove = (key: string) => {
    movesRef.current = movesRef.current.filter((x) => x.key !== key);
    setMoves(movesRef.current);
  };

  async function save() {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const cur = dRef.current;
    const readyMoves = movesRef.current.filter(cardReady);
    const refTime = cur.when ?? entry.time;
    const group = cur.group || (readyMoves.length ? uid() : undefined);
    await saveEntry(toEntry(cur, Date.now(), group ? { group } : {}));
    for (const m of readyMoves) {
      await saveEntry(cardEntry(m, refTime, group));
    }
    closeSheet();
    showToast('Saved');
  }
  return (
    <Sheet title={hasPain ? 'Pain' : 'Symptom'} onClose={closeSheet} action={{ label: 'Save', onClick: save }} tall>
      <section class="section">
        <div class="group">
          {hasPain && <AreaEditor d={d} set={set} />}
          {(!hasPain || entry.symptoms.length > 0) && <SymptomRows d={d} set={set} />}
          <DetailRows d={d} set={set} />
        </div>
      </section>
      {linked.length > 0 && (
        <section class="section">
          <div class="sec-head"><span>What you were doing before it</span></div>
          <div class="group flush">{linked.map((e) => <EntryRow key={e.id} e={e} />)}</div>
        </section>
      )}
      {moves.map((m) => (
        <div id={'card-' + m.key} key={m.key}>
          <OtherCardView card={m} refTime={d.when ?? entry.time} onChange={(n) => updateMove(m.key, n as MoveCard)} onRemove={() => removeMove(m.key)} />
        </div>
      ))}
      <section class="section">
        <div class="group">
          <button type="button" class="row-item add-item" onClick={addMove}>
            <span class="row-icon small" style={{ background: CARD_STYLE.move.color }}><CARD_STYLE.move.Icon /></span>
            <span class="row-label">{moves.length || linked.length ? 'I was doing something else too' : 'What I was doing before it'}</span>
            <span class="add-plus"><IconPlus /></span>
          </button>
        </div>
      </section>
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

const KINDS: CardKind[] = ['pain', 'symptom', 'med', 'move'];

/** How each "add" row reads, given what's already on the screen. null hides it. */
function addPhrase(k: CardKind, cards: Card[]): string | null {
  const has = (x: CardKind) => cards.some((c) => c.kind === x);
  const issue = has('pain') || has('symptom');
  switch (k) {
    case 'pain': return has('pain') ? null : 'I’m in pain too';
    case 'symptom': return has('symptom') ? 'I had another symptom' : has('pain') ? 'I also had a headache or other symptom' : 'I had a symptom';
    case 'med': return has('med') ? 'I took another medication' : issue ? 'I took medication for it' : 'I took medication';
    case 'move': return has('move') ? 'I was doing something else too' : issue ? 'What I was doing before it' : 'What I was doing';
  }
}

function Home() {
  const s = settings.value;
  const [cards, setCards] = useState<Card[]>(() => (pendingSlot.value ? [newCard('pain')] : []));
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const added = useRef<string | null>(null);

  // A reminder opened the app: start with the pain card.
  useEffect(() => {
    if (pendingSlot.value && !cards.some((c) => c.kind === 'pain')) setCards((cs) => [newCard('pain'), ...cs]);
  }, [pendingSlot.value]);

  // Bring a newly added card into view.
  useEffect(() => {
    if (!added.current) return;
    document.getElementById('card-' + added.current)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    added.current = null;
  }, [cards.length]);

  const add = (kind: CardKind) => {
    const c = newCard(kind);
    // With no saved medications the card opens on a name field, so get the keyboard up during this tap.
    if (kind === 'med' && !settings.value.treatments.some((t) => t.kind === 'medication')) primeKeyboard();
    if (cards.length) added.current = c.key;
    cardsRef.current = [...cardsRef.current, c];
    setCards(cardsRef.current);
    navigator.vibrate?.(8);
  };
  const update = (key: string, c: Card) => {
    cardsRef.current = cardsRef.current.map((x) => (x.key === key ? c : x));
    setCards(cardsRef.current);
  };
  const remove = (key: string) => {
    cardsRef.current = cardsRef.current.filter((x) => x.key !== key);
    setCards(cardsRef.current);
  };
  const isReady = (c: Card) =>
    !('d' in c) ? cardReady(c) : c.kind === 'pain' ? Object.keys(c.d.regions).length > 0 : c.d.symptoms.length > 0;
  const ready = cards.filter(isReady);

  async function save() {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const readyNow = cardsRef.current.filter(isReady);
    if (!readyNow.length) return;
    const now = Date.now();
    const group = readyNow.length > 1 ? uid() : undefined;
    const pains = entries.value.filter((e): e is PainEntry => e.type === 'pain');
    const due = pendingSlot.value ?? s.checkinTimes.find((t) => slotStatus(t, pains) === 'due') ?? null;
    const ids: string[] = [];
    for (const c of readyNow) {
      const e = 'd' in c
        ? toEntry(c.d, now, { group, slot: c.kind === 'pain' && c.d.when == null ? due : null })
        : cardEntry(c, now, group);
      ids.push((await saveEntry(e)).id);
    }
    navigator.vibrate?.(12);
    pendingSlot.value = null;
    cardsRef.current = [];
    setCards([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Saved', { label: 'Undo', run: () => ids.forEach((id) => removeEntry(id)) });
  }

  const phrases = KINDS.map((k) => [k, addPhrase(k, cards)] as const).filter((x): x is [CardKind, string] => !!x[1]);

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
        <>
          <p class="log-prompt">What would you like to log?</p>
          <div class="log-pick">
            {KINDS.map((k) => {
              const st = CARD_STYLE[k];
              return <button key={k} onClick={() => add(k)}><span style={{ background: st.color }}><st.Icon /></span>{st.label}</button>;
            })}
          </div>
        </>
      ) : (
        <>
          {cards.map((c) => (
            <div id={'card-' + c.key} key={c.key}>
              {'d' in c ? (
                <CardShell kind={c.kind} onRemove={() => remove(c.key)}>
                  {c.kind === 'pain'
                    ? <AreaEditor d={c.d} set={(p) => update(c.key, { ...c, d: { ...c.d, ...p } })} />
                    : <SymptomRows d={c.d} set={(p) => update(c.key, { ...c, d: { ...c.d, ...p } })} autoOpen={c.fresh} />}
                  <DetailRows d={c.d} set={(p) => update(c.key, { ...c, d: { ...c.d, ...p } })} />
                </CardShell>
              ) : (
                <OtherCardView card={c} onChange={(n) => update(c.key, n)} onRemove={() => remove(c.key)} />
              )}
            </div>
          ))}
          <section class="section">
            <div class="group">
              {phrases.map(([k, text]) => {
                const st = CARD_STYLE[k];
                return (
                  <button key={k} class="row-item add-item" onClick={() => add(k)}>
                    <span class="row-icon small" style={{ background: st.color }}><st.Icon /></span>
                    <span class="row-label">{text}</span>
                    <span class="add-plus"><IconPlus /></span>
                  </button>
                );
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
