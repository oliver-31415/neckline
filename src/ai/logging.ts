import { entries, rememberChip, rememberPosture, rememberTreatment, removeEntry, saveEntry, settings, uid } from '../lib/store';
import { AREA_KINDS, DURATIONS, HELPED_LABELS, IMPACTS, POSTURES, TREATMENT_KINDS } from '../lib/catalog';
import { ARM_SHAPES, BACK_SHAPES, FRONT_SHAPES, SPINE, SENSATION_LABEL, regionLabel, regionNames } from '../components/BodyMap';
import { slotStatus } from '../lib/env';
import { DAY, dayKey, fmtDayRelative, fmtMinutes, fmtTime, fromDayKey } from '../lib/time';
import { exerciseDose } from '../forms/LogCards';
import { showToast } from '../components/ui';
import type { DayEntry, Entry, Helped, PainEntry, Sensation } from '../lib/types';
import { DATE, type ObjectSchema } from './schema';
import { ToolError, type AiTool } from './tools';

/*
 * Logging from the chat: the person says what happened in their own words, the assistant turns it
 * into the same entries the Check In screen and the Log forms make, and they're saved once the
 * person taps Save on the card listing exactly what will be stored. Names are matched to the
 * person's own lists, and new ones are remembered, just as when they type them in themselves.
 */

/** Every area that can be marked on the body diagrams, by its label. */
const AREAS: Map<string, string> = (() => {
  const ids = [...BACK_SHAPES, ...FRONT_SHAPES, ...ARM_SHAPES].map((s) => s.id).concat(SPINE.map((v) => `spine-${v}`));
  return new Map([...new Set(ids)].map((id) => [regionLabel(id).toLowerCase(), id]));
})();

/** "Right forearm" → ["forearm-R"]; "Spine C4–C6" → three vertebrae. */
function areaIds(name: string): string[] {
  const n = name.trim().toLowerCase().replace(/\s+/g, ' ');
  const run = /^spine ([ct]\d) ?[–-] ?([ct]\d)$/.exec(n);
  if (run) {
    const a = SPINE.indexOf(run[1].toUpperCase()), b = SPINE.indexOf(run[2].toUpperCase());
    if (a >= 0 && b >= 0) return SPINE.slice(Math.min(a, b), Math.max(a, b) + 1).map((v) => `spine-${v}`);
  }
  const id = AREAS.get(n) ?? AREAS.get('spine ' + n);
  if (!id) throw new ToolError(`Unknown area "${name}". Use a name from get_log_options, or a spine range like "Spine C4–C6".`);
  return [id];
}

/** The person's own spelling of a name if they've used it before; otherwise as given. */
const match = (list: string[], name: string) => list.find((x) => x.toLowerCase() === name.trim().toLowerCase()) ?? name.trim();

const TYPES = ['pain', 'symptom', 'medication', 'exercise', 'posture', 'activity', 'treatment', 'meal', 'day'] as const;
type Kind = (typeof TYPES)[number];

/** Which fields each type takes, besides type, time and note. */
const FIELDS: Record<Kind, string[]> = {
  pain: ['areas', 'lasted', 'got_in_the_way_of'],
  symptom: ['symptoms', 'lasted', 'got_in_the_way_of'],
  medication: ['name', 'dose', 'helped', 'side_effects'],
  exercise: ['name', 'minutes', 'hold_seconds', 'helped'],
  posture: ['posture', 'minutes', 'breaks'],
  activity: ['name', 'minutes', 'effort'],
  treatment: ['kind', 'name', 'dose', 'minutes', 'helped', 'side_effects'],
  meal: ['tags'],
  day: ['date', 'sleep_hours', 'sleep_quality', 'stress', 'unusual_exertion'],
};

const IMPACT_ID = Object.fromEntries(IMPACTS.flatMap((x) => [[x.id, x.id], [x.label.toLowerCase(), x.id]]));
const KIND_LABEL = Object.fromEntries(TREATMENT_KINDS.map((k) => [k.id, k.label]));

