import { entries, settings, uid, updateSettings } from '../lib/store';
import { DAY, HOUR, dayKey, fmtDay, fromDayKey, startOfDay } from '../lib/time';
import { buildFactors, inRange, mean, treatmentStats } from '../lib/analysis';
import { HELPED_LABELS, IMPACTS, POSTURES } from '../lib/catalog';
import { REGION_LABELS, SENSATION_LABEL, regionLabel } from '../components/BodyMap';
import type { Entry, PainEntry } from '../lib/types';
import { DATE, type ObjectSchema } from './schema';
import { formTools } from './forms';
import { logTools } from './logging';

/*
 * What the assistant can do. Read tools look things up; action tools change something or make a
 * file (logging entries is in logging.ts), and only run after the person taps Allow. Every input is validated before run() (see
 * schema.ts), and results are trimmed to what's needed: no photos, no name or surgery date, and
 * notes only when "Share my notes" is on.
 */

export interface Attachment { kind: 'pdf'; file: File; label: string }

export interface ToolContext {
  notes: boolean;
  /** Shows an Allow / Don't card in the chat and waits for the answer. `items` lists things one by one; `allow` renames the button, `allowed` the result. */
  approve: (req: { title: string; detail?: string; items?: { title: string; body: string }[]; allow?: string; allowed?: string }) => Promise<boolean>;
  attach: (a: Attachment) => void;
}

export interface AiTool {
  name: string;
  description: string;
  input: ObjectSchema;
  /** Changes data or creates something: needs the person's OK each time. */
  action?: boolean;
  /** Short chip text for the chat, e.g. "Pain entries, 1–14 Nov". */
  label: (input: any) => string;
  run: (input: any, ctx: ToolContext) => Promise<unknown>;
}

/** A problem the model can fix (bad dates, unknown names); sent back to it as an error result. */
export class ToolError extends Error {}

/* ---------- helpers ---------- */

const RANGE_PROPS = {
  from: { ...DATE, description: 'First day to include, YYYY-MM-DD. Defaults to 30 days before `to`.' },
  to: { ...DATE, description: 'Last day to include, YYYY-MM-DD. Defaults to today.' },
};

function range(i: { from?: string; to?: string }, days = 30) {
  const to = i.to ? fromDayKey(i.to) + DAY : startOfDay(Date.now()) + DAY;
  const from = i.from ? fromDayKey(i.from) : to - days * DAY;
  if (!(from < to)) throw new ToolError('`from` must be on or before `to`.');
  if (to - from > 731 * DAY) throw new ToolError('Ask for at most two years at a time.');
  return { from, to };
}

const short = (t: number) => fmtDay(t, { day: 'numeric', month: 'short' });
const rangeLabel = (i: { from?: string; to?: string }) => { const r = range(i); return `${short(r.from)}–${short(r.to - 1)}`; };
const when = (t: number) => {
  const d = new Date(t);
  return `${dayKey(t)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${d.toLocaleDateString('en', { weekday: 'short' })}`;
};
const round1 = (n: number) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);

/** Drops empty fields so results stay small. */
function clean<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v as object).length))) as Partial<T>;
}

const IMPACT_LABEL = Object.fromEntries(IMPACTS.map((x) => [x.id, x.label]));

