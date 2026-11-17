import { signal } from '@preact/signals';
import type { Entry } from './types';

export type SheetKind = 'pain' | 'posture' | 'activity' | 'meal' | 'treatment' | 'day' | 'add';
export type Tab = 'checkin' | 'history' | 'insights' | 'report' | 'settings';
const TABS: Tab[] = ['checkin', 'history', 'insights', 'report', 'settings'];

export const sheet = signal<{ kind: SheetKind; entry?: Entry } | null>(null);
export const tab = signal<Tab>(readTab());
/** Scheduled slot a reminder notification asked about, e.g. "09:00". */
export const pendingSlot = signal<string | null>(null);

export function readTab(): Tab {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0];
  return TABS.includes(h as Tab) ? (h as Tab) : 'checkin';
}

export function go(t: Tab) {
  tab.value = t;
  history.replaceState(null, '', '#/' + t);
  window.scrollTo({ top: 0 });
}

export function openSheet(kind: SheetKind, entry?: Entry) {
  sheet.value = { kind, entry };
}

export function closeSheet() {
  sheet.value = null;
}

/** Opens the editor that matches an existing entry. */
export function editEntry(e: Entry) {
  openSheet(e.type, e);
}