const ITEM: ObjectSchema = {
  type: 'object',
  required: ['type'],
  properties: {
    type: { type: 'string', enum: [...TYPES], description: 'pain: areas of pain with a level each. symptom: headache, migraine, dizziness and the like. medication: a medicine taken. exercise: walks, stretches, physio. posture: how the head and neck were held for a spell. activity: something done (computer, driving, housework). treatment: ice, heat, massage, collar, rest. meal: food and drink. day: sleep, stress and exertion for one date.' },
    time: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$', description: 'Local time as YYYY-MM-DDTHH:MM. For pain, symptoms and medication: when it happened. For exercise, posture and activity: when it started. Leave out for "now" (a spell with minutes is then taken to have just ended).' },
    note: { type: 'string', maxLength: 1000, description: 'Anything they said that no field holds, in their own words. For a meal, what they had.' },
    areas: { type: 'array', maxItems: 30, description: 'pain only. At least one.', items: {
      type: 'object', required: ['area', 'level'], properties: {
        area: { type: 'string', maxLength: 60, description: 'An area name from get_log_options, or a spine range like "Spine C4–C6".' },
        level: { type: 'integer', minimum: 0, maximum: 10 },
        feels: { type: 'array', maxItems: 5, items: { type: 'string', enum: AREA_KINDS.map((k) => k.id) }, description: 'ache, nerve (sharp nerve pain), tingling, cramp, stiff.' },
      },
    } },
    symptoms: { type: 'array', maxItems: 10, description: 'symptom only. At least one.', items: {
      type: 'object', required: ['name'], properties: { name: { type: 'string', maxLength: 60 }, strength: { type: 'integer', minimum: 0, maximum: 10 } },
    } },
    lasted: { type: 'string', enum: DURATIONS },
    got_in_the_way_of: { type: 'array', maxItems: 5, items: { type: 'string', enum: IMPACTS.map((x) => x.id) } },
    name: { type: 'string', maxLength: 80, description: 'Medication, exercise or activity name; for treatment, optional.' },
    dose: { type: 'string', maxLength: 60, description: 'As they’d write it, e.g. "400 mg" or "2 tablets".' },
    helped: { type: 'string', enum: Object.keys(HELPED_LABELS), description: Object.entries(HELPED_LABELS).map(([k, v]) => `${k}: ${v}`).join('; ') },
    side_effects: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 40 } },
    kind: { type: 'string', enum: TREATMENT_KINDS.map((k) => k.id).filter((k) => k !== 'medication' && k !== 'exercises') },
    posture: { type: 'string', maxLength: 60, description: `Built-in posture id (${Object.entries(POSTURES).map(([k, v]) => `${k}: ${v.label}`).join('; ')}) or a custom posture name from get_log_options.` },
    minutes: { type: 'integer', minimum: 1, maximum: 1440 },
    hold_seconds: { type: 'integer', minimum: 1, maximum: 600 },
    breaks: { type: 'string', enum: ['yes', 'some', 'no'] },
    effort: { type: 'string', enum: ['light', 'moderate', 'hard'] },
    tags: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 40 }, description: 'meal only: Breakfast, Lunch, Coffee… (their meal tags).' },
    date: { ...DATE, description: 'day only: the date it describes (sleep is the night before). Default today.' },
    sleep_hours: { type: 'number', minimum: 0, maximum: 24 },
    sleep_quality: { type: 'string', enum: ['poor', 'ok', 'good'] },
    stress: { type: 'integer', minimum: 0, maximum: 10 },
    unusual_exertion: { type: 'boolean' },
  },
};

/** One proposed entry, ready to save, plus what the person is shown and the lists it adds to. `old`: the entry it updates. */
interface Planned { entry: Entry; line: string; remember: () => void; old?: Entry }

const item = (line: string) => { const [title, ...rest] = line.split('\n'); return { title, body: rest.map((x) => x.trim()).join('\n') }; };

function timeOf(i: { time?: string }, now: number) {
  if (!i.time) return null;
  const t = new Date(i.time).getTime();
  if (!Number.isFinite(t)) throw new ToolError(`"${i.time}" isn't a valid time.`);
  if (t > now + 5 * 60_000) throw new ToolError(`${i.time} is in the future. Only log things that have happened.`);
  if (t < now - 400 * DAY) throw new ToolError(`${i.time} is more than a year ago.`);
  return t;
}

const at = (t: number) => `${fmtDayRelative(t)} ${fmtTime(t)}`;