/** One diary entry as the assistant sees it. */
function compact(e: Entry, notes: boolean) {
  const base = { when: when(e.time), type: e.type, logged_with: e.group ? e.group.slice(-5) : undefined, note: notes ? e.note?.trim() : undefined };
  switch (e.type) {
    case 'pain': {
      const areas = Object.fromEntries(Object.keys(e.regions).map((id) => [regionLabel(id), clean({
        level: e.levels?.[id] ?? null,
        feels: (e.kinds?.[id] ?? [e.regions[id]]).filter((k) => k && k !== 'pain').map((k) => SENSATION_LABEL[k]),
      })]));
      const symptoms = Object.fromEntries(e.symptoms.map((s) => [s, e.symptomLevels?.[s] ?? null]));
      const impacts = Object.fromEntries(Object.entries(e.impacts).filter(([, v]) => v).map(([k, v]) => [IMPACT_LABEL[k] ?? k, v === 2 ? 'a lot' : 'some']));
      return clean({
        ...base, type: Object.keys(e.regions).length || e.intensity != null ? 'pain' : 'symptom',
        overall: e.intensity, areas, symptoms, lasted: e.duration, got_in_the_way_of: impacts,
        described_as: e.qualities, doing: e.postures.map((p) => POSTURES[p]?.label ?? p).concat(e.activities),
        pain_changed: e.mode === 'change' ? e.trend ?? true : undefined,
      });
    }
    case 'posture': return clean({ ...base, posture: POSTURES[e.posture]?.label ?? e.posture, minutes: e.minutes, breaks: e.breaks });
    case 'activity': return clean({ ...base, activity: e.activity, minutes: e.minutes, effort: e.effort });
    case 'meal': return clean({ ...base, tags: e.tags });
    case 'treatment': return clean({
      ...base, kind: e.kind, name: e.name, dose: e.dose, minutes: e.minutes, hold_seconds: e.holdSeconds,
      helped: e.helped ? HELPED_LABELS[e.helped] : undefined, side_effects: e.sideEffects,
    });
    case 'day': return clean({ ...base, date: e.date, sleep_hours: e.sleepHours, sleep_quality: e.sleepQuality, stress: e.stress, unusual_exertion: e.exertion });
  }
}

/** A pain measure over time: overall, one area by name, or a symptom's strength. */
function series(measure: string, from: number, to: number) {
  const pains = inRange<PainEntry>(entries.value, from, to).filter((e) => e.type === 'pain');
  let pick: (e: PainEntry) => number | null | undefined;
  if (measure === 'overall') pick = (e) => e.intensity;
  else if (measure.startsWith('area:')) {
    const name = measure.slice(5).trim().toLowerCase();
    const ids = Object.entries(REGION_LABELS).filter(([, l]) => l.toLowerCase() === name).map(([id]) => id);
    if (!ids.length) throw new ToolError(`No area called "${measure.slice(5)}". Use an area name exactly as get_entries shows it.`);
    pick = (e) => { const vs = ids.map((id) => e.levels?.[id]).filter((v): v is number => v != null); return vs.length ? Math.max(...vs) : null; };
  } else if (measure.startsWith('symptom:')) {
    const name = measure.slice(8).trim().toLowerCase();
    pick = (e) => { const k = Object.keys(e.symptomLevels ?? {}).find((x) => x.toLowerCase() === name); return k ? e.symptomLevels![k] : null; };
  } else throw new ToolError('`measure` must be "overall", "area:<name>" or "symptom:<name>".');
  return pains.map((e) => ({ t: e.time, v: pick(e) })).filter((r): r is { t: number; v: number } => r.v != null).sort((a, b) => a.t - b.t);
}

function stats(vs: number[]) {
  const m = mean(vs);
  const sd = vs.length > 1 ? Math.sqrt(vs.reduce((a, v) => a + (v - m) ** 2, 0) / (vs.length - 1)) : NaN;
  return { n: vs.length, mean: round1(m), sd: round1(sd), _m: m, _sd: sd };
}

/* ---------- read tools ---------- */

const getOverview: AiTool = {
  name: 'get_overview',
  description: 'Start here. What the diary holds: date span, counts by entry type, which areas, symptoms, medications, postures and exercises have been logged, check-in times, appointments, open questions for the clinician, and whether notes are shared.',
  input: { type: 'object', properties: {} },
  label: () => 'Overview',
  async run(_i, ctx) {
    const all = entries.value;
    const s = settings.value;
    const pains = all.filter((e): e is PainEntry => e.type === 'pain');
    const count = (xs: string[]) => Object.fromEntries([...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]));
    return clean({
      today: when(Date.now()),
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      first_entry: all.length ? dayKey(Math.min(...all.map((e) => e.time))) : null,
      last_entry: all.length ? dayKey(Math.max(...all.map((e) => e.time))) : null,
      entries_by_type: count(all.map((e) => e.type)),
      pain_readings_with_a_score: pains.filter((p) => p.intensity != null).length,
      areas_marked: count(pains.flatMap((p) => Object.keys(p.regions).map(regionLabel))),
      symptoms_logged: count(pains.flatMap((p) => p.symptoms)),
      treatments_logged: count(all.flatMap((e) => (e.type === 'treatment' ? [`${e.name} (${e.kind})`] : []))),
      postures_logged: count(all.flatMap((e) => (e.type === 'posture' ? [POSTURES[e.posture]?.label ?? e.posture] : []))),
      weeks_since_surgery: s.surgeryDate ? Math.floor((Date.now() - fromDayKey(s.surgeryDate)) / (7 * DAY)) : null,
      last_appointment: s.lastAppointment, next_appointment: s.nextAppointment,
      check_in_times: s.checkinTimes,
      open_questions_for_clinician: s.questions.filter((q) => !q.done).map((q) => q.text),
      notes_shared: ctx.notes,
    });
  },
};

