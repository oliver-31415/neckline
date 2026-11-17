import { useState } from 'preact/hooks';
import { entries } from '../lib/store';
import { DAY, dayKey, fmtDayRelative, fmtDay, startOfDay } from '../lib/time';
import { fmt1, mean } from '../lib/analysis';
import type { DayEntry, Entry } from '../lib/types';
import { DayStrip, LANES } from '../components/Charts';
import { EntryRow } from '../components/EntryRow';
import { PainPill } from '../components/ui';
import { IconTimeline } from '../components/Icons';
import { openSheet } from '../lib/nav';

export function Timeline() {
  const [days, setDays] = useState(7);
  const all = entries.value;
  const today = startOfDay(Date.now());
  const byDay = new Map<string, Entry[]>();
  for (const e of all) {
    const k = e.type === 'day' ? e.date : dayKey(e.time);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  const earliest = all.length ? startOfDay(Math.min(...all.map((e) => e.time))) : today;

  const items: preact.JSX.Element[] = [];
  let gap = 0;
  const cur = new Date(today);
  for (let i = 0; i < days; i++) {
    const t = cur.getTime();
    if (t < earliest) break;
    const list = byDay.get(dayKey(t)) ?? [];
    if (!list.length) gap++;
    else {
      if (gap) items.push(<Gap key={'g' + t} n={gap} />);
      gap = 0;
      items.push(<DayCard key={t} day={t} list={list} />);
    }
    cur.setDate(cur.getDate() - 1);
  }
  if (gap && items.length) items.push(<Gap key="gend" n={gap} />);

  return (
    <div class="screen">
      <header class="screen-head"><div><div class="eyebrow">Day by day</div><h1>Timeline</h1></div></header>
      <div class="legend" style={{ padding: '0 4px' }}>
        {LANES.map((l) => <span key={l.id}><i style={{ background: l.color }} />{l.label}</span>)}
        <span><i style={{ background: 'var(--surface)', border: '2px solid var(--pain)', borderRadius: '50%' }} />Pain change</span>
      </div>
      {items.length ? items : (
        <div class="empty"><IconTimeline /><div>Your entries will appear here, lined up across each day so you can see what happened around pain changes.</div></div>
      )}
      {all.length > 0 && cur.getTime() >= earliest && (
        <button class="btn wide" onClick={() => setDays(days + 14)}>Show earlier days</button>
      )}
    </div>
  );
}

function Gap({ n }: { n: number }) {
  return <div class="small muted center" style={{ padding: '2px 0' }}>{n === 1 ? '1 day' : `${n} days`} without entries</div>;
}

function DayCard({ day, list }: { day: number; list: Entry[] }) {
  const [open, setOpen] = useState(false);
  const timed = list.filter((e) => e.type !== 'day').sort((a, b) => a.time - b.time);
  const dayInfo = list.find((e): e is DayEntry => e.type === 'day');
  const vs = timed.flatMap((e) => (e.type === 'pain' && e.intensity != null ? [e.intensity] : []));
  const avg = mean(vs);
  return (
    <section class="daycard">
      <div class="daycard-head">
        <div class="grow">
          <h3>{fmtDayRelative(day)}</h3>
          <div class="small muted">{fmtDayRelative(day) === fmtDay(day) ? '' : fmtDay(day) + ' · '}{timed.length} entr{timed.length === 1 ? 'y' : 'ies'}</div>
        </div>
        {!isNaN(avg) && <span class="row small muted" style={{ gap: 6 }} aria-label={`Average pain ${fmt1(avg)}`}>avg <PainPill n={Math.round(avg)} /></span>}
      </div>
      {dayInfo && (
        <div style={{ padding: '0 16px 6px' }}>
          <button class="badge" style={{ border: 0 }} onClick={() => openSheet('day', { entry: dayInfo })}>
            {[dayInfo.sleepHours != null ? `${dayInfo.sleepHours}h sleep` : '', dayInfo.sleepQuality ? `${dayInfo.sleepQuality} sleep` : '', dayInfo.stress != null && dayInfo.stress >= 7 ? 'stressful' : '', dayInfo.exertion ? 'exertion' : ''].filter(Boolean).join(' · ') || 'day notes'}
          </button>
        </div>
      )}
      {timed.length > 0 && <div class="daycard-body"><DayStrip day={day} list={timed} /></div>}
      {open && <div style={{ borderTop: '0.5px solid var(--line)' }}>{[...timed].reverse().map((e) => <EntryRow key={e.id} e={e} />)}</div>}
      {timed.length > 0 && <button class="daycard-toggle" onClick={() => setOpen(!open)}>{open ? 'Hide entries' : `Show ${timed.length} entr${timed.length === 1 ? 'y' : 'ies'}`}</button>}
    </section>
  );
}