function plan(i: any, now: number, due: string | null): Planned {
  const type = i.type as Kind;
  const extra = Object.keys(i).filter((k) => !['type', 'time', 'note'].includes(k) && i[k] != null && !FIELDS[type].includes(k));
  if (extra.length) throw new ToolError(`${type} entries don't take ${extra.join(', ')}. They take: ${FIELDS[type].join(', ')}, time, note.`);
  const s = settings.value;
  const t = timeOf(i, now);
  const note = i.note?.trim() ?? '';
  const base = { id: uid(), time: t ?? now, createdAt: 0, updatedAt: 0, note };
  /** Spells logged for "now" are taken to have just ended, as on the Check In screen. */
  const start = t ?? now - (i.minutes ?? 0) * 60_000;
  const noteLine = note ? `\n“${note}”` : '';
  const impacts = (i.got_in_the_way_of ?? []).map((x: string) => IMPACT_ID[x]).filter(Boolean) as string[];
  const tail = [i.lasted ? `Lasted ${i.lasted}` : '', impacts.length ? `Got in the way of ${impacts.map((x) => IMPACTS.find((m) => m.id === x)!.label.toLowerCase()).join(', ')}` : ''].filter(Boolean).join(' · ');
  const painBase = (): Omit<PainEntry, 'regions' | 'intensity'> => ({
    ...base, type: 'pain', mode: 'checkin', trend: null, qualities: [], duration: i.lasted ?? null,
    impacts: Object.fromEntries(impacts.map((x) => [x, 1])), symptoms: [], symptomLevels: {}, postures: [], activities: [],
    slot: t == null ? due : null,
  });

  switch (type) {
    case 'pain': {
      if (!i.areas?.length) throw new ToolError('A pain entry needs at least one area with a level. Ask where it hurts and how bad, if they haven’t said.');
      const regions: Record<string, Sensation> = {}, levels: Record<string, number> = {}, kinds: Record<string, Sensation[]> = {};
      for (const a of i.areas) for (const id of areaIds(a.area)) {
        const feels = [...new Set<Sensation>(a.feels ?? [])];
        regions[id] = feels[0] ?? 'pain'; levels[id] = a.level; kinds[id] = feels;
      }
      const entry: PainEntry = { ...painBase(), regions, levels, kinds, intensity: Math.max(...Object.values(levels)) };
      const parts = i.areas.map((a: any) => `${regionNames(areaIds(a.area)).join(', ')} ${a.level}/10${a.feels?.length ? ` (${a.feels.map((k: Sensation) => SENSATION_LABEL[k]).join(', ')})` : ''}`);
      return { entry, line: `Pain · ${at(entry.time)}\n${parts.join(', ')}${tail ? `\n${tail}` : ''}${noteLine}`, remember: () => {} };
    }
    case 'symptom': {
      if (!i.symptoms?.length) throw new ToolError('A symptom entry needs at least one symptom.');
      const names = i.symptoms.map((x: any) => match(s.symptoms, x.name));
      const symptomLevels = Object.fromEntries(i.symptoms.flatMap((x: any, k: number) => (x.strength != null ? [[names[k], x.strength]] : [])));
      const entry: PainEntry = { ...painBase(), regions: {}, intensity: null, symptoms: names, symptomLevels };
      return {
        entry,
        line: `Symptom · ${at(entry.time)}\n${names.map((n: string) => `${n}${symptomLevels[n] != null ? ` ${symptomLevels[n]}/10` : ''}`).join(', ')}${tail ? `\n${tail}` : ''}${noteLine}`,
        remember: () => names.forEach((n: string) => rememberChip('symptoms', n)),
      };
    }
    case 'medication': case 'treatment': {
      const kind = type === 'medication' ? 'medication' : i.kind;
      if (!kind) throw new ToolError('A treatment entry needs a kind (ice, heat, massage, collar, rest or other).');
      const saved = s.treatments.find((x) => x.name.toLowerCase() === (i.name ?? '').trim().toLowerCase());
      const name = saved?.name ?? (i.name?.trim() || (kind !== 'medication' ? KIND_LABEL[kind] : ''));
      if (!name) throw new ToolError('A medication entry needs the medication’s name.');
      const dose = (i.dose ?? (kind !== 'medication' && i.minutes ? fmtMinutes(i.minutes) : '')).trim();
      const sideEffects = (i.side_effects ?? []).map((x: string) => match(s.sideEffects, x));
      const entry: Entry = { ...base, type: 'treatment', kind, name, dose, helped: (i.helped as Helped) ?? null, sideEffects, minutes: i.minutes ?? null };
      const extras = [i.helped ? HELPED_LABELS[i.helped] : '', sideEffects.length ? `Side effects: ${sideEffects.join(', ')}` : ''].filter(Boolean).join(' · ');
      return {
        entry,
        line: `${kind === 'medication' ? 'Medication' : KIND_LABEL[kind]} · ${at(entry.time)}\n${name}${dose ? ` ${dose}` : ''}${extras ? `\n${extras}` : ''}${noteLine}`,
        remember: () => { rememberTreatment(name, kind, dose || undefined); sideEffects.forEach((x: string) => rememberChip('sideEffects', x)); },
      };
    }
    case 'exercise': {
      if (!i.name?.trim()) throw new ToolError('An exercise entry needs the exercise’s name.');
      const name = match(s.exercises, i.name);
      const dose = exerciseDose(i.minutes, i.hold_seconds);
      const entry: Entry = { ...base, time: start, type: 'treatment', kind: 'exercises', name, dose, minutes: i.minutes ?? null, holdSeconds: i.hold_seconds ?? null, helped: (i.helped as Helped) ?? null, sideEffects: [] };
      return { entry, line: `Exercise · ${at(start)}\n${name}${dose ? `, ${dose}` : ''}${noteLine}`, remember: () => rememberChip('exercises', name) };
    }
    case 'posture': {
      if (!i.posture?.trim()) throw new ToolError('A posture entry needs a posture.');
      const raw = i.posture.trim();
      const low = raw.toLowerCase();
      const builtIn = Object.entries(POSTURES).find(([k, p]) => k.toLowerCase() === low || p.label.toLowerCase() === low)?.[0];
      const posture = builtIn ?? match(s.postures, raw);
      const entry: Entry = { ...base, time: start, type: 'posture', posture, minutes: i.minutes ?? null, breaks: i.breaks ?? null };
      const breaks = i.breaks ? `, ${{ yes: 'with breaks', some: 'a few breaks', no: 'no breaks' }[i.breaks as 'yes']}` : '';
      return { entry, line: `Posture · ${at(start)}\n${POSTURES[posture]?.label ?? posture}${i.minutes ? `, ${fmtMinutes(i.minutes)}` : ''}${breaks}${noteLine}`, remember: () => rememberPosture(posture) };
    }
    case 'activity': {
      if (!i.name?.trim()) throw new ToolError('An activity entry needs the activity’s name.');
      const activity = match(s.activities, i.name);
      const entry: Entry = { ...base, time: start, type: 'activity', activity, minutes: i.minutes ?? null, effort: i.effort ?? null };
      return { entry, line: `Activity · ${at(start)}\n${activity}${i.minutes ? `, ${fmtMinutes(i.minutes)}` : ''}${i.effort ? `, ${i.effort}` : ''}${noteLine}`, remember: () => rememberChip('activities', activity) };
    }
    case 'meal': {
      const tags = (i.tags ?? []).map((x: string) => match(s.mealTags, x));
      if (!tags.length && !note) throw new ToolError('A meal entry needs tags or a note saying what they had.');
      const entry: Entry = { ...base, type: 'meal', tags, photoId: null };
      return { entry, line: `Food & drink · ${at(entry.time)}\n${[tags.join(', '), note].filter(Boolean).join(': ')}`, remember: () => tags.forEach((x: string) => rememberChip('mealTags', x)) };
    }
    case 'day': {
      const date = i.date ?? dayKey(now);
      if (fromDayKey(date) > now) throw new ToolError(`${date} hasn't happened yet.`);
      // One Sleep & Day entry per date: fill in the existing one rather than add a second.
      const old = entries.value.find((e): e is DayEntry => e.type === 'day' && e.date === date);
      const entry: DayEntry = {
        ...(old ?? { ...base, type: 'day', date, sleepHours: null, sleepQuality: null, stress: null, exertion: null }),
        ...(i.sleep_hours != null ? { sleepHours: i.sleep_hours } : {}),
        ...(i.sleep_quality ? { sleepQuality: i.sleep_quality } : {}),
        ...(i.stress != null ? { stress: i.stress } : {}),
        ...(i.unusual_exertion != null ? { exertion: i.unusual_exertion } : {}),
        ...(note ? { note: old?.note ? `${old.note}\n${note}` : note } : {}),
        time: fromDayKey(date) + 12 * 3600_000,
      };
      const parts = [entry.sleepHours != null ? `Slept ${entry.sleepHours} h` : '', entry.sleepQuality ? `${{ poor: 'Poor', ok: 'Okay', good: 'Good' }[entry.sleepQuality]} sleep` : '', entry.stress != null ? `Stress ${entry.stress}/10` : '', entry.exertion ? 'Unusual exertion' : ''];
      return { entry, old, line: `Sleep & day · ${fmtDayRelative(entry.time)}${old ? ' (updating)' : ''}\n${parts.filter(Boolean).join(' · ') || 'Nothing new'}${noteLine}`, remember: () => {} };
    }
  }
}