const ENTRY_TYPES = ['pain', 'symptom', 'posture', 'activity', 'meal', 'treatment', 'day'];

const getEntries: AiTool = {
  name: 'get_entries',
  description: 'Diary entries in a date range, oldest first, one compact object each. Pain entries give an overall 0–10 score, each marked area with its own level and what it felt like, symptoms with strength, how long it lasted and what it got in the way of. Entries saved together share `logged_with`. Use this to look for patterns yourself: time of day, sequences, lags, combinations, dose timing.',
  input: {
    type: 'object',
    properties: {
      ...RANGE_PROPS,
      types: { type: 'array', items: { type: 'string', enum: ENTRY_TYPES }, maxItems: 7, description: 'Only these entry types. Default: all.' },
      limit: { type: 'integer', minimum: 1, maximum: 500, description: 'Most entries to return (default 300). If there are more, the most recent are kept.' },
    },
  },
  label: (i) => `${i.types?.length ? i.types.join(', ') : 'Entries'}, ${rangeLabel(i)}`,
  async run(i, ctx) {
    const { from, to } = range(i);
    let list = inRange(entries.value, from, to).sort((a, b) => a.time - b.time).map((e) => compact(e, ctx.notes));
    if (i.types?.length) list = list.filter((e) => i.types.includes(e.type));
    const limit = i.limit ?? 300;
    return { from: dayKey(from), to: dayKey(to - 1), total: list.length, truncated: list.length > limit, entries: list.slice(-limit) };
  },
};

const getDaily: AiTool = {
  name: 'get_daily_summary',
  description: 'One row per day: number of pain scores, their average, lowest and highest; strongest headache/migraine/other symptom; medications taken; minutes of logged postures and exercise; sleep and stress where recorded. Good for trends and day-to-day comparisons.',
  input: { type: 'object', properties: RANGE_PROPS },
  label: (i) => `Daily summary, ${rangeLabel(i)}`,
  async run(i) {
    const { from, to } = range(i);
    const list = inRange(entries.value, from, to);
    const days: unknown[] = [];
    for (let d = new Date(from); d.getTime() < to; d.setDate(d.getDate() + 1)) {
      const a = d.getTime(), b = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
      const es = list.filter((e) => e.time >= a && e.time < b);
      const pains = es.filter((e): e is PainEntry => e.type === 'pain');
      const vs = pains.map((p) => p.intensity).filter((v): v is number => v != null);
      const sym: Record<string, number> = {};
      for (const p of pains) for (const [k, v] of Object.entries(p.symptomLevels ?? {})) sym[k] = Math.max(sym[k] ?? 0, v);
      for (const p of pains) for (const k of p.symptoms) sym[k] ??= 0;
      const day = es.find((e) => e.type === 'day');
      days.push(clean({
        date: `${dayKey(a)} ${new Date(a).toLocaleDateString('en', { weekday: 'short' })}`,
        pain_scores: vs.length, average: round1(mean(vs)), lowest: vs.length ? Math.min(...vs) : null, highest: vs.length ? Math.max(...vs) : null,
        symptoms_strongest: Object.fromEntries(Object.entries(sym).map(([k, v]) => [k, v || 'logged'])),
        medications: es.flatMap((e) => (e.type === 'treatment' && e.kind === 'medication' ? [`${e.name}${e.dose ? ' ' + e.dose : ''} at ${when(e.time).slice(11, 16)}`] : [])),
        posture_minutes: es.reduce((n, e) => n + (e.type === 'posture' ? e.minutes ?? 0 : 0), 0) || null,
        exercise_minutes: es.reduce((n, e) => n + (e.type === 'treatment' && e.kind === 'exercises' ? e.minutes ?? 0 : e.type === 'activity' ? e.minutes ?? 0 : 0), 0) || null,
        sleep_hours: day?.type === 'day' ? day.sleepHours : null,
        stress: day?.type === 'day' ? day.stress : null,
      }));
    }
    return { days };
  },
};

