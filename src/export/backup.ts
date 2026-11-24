import { allPhotos, putPhoto } from '../lib/db';
import { entries, replaceAll, settings } from '../lib/store';
import type { Entry, Settings } from '../lib/types';
import { stamp } from './files';

export interface Backup {
  app: 'neckline';
  version: 1;
  exportedAt: string;
  settings: Settings;
  entries: Entry[];
  photos?: Record<string, string>;
}

const toDataUrl = (b: Blob) => new Promise<string>((r) => { const f = new FileReader(); f.onload = () => r(f.result as string); f.readAsDataURL(b); });

/** Settings as they go into a backup: without the server sign-in, AI keys, or backup bookkeeping (which would make every backup look like a change). */
export function shareableSettings(s: Settings = settings.value): Settings {
  return { ...s, backup: { ...s.backup, auth: '', key: '', lastAt: null, lastHash: '' }, ai: { ...s.ai, keys: {} } };
}

export async function backupData(withPhotos: boolean): Promise<Backup> {
  const data: Backup = { app: 'neckline', version: 1, exportedAt: new Date().toISOString(), settings: shareableSettings(), entries: entries.value };
  if (withPhotos) {
    data.photos = {};
    for (const [id, blob] of await allPhotos()) data.photos[id] = await toDataUrl(blob);
  }
  return data;
}

export async function makeBackup(withPhotos: boolean): Promise<File> {
  return new File([JSON.stringify(await backupData(withPhotos))], `neckline-backup-${stamp()}.json`, { type: 'application/json' });
}

/** Merges a backup into this device. Entries with the same id are replaced; nothing is deleted. */
export async function applyBackup(data: Backup, restoreSettings: boolean) {
  if (data?.app !== 'neckline' || !Array.isArray(data.entries)) throw new Error('This doesn’t look like a Neckline backup.');
  for (const [id, url] of Object.entries(data.photos ?? {})) await putPhoto(id, await (await fetch(url)).blob());
  // This phone's backup sign-in and AI keys always stay as they are.
  await replaceAll(data.entries, restoreSettings ? { ...data.settings, backup: settings.value.backup, ai: { ...data.settings.ai, keys: settings.value.ai.keys } } : null);
  return data.entries.length;
}

export async function restoreBackup(file: File, restoreSettings: boolean) {
  let data: Backup;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('This doesn’t look like a Neckline backup.'); }
  return applyBackup(data, restoreSettings);
}