const getLogOptions: AiTool = {
  name: 'get_log_options',
  description: 'Call before log_entries. The names this person logs with: body areas (and the ones they usually mark), symptoms, their saved medications with usual doses, exercises, postures, activities, meal tags, side effects, plus the current time and any check-in that is due.',
  input: { type: 'object', properties: {} },
  label: () => 'What you log',
  async run() {
    const s = settings.value;
    const now = Date.now();
    const pains = entries.value.filter((e): e is PainEntry => e.type === 'pain' && e.time > now - 30 * DAY);
    const counts = new Map<string, number>();
    for (const p of pains) for (const name of regionNames(Object.keys(p.regions))) counts.set(name, (counts.get(name) ?? 0) + 1);
    const recent = [...entries.value].filter((e) => e.type === 'pain' && Object.keys(e.regions).length).sort((a, b) => b.time - a.time)[0] as PainEntry | undefined;
    return {
      now: `${dayKey(now)} ${fmtTime(now)} ${new Date(now).toLocaleDateString('en', { weekday: 'short' })}`,
      check_in_due: s.checkinTimes.find((x) => slotStatus(x, entries.value.filter((e): e is PainEntry => e.type === 'pain'), now) === 'due') ?? null,
      areas: [...AREAS.keys()].map((k) => regionLabel(AREAS.get(k)!)),
      areas_usually_marked_last_30_days: Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]).slice(0, 12)),
      last_pain_entry: recent ? { when: at(recent.time), areas: Object.fromEntries(Object.keys(recent.regions).map((id) => [regionLabel(id), recent.levels?.[id] ?? null])) } : null,
      symptoms: s.symptoms,
      medications: s.treatments.filter((t) => t.kind === 'medication').map((t) => (t.dose ? `${t.name} (${t.dose})` : t.name)),
      other_treatments: s.treatments.filter((t) => t.kind !== 'medication').map((t) => `${t.name} (${t.kind})`),
      exercises: s.exercises,
      postures: Object.fromEntries(s.postures.map((p) => [p, POSTURES[p]?.label ?? p])),
      activities: s.activities,
      meal_tags: s.mealTags,
      side_effects: s.sideEffects,
    };
  },
};