const listFactors: AiTool = {
  name: 'list_factors',
  description: 'Things logged in a date range that pain can be compared against (postures, activities, food, treatments, sleep/stress days), with ids for compare_pain and how many times each was logged.',
  input: { type: 'object', properties: RANGE_PROPS },
  label: (i) => `Things logged, ${rangeLabel(i)}`,
  async run(i) {
    const { from, to } = range(i);
    return { factors: buildFactors(entries.value, from, to).map((f) => ({ id: f.id, label: f.label, group: f.group, times_logged: f.times.length, whole_day: f.daily || undefined, caution: f.caution })) };
  },
};

const comparePain: AiTool = {
  name: 'compare_pain',
  description: 'Compares a pain measure around times a factor was logged with all other readings, over any time window, with no minimum number of readings. Returns counts, averages, the difference and a rough 95% interval so you can judge how much to trust it. Whole-day factors (sleep, stress) compare that whole day. Run it for several windows or measures when that helps.',
  input: {
    type: 'object',
    required: ['factor'],
    properties: {
      factor: { type: 'string', maxLength: 200, description: 'An id from list_factors.' },
      ...RANGE_PROPS,
      start_hours: { type: 'number', minimum: -72, maximum: 72, description: 'Window start relative to each time the factor was logged, in hours (negative = before). Default 0.' },
      end_hours: { type: 'number', minimum: -72, maximum: 96, description: 'Window end in hours. Default 6.' },
      measure: { type: 'string', maxLength: 120, description: '"overall" (default), "area:<area name>" or "symptom:<symptom name>".' },
    },
  },
  label: (i) => `Compare: ${i.factor.replace(/^[a-z-]+:/, '')}${i.measure && i.measure !== 'overall' ? `, ${i.measure.replace(/^\w+:/, '')}` : ''}`,
  async run(i) {
    const { from, to } = range(i, 90);
    const f = buildFactors(entries.value, from - 3 * DAY, to).find((x) => x.id === i.factor);
    if (!f) throw new ToolError(`No factor "${i.factor}" in that range. Call list_factors for the ids.`);
    const a = i.start_hours ?? 0, b = i.end_hours ?? 6;
    if (!(a < b)) throw new ToolError('`start_hours` must be before `end_hours`.');
    const windows = f.times.map((t) => (f.daily ? [t, t + DAY] : [t + a * HOUR, t + b * HOUR]));
    const rs = series(i.measure ?? 'overall', from, to);
    const near = rs.filter((r) => windows.some(([x, y]) => r.t >= x && r.t <= y)).map((r) => r.v);
    const other = rs.filter((r) => !windows.some(([x, y]) => r.t >= x && r.t <= y)).map((r) => r.v);
    const n = stats(near), o = stats(other);
    const diff = n._m - o._m;
    const se = Math.sqrt(n._sd ** 2 / n.n + o._sd ** 2 / o.n);
    return clean({
      factor: f.label, measure: i.measure ?? 'overall', window: f.daily ? 'same day' : `${a} h to ${b} h`,
      times_logged: f.times.filter((t) => t >= from && t < to).length,
      near: { readings: n.n, average: n.mean, sd: n.sd }, other: { readings: o.n, average: o.mean, sd: o.sd },
      difference: round1(diff),
      rough_95_interval: Number.isFinite(se) && n.n > 1 && o.n > 1 ? [round1(diff - 1.96 * se), round1(diff + 1.96 * se)] : null,
      caution: f.caution,
    });
  },
};

