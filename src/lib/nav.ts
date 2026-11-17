import { signal } from '@preact/signals';
import type { Entry } from './types';

export type SheetKind = 'checkin' | 'change' | 'posture' | 'activity' | 'meal' | 'treatment' | 'day' | 'add';
export type Tab = 'today' | 'timeline' | 'patterns' | 'report' | 'settings';

export const sheet = signal<{ kind: SheetKind; entry?: Entry; slot?: string | null } | null>(null);
export const tab = signal<Tab>(readTab());

function readTab(): Tab {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0];
  return (['today', 'timeline', 'patterns', 'report', 'settings'] as Tab[]).includes(h as Tab) ? (h as Tab) : 'today';
}

export function go(t: Tab) {
  tab.value = t;
  history.replaceState(null, '', '#/' + t);
  window.scrollTo({ top: 0 });
}

export function openSheet(kind: SheetKind, extra: { entry?: Entry; slot?: string | null } = {}) {
  sheet.value = { kind, ...extra };
}

export function closeSheet() {
  sheet.value = null;
}

/** Opens the editor that matches an existing entry. */
export function editEntry(e: Entry) {
  const kind: SheetKind = e.type === 'pain' ? (e.mode === 'change' ? 'change' : 'checkin') : e.type;
  openSheet(kind, { entry: e });
}