const logEntries: AiTool = {
  name: 'log_entries',
  description: 'Saves entries to the diary exactly as if the person had filled in the Check In screen or a Log form. They see a card listing every entry and tap Save first. Put everything from one message in one call (they are saved together). Only include what they told you or what you reasonably assumed; leave optional fields out rather than guess.',
  action: true,
  input: { type: 'object', required: ['entries'], properties: { entries: { type: 'array', maxItems: 12, items: ITEM } } },
  label: (i) => `Log ${i.entries.length} ${i.entries.length === 1 ? 'entry' : 'entries'}`,
  async run(i, ctx) {
    if (!i.entries.length) throw new ToolError('`entries` is empty.');
    const now = Date.now();
    const due = settings.value.checkinTimes.find((x) => slotStatus(x, entries.value.filter((e): e is PainEntry => e.type === 'pain'), now) === 'due') ?? null;
    const errors: string[] = [];
    const planned: Planned[] = [];
    i.entries.forEach((x: any, k: number) => {
      try { planned.push(plan(x, now, due)); } catch (e) {
        if (!(e instanceof ToolError)) throw e;
        errors.push(`entries[${k}] (${x.type}): ${e.message}`);
      }
    });
    if (errors.length) throw new ToolError(errors.join('\n'));
    // Only one pain entry per save answers a due check-in.
    let slotUsed = false;
    for (const p of planned) if (p.entry.type === 'pain' && p.entry.slot) { if (slotUsed) p.entry.slot = null; slotUsed = true; }

    const n = planned.length;
    const ok = await ctx.approve({
      title: n === 1 ? 'Save this to your diary' : `Save these ${n} entries to your diary`,
      items: planned.map((p) => item(p.line)),
      allow: 'Save',
      allowed: 'Saved',
    });
    if (!ok) return { done: false, reason: 'The person chose not to save. Ask what to change.' };
    const group = n > 1 ? uid() : undefined;
    for (const p of planned) {
      p.remember();
      await saveEntry({ ...p.entry, ...(p.entry.type === 'day' ? {} : { group }) } as Entry);
    }
    navigator.vibrate?.(12);
    // Undo removes new entries and puts an updated Sleep & Day entry back as it was.
    showToast('Saved', { label: 'Undo', run: () => planned.forEach((p) => (p.old ? saveEntry(p.old) : removeEntry(p.entry.id))) });
    return { done: true, saved: n };
  },
};

export function logTools(): AiTool[] {
  return [getLogOptions, logEntries];
}
