import { useState } from 'preact/hooks';
import { entries } from '../lib/store';
import { DAY, startOfDay } from '../lib/time';
import {
  WINDOWS, buildFactors, compare, countBy, daily, describe, fmt1, impactFrequency, inRange, regionFrequency, summary, treatmentStats,
  VERDICT_LABEL, type Comparison, type WindowId,
} from '../lib/analysis';
import { HELPED_LABELS, IMPACTS } from '../lib/catalog';
import type { PainEntry } from '../lib/types';
import { PainTrend, TrendLegend } from '../components/Charts';
import { BodyMap, regionLabel } from '../components/BodyMap';
import { Seg } from '../components/ui';
import { IconInfo, IconPatterns, IconSpark } from '../components/Icons';
import { settings } from '../lib/store';

export const RANGES = [
  { v: 7, label: '7 days' }, { v: 14, label: '14 days' }, { v: 30, label: '30 days' }, { v: 90, label: '90 days' },
];

export function rangeFor(days: number) {
  const to = startOfDay(Date.now()) + DAY;
  const d = new Date(to);
  d.setDate(d.getDate() - days);
  return { from: d.getTime(), to };
}

export function HBars({ rows, max, color = 'var(--accent)', unit = '' }: { rows: { label: string; value: number; text?: string }[]; max: number; color?: string; unit?: string }) {
  return (
    <div class="stack" style={{ gap: 8 }}>
      {rows.map((r) => (
        <div key={r.label} class="bar-pair" style={{ gridTemplateColumns: '120px 1fr 44px' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
          <div class="bar-track"><div class="bar-fill" style={{ width: `${Math.max(2, (r.value / (max || 1)) * 100)}%`, background: color }} /></div>
          <span class="num" style={{ textAlign: 'right' }}>{r.text ?? r.value + unit}</span>
        </div>
      ))}
    </div>
  );
}

export function Patterns() {
  const [days, setDays] = useState(30);
  const [win, setWin] = useState<WindowId>('3h');
  const [group, setGroup] = useState<string>('All');
  const [showAll, setShowAll] = useState(false);
  const all = entries.value;
  const { from, to } = rangeFor(days);
  const sum = summary(all, from, to);
  const ds = daily(sum.readings, from, to);
  const pains = inRange<PainEntry>(all, from, to).filter((e) => e.type === 'pain');
  const regions = regionFrequency(pains);
  const heat = Object.fromEntries(regions.counts.map(([r, n]) => [r, n / (regions.total || 1)]));
  const factors = buildFactors(all, from, to);
  const order = { possible: 0, hint: 1, none: 2, insufficient: 3 };
  const comps = factors
    .filter((f) => group === 'All' || f.group === group)
    .map((f) => compare(f, sum.readings, win))
    .sort((a, b) => order[a.verdict] - order[b.verdict] || Math.abs(b.diff || 0) - Math.abs(a.diff || 0));
  const treatments = treatmentStats(all, from, to);
  const qualities = countBy(pains.map((p) => p.qualities));
  const symptoms = countBy(pains.map((p) => p.symptoms));
  const impacts = impactFrequency(pains);
  const groups = ['All', ...new Set(factors.map((f) => f.group))];

  if (all.length === 0) {
    return (
      <div class="screen">
        <header class="screen-head"><div><div class="eyebrow">Insights</div><h1>Patterns</h1></div></header>
        <div class="empty"><IconPatterns /><div>Once you’ve logged for a few days, this page shows how your pain changes and what tends to happen alongside it.</div></div>
      </div>
    );
  }

  return (
    <div class="screen">
      <header class="screen-head"><div><div class="eyebrow">Insights</div><h1>Patterns</h1></div></header>
      <Seg options={RANGES} value={days} onChange={(v) => setDays(v ?? days)} />

      <div class="notice">
        <IconInfo />
        <div>These patterns show what <b>occurred alongside</b> your pain, not what caused it. Treat them as questions for your clinician.</div>
      </div>

      <div class="stat-tiles">
        <div class="stat"><div class="label">Average</div><div class="value">{fmt1(sum.mean)}<small>/10</small></div></div>
        <div class="stat"><div class="label">Range</div><div class="value">{isNaN(sum.min) ? '–' : `${sum.min}–${sum.max}`}</div></div>
        <div class="stat"><div class="label">Readings</div><div class="value">{sum.readings.length}<small>{sum.daysLogged}d</small></div></div>
      </div>

      <section class="card">
        <div class="card-head"><h2>Pain over time</h2><span class="small muted">{sum.changes} changes logged</span></div>
        <PainTrend days={ds} rs={sum.readings} from={from} to={to} />
        <div style={{ marginTop: 10 }}><TrendLegend /></div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Time of day</h2><span class="small muted">average pain</span></div>
        <HBars max={10} color="var(--pain)" rows={sum.buckets.map((b) => ({ label: `${b.label} (${b.n})`, value: isNaN(b.mean) ? 0 : b.mean, text: fmt1(b.mean) }))} />
      </section>

      <section class="card">
        <div class="card-head"><h2>Where it shows up</h2><span class="small muted">{regions.total} mapped entries</span></div>
        {regions.total ? (
          <>
            <BodyMap heat={heat} incision={settings.value.incision} compact />
            <HBars max={100} color="var(--pain)" rows={regions.counts.slice(0, 6).map(([r, n]) => ({ label: regionLabel(r), value: (n / regions.total) * 100, text: `${Math.round((n / regions.total) * 100)}%` }))} />
          </>
        ) : <p class="small muted">Mark areas on the body map during check-ins to see this.</p>}
      </section>

      <section class="card">
        <div class="card-head"><h2>Possible associations</h2></div>
        <p class="small muted" style={{ marginBottom: 12 }}>Compares pain readings near each factor with your other readings. Effects can be delayed, so try different time windows.</p>
        <div class="when-row" style={{ marginBottom: 10 }}>
          {WINDOWS.map((w) => <button key={w.id} class={'chip' + (win === w.id ? ' on' : '')} onClick={() => setWin(w.id)}>{w.label}</button>)}
        </div>
        {groups.length > 2 && (
          <div class="when-row" style={{ marginBottom: 14 }}>
            {groups.map((g) => <button key={g} class={'chip' + (group === g ? ' on' : '')} style={{ minHeight: 32, padding: '4px 12px', fontSize: 14 }} onClick={() => setGroup(g)}>{g}</button>)}
          </div>
        )}
        {comps.length === 0 && <p class="small muted">Log posture, activities, food, treatments or sleep to compare them with your pain.</p>}
        {(showAll ? comps : comps.slice(0, 6)).map((c) => <Assoc key={c.factor.id} c={c} win={win} />)}
        {comps.length > 6 && <button class="btn wide sm" style={{ marginTop: 10 }} onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${comps.length}`}</button>}
      </section>

      {treatments.length > 0 && (
        <section class="card">
          <div class="card-head"><h2>Treatments</h2></div>
          <div class="stack" style={{ gap: 14 }}>
            {treatments.map((t) => (
              <div key={t.name} class="stack" style={{ gap: 6 }}>
                <div class="row between"><b>{t.name}</b><span class="small muted">{t.count}× {t.doses.length ? '· ' + t.doses.join(', ') : ''}</span></div>
                {t.pairs > 0 ? (
                  <div class="small">Pain {fmt1(t.before)} before → <b>{fmt1(t.after)}</b> within 0.5–4 h after <span class="muted">({t.pairs} time{t.pairs === 1 ? '' : 's'} with readings on both sides)</span></div>
                ) : <div class="small muted">Log pain before and a few hours after to compare.</div>}
                {Object.keys(t.helped).length > 0 && (
                  <div class="chips">
                    {Object.entries(t.helped).map(([h, n]) => <span key={h} class="badge">{HELPED_LABELS[h]} · {n}</span>)}
                  </div>
                )}
                {t.sideEffects.length > 0 && <div class="small muted">Side effects noted: {t.sideEffects.map(([s, n]) => `${s.toLowerCase()} (${n})`).join(', ')}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {(qualities.length > 0 || symptoms.length > 0) && (
        <section class="card">
          <div class="card-head"><h2>How it feels</h2><span class="small muted">share of check-ins</span></div>
          <HBars max={100} rows={qualities.slice(0, 6).map(([q, n]) => ({ label: q, value: (n / pains.length) * 100, text: `${Math.round((n / pains.length) * 100)}%` }))} />
          {symptoms.length > 0 && (
            <>
              <div class="eyebrow" style={{ margin: '16px 0 8px' }}>Other symptoms</div>
              <HBars max={100} color="var(--tingling)" rows={symptoms.slice(0, 6).map(([q, n]) => ({ label: q, value: (n / pains.length) * 100, text: `${Math.round((n / pains.length) * 100)}%` }))} />
            </>
          )}
        </section>
      )}

      {Object.keys(impacts).length > 0 && (
        <section class="card">
          <div class="card-head"><h2>Effect on daily life</h2><span class="small muted">some or a lot</span></div>
          <HBars max={100} color="var(--posture)" rows={IMPACTS.filter((im) => impacts[im.id]).map((im) => {
            const x = impacts[im.id];
            const pct = ((x.some + x.lot) / x.answered) * 100;
            return { label: im.label, value: pct, text: `${Math.round(pct)}%` };
          })} />
        </section>
      )}

      <section class="card flat row" style={{ alignItems: 'flex-start' }}>
        <span style={{ width: 22, height: 22, color: 'var(--muted)', flex: 'none' }}><IconSpark /></span>
        <div class="small muted"><b>AI overview: coming later.</b> An optional summary written by an AI could go here. It would stay off unless you turn it on and choose exactly what gets shared.</div>
      </section>
    </div>
  );
}

function Assoc({ c, win }: { c: Comparison; win: WindowId }) {
  const [open, setOpen] = useState(false);
  const cls = c.verdict === 'possible' ? 'assoc-b' : c.verdict === 'hint' ? 'hint' : '';
  return (
    <div class="assoc">
      <button class="assoc-title" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setOpen(!open)}>
        <span>{c.factor.label} <span class="small muted">· {c.factor.group}</span></span>
        <span class={'badge ' + cls}>{VERDICT_LABEL[c.verdict]}</span>
      </button>
      {c.verdict !== 'insufficient' && (
        <div class="stack" style={{ gap: 4 }}>
          <div class="bar-pair">
            <span>Near this</span>
            <div class="bar-track"><div class="bar-fill" style={{ width: `${(c.meanE / 10) * 100}%`, background: 'var(--pain)' }} /></div>
            <span class="num">{fmt1(c.meanE)}</span>
          </div>
          <div class="bar-pair">
            <span>Other times</span>
            <div class="bar-track"><div class="bar-fill" style={{ width: `${(c.meanO / 10) * 100}%`, background: 'var(--line-strong)' }} /></div>
            <span class="num">{fmt1(c.meanO)}</span>
          </div>
        </div>
      )}
      <div class="small muted">{c.exposed.length} vs {c.other.length} readings · logged {c.occurrences}×{open ? '' : ' · tap for details'}</div>
      {open && <p class="small">{describe(c, win)}</p>}
      {open && c.factor.caution && <p class="small muted">{c.factor.caution}</p>}
      {open && <p class="small muted">Other things happening at the same time could explain any difference.</p>}
    </div>
  );
}
