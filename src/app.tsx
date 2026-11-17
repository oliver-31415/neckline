import { useEffect } from 'preact/hooks';
import { effect } from '@preact/signals';
import { ready, settings } from './lib/store';
import { closeSheet, go, openSheet, pendingSlot, readTab, sheet, tab, type Tab } from './lib/nav';
import { CheckIn } from './screens/CheckIn';
import { History } from './screens/History';
import { Patterns } from './screens/Patterns';
import { Report } from './screens/Report';
import { Settings } from './screens/Settings';
import { ActivityForm, DayForm, MealForm, PostureForm, TreatmentForm } from './forms/OtherForms';
import { Sheet, Toast, showToast } from './components/ui';
import { IconClock, IconPatterns, IconPulse, IconReport } from './components/Icons';
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
      tab.value = readTab();
      const slot = new URLSearchParams(location.hash.split('?')[1] ?? '').get('slot');
      if (slot) {
        pendingSlot.value = slot;
        tab.value = 'checkin';
        history.replaceState(null, '', '#/checkin');
      }
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== 'open-checkin') return;
      closeSheet();
      pendingSlot.value = e.data.slot ?? null;
      go('checkin');
    };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => { window.removeEventListener('hashchange', onHash); navigator.serviceWorker?.removeEventListener('message', onMsg); };
  }, []);

  if (!ready.value) return null;
  const t = tab.value;

  return (
    <div class="app">
      {t === 'checkin' && <CheckIn key="home" />}
      {t === 'history' && <History />}
      {t === 'insights' && <Patterns />}
      {t === 'report' && <Report />}
      {t === 'settings' && <Settings />}

      <nav class="tabbar" aria-label="Main">
        <TabBtn id="checkin" label="Check In" Icon={IconPulse} />
        <TabBtn id="history" label="History" Icon={IconClock} />
        <TabBtn id="insights" label="Insights" Icon={IconPatterns} />
        <TabBtn id="report" label="Report" Icon={IconReport} />
      </nav>

      <ActiveSheet />
      <Toast />
    </div>
  );
}

function TabBtn({ id, label, Icon }: { id: Tab; label: string; Icon: () => preact.JSX.Element }) {
  const on = tab.value === id || (id === 'checkin' && tab.value === 'settings');
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
    case 'pain': return <CheckIn key={s.entry!.id} entry={s.entry as PainEntry} />;
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
    { k: 'treatment', ...TYPE_STYLE.treatment, label: 'Medication or Treatment' },
    { k: 'posture', ...TYPE_STYLE.posture, label: 'Posture' },
    { k: 'activity', ...TYPE_STYLE.activity, label: 'Activity' },
    { k: 'meal', ...TYPE_STYLE.meal, label: 'Food & Drink' },
    { k: 'day', ...TYPE_STYLE.day, label: 'Sleep & Day' },
  ] as const;
  return (
    <Sheet title="Log" onClose={closeSheet}>
      <section class="section">
        <div class="group">
          {items.map((it) => (
            <button key={it.k} class="row-item" onClick={() => openSheet(it.k)}>
              <span class="row-icon" style={{ background: it.color }}><it.Icon /></span>
              <span class="row-label">{it.label}</span>
            </button>
          ))}
        </div>
      </section>
    </Sheet>
  );
}

export function registerSW() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const hadController = !!navigator.serviceWorker.controller;
  // The worker activates new versions itself; offer a reload rather than interrupting a check-in.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) showToast('Updated', { label: 'Reload', run: () => location.reload() });
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
}
