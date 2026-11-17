import { openDB, type IDBPDatabase } from 'idb';
import type { Entry, Settings } from './types';

// Everything lives in this browser's IndexedDB on the device. Nothing is uploaded.
let dbp: Promise<IDBPDatabase> | null = null;

function db() {
  dbp ??= openDB('neckline', 1, {
    upgrade(d) {
      const entries = d.createObjectStore('entries', { keyPath: 'id' });
      entries.createIndex('time', 'time');
      d.createObjectStore('photos');
      d.createObjectStore('kv');
    },
  });
  return dbp;
}

export async function loadEntries(): Promise<Entry[]> {
  return (await db()).getAllFromIndex('entries', 'time') as Promise<Entry[]>;
}
export async function putEntry(e: Entry) {
  await (await db()).put('entries', e);
}
export async function deleteEntry(id: string) {
  await (await db()).delete('entries', id);
}
export async function clearAll() {
  const d = await db();
  await Promise.all([d.clear('entries'), d.clear('photos'), d.clear('kv')]);
}

export async function loadSettings(): Promise<Partial<Settings> | undefined> {
  return (await db()).get('kv', 'settings');
}
export async function saveSettings(s: Settings) {
  await (await db()).put('kv', s, 'settings');
}

export async function putPhoto(id: string, blob: Blob) {
  await (await db()).put('photos', blob, id);
}
export async function getPhoto(id: string): Promise<Blob | undefined> {
  return (await db()).get('photos', id);
}
export async function deletePhoto(id: string) {
  await (await db()).delete('photos', id);
}
export async function allPhotos(): Promise<[string, Blob][]> {
  const d = await db();
  const keys = (await d.getAllKeys('photos')) as string[];
  const vals = await d.getAll('photos');
  return keys.map((k, i) => [k, vals[i] as Blob]);
}
