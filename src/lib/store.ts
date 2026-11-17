import { signal, computed } from '@preact/signals';
import * as db from './db';
import { DEFAULT_SETTINGS } from './catalog';
import type { Entry, Settings } from './types';

export const entries = signal<Entry[]>([]);
export const settings = signal<Settings>(DEFAULT_SETTINGS);
export const ready = signal(false);

export const sortedDesc = computed(() => [...entries.value].sort((a, b) => b.time - a.time));

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function init() {
  const [list, s] = await Promise.all([db.loadEntries(), db.loadSettings()]);
  entries.value = list;
  settings.value = { ...DEFAULT_SETTINGS, ...(s ?? {}), steps: { ...DEFAULT_SETTINGS.steps, ...(s?.steps ?? {}) } };
  ready.value = true;
  // Ask iOS/Safari not to evict this data under storage pressure.
  navigator.storage?.persist?.().catch(() => {});
}

export async function saveEntry(e: Entry) {
  const now = Date.now();
  const next = { ...e, createdAt: e.createdAt || now, updatedAt: now } as Entry;
  await db.putEntry(next);
  const others = entries.value.filter((x) => x.id !== next.id);
  entries.value = [...others, next].sort((a, b) => a.time - b.time);
  return next;
}

export async function removeEntry(id: string) {
  const e = entries.value.find((x) => x.id === id);
  if (e?.type === 'meal' && e.photoId) await db.deletePhoto(e.photoId);
  await db.deleteEntry(id);
  entries.value = entries.value.filter((x) => x.id !== id);
}

export async function updateSettings(patch: Partial<Settings>) {
  settings.value = { ...settings.value, ...patch };
  await db.saveSettings(settings.value);
}

export async function replaceAll(list: Entry[], s: Settings | null) {
  for (const e of list) await db.putEntry(e);
  entries.value = await db.loadEntries();
  if (s) await updateSettings({ ...DEFAULT_SETTINGS, ...s });
}

export async function wipe() {
  await db.clearAll();
  entries.value = [];
  settings.value = DEFAULT_SETTINGS;
}

/** Remember a treatment name/dose so it becomes a one-tap option next time. */
export async function rememberTreatment(name: string, kind: string, dose?: string) {
  const list = settings.value.treatments.filter((t) => t.name.toLowerCase() !== name.toLowerCase());
  await updateSettings({ treatments: [{ name, kind, dose }, ...list].slice(0, 16) });
}

/** Add a custom chip value to a settings list if it's new. */
export async function rememberChip(key: 'qualities' | 'symptoms' | 'activities' | 'exercises' | 'mealTags' | 'sideEffects', value: string) {
  const list = settings.value[key];
  if (!list.some((v) => v.toLowerCase() === value.toLowerCase())) await updateSettings({ [key]: [...list, value] });
}