const getTreatments: AiTool = {
  name: 'get_treatment_summary',
  description: 'Each treatment or medication in a range: times taken, doses, how often it was marked as helping, side effects, and average pain in the 3 h before vs 0.5–4 h after (only where both exist).',
  input: { type: 'object', properties: RANGE_PROPS },
  label: (i) => `Treatments, ${rangeLabel(i)}`,
  async run(i) {
    const { from, to } = range(i);
    return {
      treatments: treatmentStats(entries.value, from, to).map((t) => clean({
        name: t.name, kind: t.kind, times: t.count, doses: t.doses,
        marked_helped: Object.fromEntries(Object.entries(t.helped).map(([k, v]) => [HELPED_LABELS[k] ?? k, v])),
        side_effects: Object.fromEntries(t.sideEffects),
        pain_before_after: t.pairs ? { pairs: t.pairs, before: round1(t.before), after: round1(t.after) } : null,
      })),
    };
  },
};

/* ---------- action tools (need the person's OK) ---------- */

const createReport: AiTool = {
  name: 'create_report',
  description: 'Makes the clinician PDF for a date range (the same report as the Report tab: charts, body map, treatments, questions) with your written summary added near the top, and optionally adds questions to the "questions to ask" list. The person sees your summary and questions and must tap Allow first. Only use it when they ask for a report or agree to one. Write the summary for a clinician: plain, factual, what changed and what occurred alongside pain, with numbers; no diagnosis and no causal claims.',
  action: true,
  input: {
    type: 'object',
    required: ['summary'],
    properties: {
      ...RANGE_PROPS,
      summary: { type: 'string', maxLength: 3000, description: 'Your summary paragraph(s) for the clinician. Plain text; blank lines between paragraphs.' },
      questions: { type: 'array', items: { type: 'string', maxLength: 300 }, maxItems: 6, description: 'Questions to add to the list for the clinician (optional).' },
      include_log: { type: 'boolean', description: 'Add the full entry log as an appendix. Default true.' },
      include_notes: { type: 'boolean', description: 'Include the person’s notes in the PDF. Default true.' },
    },
  },
  label: (i) => `Report, ${rangeLabel(i)}`,
  async run(i, ctx) {
    const { from, to } = range(i);
    const qs: string[] = (i.questions ?? []).map((q: string) => q.trim()).filter(Boolean);
    const ok = await ctx.approve({
      title: `Create a PDF report for ${short(from)}–${short(to - 1)}`,
      detail: [i.summary.trim(), qs.length ? `Questions to add:\n${qs.map((q) => `• ${q}`).join('\n')}` : ''].filter(Boolean).join('\n\n'),
    });
    if (!ok) return { done: false, reason: 'The person chose not to create it.' };
    if (qs.length) {
      const have = new Set(settings.value.questions.map((q) => q.text.toLowerCase()));
      await updateSettings({ questions: [...settings.value.questions, ...qs.filter((q) => !have.has(q.toLowerCase())).map((text) => ({ id: uid(), text, done: false }))] });
    }
    const { buildReport } = await import('../export/pdf');
    const file = await buildReport(entries.value, settings.value, {
      from, to, includeLog: i.include_log ?? true, includeNotes: i.include_notes ?? true, includeAssociations: true, aiSummary: i.summary.trim(),
    });
    ctx.attach({ kind: 'pdf', file, label: `Report, ${short(from)}–${short(to - 1)}` });
    return { done: true, file: file.name, questions_added: qs.length, note: 'A Share button is now under your message.' };
  },
};

const addQuestion: AiTool = {
  name: 'add_question',
  description: 'Adds a question to the person’s "questions to ask" list for their clinician. They must tap Allow first. Only use it when they ask for it or agree.',
  action: true,
  input: { type: 'object', required: ['text'], properties: { text: { type: 'string', maxLength: 300 } } },
  label: () => 'Add a question',
  async run(i, ctx) {
    const text = i.text.trim();
    if (!text) throw new ToolError('`text` is empty.');
    if (!(await ctx.approve({ title: 'Add a question for your clinician', detail: text }))) return { done: false, reason: 'The person chose not to add it.' };
    await updateSettings({ questions: [...settings.value.questions, { id: uid(), text, done: false }] });
    return { done: true };
  },
};

export function allTools(): AiTool[] {
  return [getOverview, getEntries, getDaily, listFactors, comparePain, getTreatments, ...logTools(), createReport, addQuestion, ...formTools()];
}

/** Finds a tool by name, forgiving letter case (models occasionally vary it). */
export function findTool(tools: AiTool[], name: string) {
  return tools.find((t) => t.name === name) ?? tools.find((t) => t.name.toLowerCase() === name.toLowerCase());
}
