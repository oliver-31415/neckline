import { entries, saveEntry, settings, sortedDesc } from '../lib/store';
import { go, openSheet } from '../lib/nav';
import { DAY, HOUR, ago, dayKey, fmtSlot, fmtTime, fromDayKey, slotTime, startOfDay } from '../lib/time';
import { HELPED_LABELS, painWord } from '../lib/catalog';
import { mean, readings, fmt1 } from '../lib/analysis';
import type { Helped, PainEntry, TreatmentEntry } from '../lib/types';
import { EntryRow, TYPE_STYLE } from '../components/EntryRow';
import { Spark } from '../components/Charts';
import { painBg, painInk, showToast } from '../components/ui';
import { IconBolt, IconCalendar, IconCheck, IconClock, IconGear, IconInfo, IconLock, IconShare } from '../components/Icons';

export function isStandalone() {
  return (navigator as any).standalone === true || matchMedia('(display-mode: standalone)').matches;
}
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

type SlotState = 'done' | 'due' | 'upcoming' | 'open';
export function slotStatus(slot: string, pains: PainEntry[], now = Date.now()): SlotState {
  const t = slotTime(slot, now);
  const today = dayKey(now);
  const done = pains.some((p) => p.mode === 'checkin' && dayKey(p.time) === today && (p.slot === slot || Math.abs(p.time - t) <= HOUR));
  if (done) return 'done';
  if (now < t - 30 * 60_000) return 'upcoming';
  if (now <= t + 3 * HOUR) return 'due';
  return 'open';
}

