import { useState } from 'preact/hooks';
import { entries, saveEntry, sortedDesc } from '../lib/store';
import { DAY, dayKey, fmtDay, fmtDayRelative, fmtTime } from '../lib/time';
import { HELPED_LABELS } from '../lib/catalog';
import type { Entry, Helped, TreatmentEntry } from '../lib/types';
import { EntryRow } from '../components/EntryRow';
import { Nav, Seg, showToast } from '../components/ui';
import { IconTimeline } from '../components/Icons';
import { TimelineDays } from './Timeline';

export function History() {
  const [view, setView] = useState<'list' | 'days'>('list');
  const [limit, setLimit] = useState(60);
  const now = Date.now();
  const list = sortedDesc.value;
  const followUps = entries.value.filter((e): e is TreatmentEntry => e.type === 'treatment' && (e.helped == null || e.helped === 'notyet') && now - e.time > 45 * 60_000 && now - e.time < DAY);

  const groups: { key: string; items: Entry[] }[] = [];
  for (const e of list.slice(0, limit)) {
    const k = e.type === 'day' ? e.date : dayKey(e.time);
    const g = groups[groups.length - 1];
    if (g && g.key === k) g.items.push(e);
    else groups.push({ key: k, items: [e] });
  }

  return (
    <div class="screen">
      <Nav title="History" />
      <Seg required options={[{ v: 'list', label: 'List' }, { v: 'days', label: 'Timeline' }]} value={view} onChange={(v) => setView(v as 'list' | 'days')} />

      {followUps.map((t) => (
        <section class="section" key={t.id}>
          <div class="sec-head"><span>Did it help?</span></div>
          <div class="group pad stack">
            <div><b>{t.name}{t.dose ? ` · ${t.dose}` : ''}</b> <span class="muted small">taken {fmtTime(t.time)}</span></div>
            <div class="chips">
              {(['no', 'little', 'lot', 'unsure'] as Helped[]).map((h) => (
                <button key={h} class="chip" onClick={async () => { await saveEntry({ ...t, helped: h }); showToast('Noted'); }}>{HELPED_LABELS[h]}</button>
              ))}
            </div>
          </div>
        </section>
      ))}

      {list.length === 0 ? (
        <div class="empty"><IconTimeline /><div>No entries</div></div>
      ) : view === 'days' ? (
        <TimelineDays />
      ) : (
        <>
          {groups.map((g) => {
            const t = new Date(g.key + 'T12:00').getTime();
            return (
              <section class="section" key={g.key}>
                <div class="sec-head"><span>{fmtDayRelative(t)}</span><span class="sec-aside">{fmtDayRelative(t) === fmtDay(t) ? '' : fmtDay(t)}</span></div>
                <div class="group flush">{g.items.map((e) => <EntryRow key={e.id} e={e} />)}</div>
              </section>
            );
          })}
          {list.length > limit && <button class="btn wide" onClick={() => setLimit(limit + 60)}>Show more</button>}
        </>
      )}
    </div>
  );
}
