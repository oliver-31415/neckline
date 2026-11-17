import { useEffect } from 'preact/hooks';
import { effect } from '@preact/signals';
import { ready, settings } from './lib/store';
import { closeSheet, go, openSheet, sheet, tab, type Tab } from './lib/nav';
import { Today } from './screens/Today';
import { Timeline } from './screens/Timeline';
import { Patterns } from './screens/Patterns';
import { Report } from './screens/Report';
import { Settings } from './screens/Settings';
import { PainForm } from './forms/PainForm';
import { ActivityForm, DayForm, MealForm, PostureForm, TreatmentForm } from './forms/OtherForms';
import { Sheet, Toast, showToast } from './components/ui';
import { IconBolt, IconCheck, IconPatterns, IconPlus, IconReport, IconTimeline, IconToday } from './components/Icons';
import { TYPE_STYLE } from './components/EntryRow';
import type { ActivityEntry, DayEntry, MealEntry, PainEntry, PostureEntry, TreatmentEntry } from './lib/types';

effect(() => {
  const t = settings.value.theme;
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
});

export function App() {
  useEffect(() => {
    const onHash = () => {
      const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
      if (['today', 'timeline', 'patterns', 'report', 'settings'].includes(path)) tab.value = path as Tab;
      const slot = new URLSearchParams(query ?? '').get('checkin');
      if (slot) {
        openSheet('checkin', { slot: slot === 'now' ? null : slot });
        history.replaceState(null, '', '#/' + tab.value);
      }
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    const onMsg = (e: MessageEvent) => e.data?.type === 'open-checkin' && openSheet('checkin', { slot: e.data.slot ?? null });
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => { window.removeEventListener('hashchange', onHash); navigator.serviceWorker?.removeEventListener('message', onMsg); };
  }, []);

  if (!ready.value) return null;
  const t = tab.value;

  return (
    <div class="app">
      {t === 'today' && <Today />}
      {t === 'timeline' && <Timeline />}
      {t === 'patterns' && <Patterns />}
      {t === 'report' && <Report />}
      {t === 'settings' && <Settings />}

      <nav class="tabbar" aria-label="Main">
        <TabBtn id="today" label="Today" Icon={IconToday} />
        <TabBtn id="timeline" label="Timeline" Icon={IconTimeline} />
        <button class="tab tab-plus" aria-label="Log something" onClick={() => openSheet('add')}><span><IconPlus /></span></button>
        <TabBtn id="patterns" label="Patterns" Icon={IconPatterns} />
        <TabBtn id="report" label="Report" Icon={IconReport} />
      </nav>

      <ActiveSheet />
      <Toast />
    </div>
  );
}

function TabBtn({ id, label, Icon }: { id: Tab; label: string; Icon: () => preact.JSX.Element }) {
  const on = tab.value === id || (id === 'today' && tab.value === 'settings');
  return (
    <button class={'tab' + (on ? ' on' : '')} aria-current={on ? 'page' : undefined} onClick={() => go(id)}>
      <Icon />{label}
    </button>
  );
}

function ActiveSheet() {
  const s = sheet.value;
  if (!s) return null;
  switch (s.kind) {
    case 'checkin': return <PainForm key={s.entry?.id ?? 'new-c'} mode="checkin" entry={s.entry as PainEntry} slot={s.slot} />;
    case 'change': return <PainForm key={s.entry?.id ?? 'new-x'} mode="change" entry={s.entry as PainEntry} />;
    case 'posture': return <PostureForm entry={s.entry as PostureEntry} />;
    case 'activity': return <ActivityForm entry={s.entry as ActivityEntry} />;
    case 'meal': return <MealForm entry={s.entry as MealEntry} />;
    case 'treatment': return <TreatmentForm entry={s.entry as TreatmentEntry} />;
    case 'day': return <DayForm entry={s.entry as DayEntry} />;
    case 'add': return <AddMenu />;
  }
}

function AddMenu() {
  const items = [
    { k: 'checkin', label: 'Check-in', hint: 'Pain level, where, how it feels', color: 'var(--accent)', Icon: IconCheck },
    { k: 'change', label: 'Pain changed', hint: 'Quick note as it happens', color: 'var(--pain)', Icon: IconBolt },
    { k: 'posture', ...TYPE_STYLE.posture, label: 'Posture', hint: 'Looking down, turning…' },
    { k: 'activity', ...TYPE_STYLE.activity, label: 'Activity', hint: 'Computer, driving, lifting…' },
    { k: 'meal', ...TYPE_STYLE.meal, label: 'Food & drink', hint: 'Time, tags, a photo' },
    { k: 'treatment', ...TYPE_STYLE.treatment, label: 'Medication or treatment', hint: 'Dose, time, did it help' },
    { k: 'day', ...TYPE_STYLE.day, label: 'Sleep & background', hint: 'Sleep, stress, exertion' },
  ] as const;
  return (
    <Sheet title="Log" onClose={closeSheet}>
      <div class="list">
        {items.map((it) => (
          <button key={it.k} class="list-row" onClick={() => openSheet(it.k)}>
            <span class="entry-icon" style={{ background: `color-mix(in srgb, ${it.color} 15%, transparent)`, color: it.color }}><it.Icon /></span>
            <span class="grow"><b>{it.label}</b><br /><span class="small muted">{it.hint}</span></span>
          </button>
        ))}
      </div>
      <div style={{ height: 'calc(var(--safe-bottom) + 4px)' }} />
    </Sheet>
  );
}

export function registerSW() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const offer = (w: ServiceWorker) => showToast('Update ready', { label: 'Reload', run: () => w.postMessage('skip-waiting') });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => w.state === 'installed' && navigator.serviceWorker.controller && offer(w));
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  }).catch(() => {});
}