export function Today() {
  const s = settings.value;
  const all = entries.value;
  const now = Date.now();
  const today0 = startOfDay(now);
  const todays = sortedDesc.value.filter((e) => e.time >= today0 && e.type !== 'day');
  const pains = all.filter((e): e is PainEntry => e.type === 'pain');
  const rs24 = readings(all, now - DAY, now + 1);
  const latest = readings(all).pop();
  const todayAvg = mean(readings(all, today0, now + 1).map((r) => r.v));
  const followUps = all.filter((e): e is TreatmentEntry => e.type === 'treatment' && (e.helped == null || e.helped === 'notyet') && now - e.time > 45 * 60_000 && now - e.time < DAY);
  const hasDay = all.some((e) => e.type === 'day' && e.date === dayKey(now));
  const next = s.nextAppointment ? Math.ceil((fromDayKey(s.nextAppointment) - today0) / DAY) : null;
  const slots = [...s.checkinTimes].sort();

  async function answer(t: TreatmentEntry, helped: Helped) {
    await saveEntry({ ...t, helped });
    showToast('Thanks, noted');
  }

  return (
    <div class="screen">
      <header class="screen-head">
        <div>
          <div class="eyebrow">{new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1>{greeting()}</h1>
        </div>
        <button class="icon-btn" onClick={() => go('settings')} aria-label="Settings"><IconGear /></button>
      </header>

      {isIOS && !isStandalone() && (
        <div class="notice warm">
          <IconShare />
          <div><b>Add Neckline to your Home Screen.</b> Tap Share, then <b>Add to Home Screen</b>. It then works offline and can send reminders. Entries made here in Safari stay in Safari and won’t appear in the Home Screen app.</div>
        </div>
      )}

      {all.length === 0 && (
        <div class="card stack">
          <div class="row"><span style={{ width: 22, height: 22, color: 'var(--accent)' }}><IconLock /></span><h2>Your diary, on your phone only</h2></div>
          <p class="sub">Neckline keeps every entry on this device. There are no accounts, no analytics, and nothing gets uploaded. Log as much or as little as suits you. Skipped check-ins are fine.</p>
          <div class="row wrap">
            <button class="btn sm" onClick={() => go('settings')}>Mark incision site</button>
            <button class="btn sm" onClick={() => go('settings')}>Set check-in times</button>
          </div>
        </div>
      )}

      <div class="card">
        <div class="hero">
          <div class="hero-num" style={{ background: latest ? painBg(latest.v) : 'var(--surface-3)', color: latest ? painInk(latest.v) : 'var(--muted)' }}>
            {latest ? latest.v : '–'}
          </div>
          <div class="stack" style={{ gap: 2 }}>
            <div style={{ fontSize: 19, fontWeight: 700 }}>{latest ? painWord(latest.v) : 'No readings yet'}</div>
            <div class="small muted">{latest ? `Last logged ${ago(latest.t)}` : 'Your latest pain level shows here'}{!isNaN(todayAvg) ? ` · today avg ${fmt1(todayAvg)}` : ''}</div>
            {rs24.length > 0 && <Spark rs={rs24} from={now - DAY} to={now} />}
          </div>
        </div>
      </div>

      <div class="quick-actions">
        <button class="big-action a" onClick={() => openSheet('checkin', { slot: slots.find((x) => slotStatus(x, pains) === 'due') ?? null })}>
          <IconCheck />
          <span>Check in<small>How you are right now</small></span>
        </button>
        <button class="big-action b" onClick={() => openSheet('change')}>
          <IconBolt />
          <span>Pain changed<small>Log it as it happens</small></span>
        </button>
      </div>

      {slots.length > 0 && (
        <div class="stack" style={{ gap: 8 }}>
          <div class="row between"><span class="eyebrow">Today’s check-ins</span><button class="link small" onClick={() => go('settings')}>Edit times</button></div>
          <div class="slots">
            {slots.map((slot) => {
              const st = slotStatus(slot, pains);
              return (
                <button key={slot} class={'slot ' + st} onClick={() => openSheet('checkin', { slot })}>
                  <b>{fmtSlot(slot)}</b>
                  <span>
                    {st === 'done' && <><span style={{ width: 14, height: 14, color: 'var(--accent)' }}><IconCheck /></span>Done</>}
                    {st === 'due' && <>Now</>}
                    {st === 'upcoming' && <><span style={{ width: 13, height: 13 }}><IconClock /></span>Later</>}
                    {st === 'open' && <>Skipped, that’s ok</>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div class="stack" style={{ gap: 8 }}>
        <span class="eyebrow">Log context</span>
        <div class="mini-grid">
          {(['posture', 'activity', 'meal', 'treatment', 'day'] as const).map((k) => {
            const st = TYPE_STYLE[k];
            return (
              <button key={k} class="mini" onClick={() => openSheet(k)}>
                <i style={{ background: `color-mix(in srgb, ${st.color} 14%, transparent)`, color: st.color }}><st.Icon /></i>
                {k === 'day' ? 'Sleep' : k === 'meal' ? 'Food' : st.label}
              </button>
            );
          })}
        </div>
      </div>

      {followUps.map((t) => (
        <div class="card stack" key={t.id}>
          <div><b>Did {t.name}{t.dose ? ` (${t.dose})` : ''} help?</b> <span class="muted small">Taken {fmtTime(t.time)}</span></div>
          <div class="chips">
            {(['no', 'little', 'lot', 'unsure'] as Helped[]).map((h) => (
              <button key={h} class="chip" onClick={() => answer(t, h)}>{HELPED_LABELS[h]}</button>
            ))}
          </div>
        </div>
      ))}

      {!hasDay && (
        <button class="card row" style={{ border: 0, textAlign: 'left' }} onClick={() => openSheet('day')}>
          <span class="entry-icon" style={{ background: 'var(--surface-3)' }}><TYPE_STYLE.day.Icon /></span>
          <span class="grow"><b>How did you sleep?</b><br /><span class="small muted">Sleep, stress and exertion, about 10 seconds</span></span>
        </button>
      )}

      {next !== null && next >= 0 && (
        <button class="card row" style={{ border: 0, textAlign: 'left' }} onClick={() => go('report')}>
          <span class="entry-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><IconCalendar /></span>
          <span class="grow"><b>{next === 0 ? 'Appointment today' : next === 1 ? 'Appointment tomorrow' : `Appointment in ${next} days`}</b><br /><span class="small muted">Prepare a summary and your questions</span></span>
        </button>
      )}

      <div class="stack" style={{ gap: 8 }}>
        <span class="eyebrow">Today</span>
        {todays.length ? (
          <div class="list">{todays.map((e) => <EntryRow key={e.id} e={e} />)}</div>
        ) : (
          <div class="card flat row small muted"><span style={{ width: 20, height: 20 }}><IconInfo /></span>Nothing logged today yet, and that’s fine.</div>
        )}
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Hello' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
