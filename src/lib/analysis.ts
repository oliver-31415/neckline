import { POSTURES } from './catalog';
import { DAY, HOUR, dayKey, startOfDay } from './time';
import type { DayEntry, Entry, PainEntry, TreatmentEntry } from './types';

/*
 * Pattern helpers. Everything here describes co-occurrence in self-reported data.
 * Nothing here can establish cause, and the UI copy must say so.
 */

export interface Reading { t: number; v: number; e: PainEntry }

export function inRange<T extends Entry>(list: Entry[], from: number, to: number) {
  return list.filter((e) => e.time >= from && e.time < to) as T[];
}

export function readings(list: Entry[], from = -Infinity, to = Infinity): Reading[] {
  return list
    .filter((e): e is PainEntry => e.type === 'pain' && e.intensity != null && e.time >= from && e.time < to)
    .map((e) => ({ t: e.time, v: e.intensity as number, e }))
    .sort((a, b) => a.t - b.t);
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
export const fmt1 = (n: number) => (isNaN(n) ? '–' : n.toFixed(1).replace(/\.0$/, ''));

/* ---------------- daily series ---------------- */
export interface DayStat { day: number; mean: number; min: number; max: number; n: number }
export function daily(rs: Reading[], from: number, to: number): DayStat[] {
  const out: DayStat[] = [];
  const cur = new Date(startOfDay(from));
  while (cur.getTime() < to) {
    const dayStart = cur.getTime();
    cur.setDate(cur.getDate() + 1); // calendar step, DST-safe
    const vs = rs.filter((r) => r.t >= dayStart && r.t < cur.getTime()).map((r) => r.v);
    out.push({ day: dayStart, n: vs.length, mean: mean(vs), min: vs.length ? Math.min(...vs) : NaN, max: vs.length ? Math.max(...vs) : NaN });
  }
  return out;
}

/* ---------------- summary ---------------- */
export function summary(list: Entry[], from: number, to: number) {
  const rs = readings(list, from, to);
  const vs = rs.map((r) => r.v);
  const pains = inRange<PainEntry>(list, from, to).filter((e) => e.type === 'pain');
  const days = new Set(inRange(list, from, to).map((e) => dayKey(e.time)));
  const buckets = [
    { label: 'Night', a: 0, b: 6 }, { label: 'Morning', a: 6, b: 12 }, { label: 'Afternoon', a: 12, b: 18 }, { label: 'Evening', a: 18, b: 24 },
  ].map((b) => {
    const xs = rs.filter((r) => { const h = new Date(r.t).getHours(); return h >= b.a && h < b.b; }).map((r) => r.v);
    return { ...b, mean: mean(xs), n: xs.length };
  });
  return {
    readings: rs,
    count: pains.length,
    notSure: pains.filter((p) => p.intensity == null).length,
    changes: pains.filter((p) => p.mode === 'change').length,
    daysLogged: days.size,
    mean: mean(vs),
    min: vs.length ? Math.min(...vs) : NaN,
    max: vs.length ? Math.max(...vs) : NaN,
    severe: vs.filter((v) => v >= 7).length,
    buckets,
  };
}

export function countBy(list: string[][]) {
  const m = new Map<string, number>();
  for (const xs of list) for (const x of new Set(xs)) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function regionFrequency(pains: PainEntry[]) {
  const withMap = pains.filter((p) => Object.keys(p.regions).length > 0);
  const counts = countBy(withMap.map((p) => Object.keys(p.regions)));
  const sensations: Record<string, Record<string, number>> = {};
  for (const p of withMap) for (const [r, s] of Object.entries(p.regions)) {
    sensations[r] ??= {};
    sensations[r][s] = (sensations[r][s] ?? 0) + 1;
  }
  return { total: withMap.length, counts, sensations };
}

export function impactFrequency(pains: PainEntry[]) {
  const out: Record<string, { some: number; lot: number; answered: number }> = {};
  for (const p of pains) for (const [k, v] of Object.entries(p.impacts)) {
    if (v == null) continue;
    out[k] ??= { some: 0, lot: 0, answered: 0 };
    out[k].answered++;
    if (v === 1) out[k].some++;
    if (v === 2) out[k].lot++;
  }
  return out;
}

/* ---------------- factors ---------------- */
export interface Factor {
  id: string;
  label: string;
  group: 'Posture' | 'Activity' | 'Food' | 'Treatment' | 'Background';
  daily: boolean;
  times: number[];
  caution?: string;
}

export const WINDOWS = [
  { id: 'same', label: 'Same time', long: 'within an hour either side', a: -1, b: 1 },
  { id: '3h', label: '0–3 h after', long: 'in the 3 hours after', a: 0, b: 3 },
  { id: '6h', label: '0–6 h after', long: 'in the 6 hours after', a: 0, b: 6 },
  { id: '24h', label: '0–24 h after', long: 'in the 24 hours after', a: 0, b: 24 },
  { id: 'next', label: 'Next day', long: 'on the following day', a: 24, b: 48 },
] as const;
export type WindowId = (typeof WINDOWS)[number]['id'];

const TREATMENT_CAUTION = 'People usually take treatments when pain is already high, so this comparison is easily misleading. The treatment summary compares pain before and after instead.';

export function buildFactors(list: Entry[], from: number, to: number): Factor[] {
  const m = new Map<string, Factor>();
  const add = (id: string, label: string, group: Factor['group'], t: number, daily = false, caution?: string) => {
    if (!m.has(id)) m.set(id, { id, label, group, daily, times: [], caution });
    m.get(id)!.times.push(t);
  };
  const lookback = from - 2 * DAY; // let earlier exposures count toward windows
  for (const e of list) {
    if (e.time < lookback || e.time >= to) continue;
    switch (e.type) {
      case 'posture': {
        const name = POSTURES[e.posture]?.label ?? e.posture;
        add('posture:' + e.posture, name, 'Posture', e.time);
        if ((e.minutes ?? 0) >= 45) add('posture-long:' + e.posture, `${name}, 45 min or more`, 'Posture', e.time);
        if (e.breaks === 'no') add('posture-nobreak', 'Long posture without breaks', 'Posture', e.time);
        break;
      }
      case 'pain':
        for (const p of e.postures) add('posture:' + p, POSTURES[p]?.label ?? p, 'Posture', e.time);
        for (const a of e.activities) add('activity:' + a, a, 'Activity', e.time);
        break;
      case 'activity':
        add('activity:' + e.activity, e.activity, 'Activity', e.time);
        if (e.effort === 'hard') add('activity-hard', 'Hard physical activity', 'Activity', e.time);
        break;
      case 'meal':
        add('meal', 'Any meal or drink', 'Food', e.time);
        for (const t of e.tags) add('meal:' + t.toLowerCase(), `Food: ${t}`, 'Food', e.time);
        break;
      case 'treatment':
        add('treatment:' + e.name.toLowerCase(), e.name, 'Treatment', e.time, false, TREATMENT_CAUTION);
        break;
      case 'day': {
        const d = startOfDay(e.time);
        if (e.sleepHours != null && e.sleepHours < 6) add('day:shortsleep', 'Under 6 h sleep', 'Background', d, true);
        if (e.sleepQuality === 'poor') add('day:poorsleep', 'Poor sleep', 'Background', d, true);
        if (e.stress != null && e.stress >= 7) add('day:stress', 'High stress day', 'Background', d, true);
        if (e.exertion) add('day:exertion', 'Unusual exertion', 'Background', d, true);
        break;
      }
    }
  }
  return [...m.values()].sort((a, b) => b.times.length - a.times.length);
}

export interface Comparison {
  factor: Factor;
  exposed: Reading[];
  other: Reading[];
  occurrences: number;
  meanE: number;
  meanO: number;
  diff: number;
  verdict: 'insufficient' | 'none' | 'hint' | 'possible';
}

export function compare(f: Factor, rs: Reading[], windowId: WindowId): Comparison {
  const w = WINDOWS.find((x) => x.id === windowId)!;
  const intervals = f.times.map((t) => {
    if (f.daily) {
      const start = windowId === 'next' ? startOfDay(t + DAY + 2 * HOUR) : t;
      return [start, start + DAY] as const;
    }
    return [t + w.a * HOUR, t + w.b * HOUR] as const;
  });
  const exposed: Reading[] = [];
  const other: Reading[] = [];
  for (const r of rs) (intervals.some(([a, b]) => r.t >= a && r.t <= b) ? exposed : other).push(r);
  const meanE = mean(exposed.map((r) => r.v));
  const meanO = mean(other.map((r) => r.v));
  const diff = meanE - meanO;
  const occurrences = f.times.filter((t) => rs.length && t >= rs[0].t - 2 * DAY).length;
  let verdict: Comparison['verdict'];
  if (exposed.length < 3 || other.length < 3) verdict = 'insufficient';
  else if (Math.abs(diff) < 0.75) verdict = 'none';
  else if (exposed.length >= 8 && other.length >= 8 && occurrences >= 4) verdict = 'possible';
  else verdict = 'hint';
  return { factor: f, exposed, other, occurrences, meanE, meanO, diff, verdict };
}

export const VERDICT_LABEL: Record<Comparison['verdict'], string> = {
  insufficient: 'Not enough entries yet',
  none: 'No clear difference',
  hint: 'Early hint · few entries',
  possible: 'Possible association',
};

export function describe(c: Comparison, windowId: WindowId) {
  const w = WINDOWS.find((x) => x.id === windowId)!;
  const when = c.factor.daily ? (windowId === 'next' ? 'on the day after' : 'on days with') : w.long;
  if (c.verdict === 'insufficient') {
    return `${c.exposed.length} pain reading${c.exposed.length === 1 ? '' : 's'} fall ${when} “${c.factor.label}”. At least 3 are needed on each side before comparing.`;
  }
  const dir = c.diff > 0 ? 'higher' : 'lower';
  const diffTxt = Math.abs(c.diff) < 0.75 ? 'about the same as' : `${fmt1(Math.abs(c.diff))} points ${dir} than`;
  return `Pain readings ${when} “${c.factor.label}” averaged ${fmt1(c.meanE)}/10 (${c.exposed.length} readings, ${c.occurrences} times logged). That’s ${diffTxt} other readings, which averaged ${fmt1(c.meanO)}/10 (${c.other.length} readings).`;
}

/* ---------------- treatment response ---------------- */
export interface TreatmentStat {
  name: string;
  kind: string;
  count: number;
  doses: string[];
  helped: Record<string, number>;
  sideEffects: [string, number][];
  pairs: number;
  before: number;
  after: number;
}

export function treatmentStats(list: Entry[], from: number, to: number): TreatmentStat[] {
  const ts = inRange<TreatmentEntry>(list, from, to).filter((e) => e.type === 'treatment');
  const rs = readings(list);
  const groups = new Map<string, TreatmentEntry[]>();
  for (const t of ts) {
    const k = t.name.toLowerCase();
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  return [...groups.values()].map((g) => {
    const before: number[] = [];
    const after: number[] = [];
    for (const t of g) {
      const b = rs.filter((r) => r.t >= t.time - 3 * HOUR && r.t <= t.time).pop();
      const a = rs.filter((r) => r.t >= t.time + HOUR / 2 && r.t <= t.time + 4 * HOUR);
      if (b && a.length) { before.push(b.v); after.push(mean(a.map((r) => r.v))); }
    }
    const helped: Record<string, number> = {};
    for (const t of g) if (t.helped) helped[t.helped] = (helped[t.helped] ?? 0) + 1;
    return {
      name: g[0].name,
      kind: g[0].kind,
      count: g.length,
      doses: [...new Set(g.map((t) => t.dose).filter(Boolean) as string[])],
      helped,
      sideEffects: countBy(g.map((t) => t.sideEffects)),
      pairs: before.length,
      before: mean(before),
      after: mean(after),
    };
  }).sort((a, b) => b.count - a.count);
}

export function dayEntries(list: Entry[], from: number, to: number) {
  return inRange<DayEntry>(list, from, to).filter((e) => e.type === 'day');
}
