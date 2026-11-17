import { allPhotos, putPhoto } from '../lib/db';
import { entries, replaceAll, settings } from '../lib/store';
import type { Entry, Settings } from '../lib/types';
import { stamp } from './files';

interface Backup {
  app: 'neckline';
  version: 1;
  exportedAt: string;
  settings: Settings;
  entries: Entry[];
  photos?: Record<string, string>;
}

const toDataUrl = (b: Blob) => new Promise<string>((r) => { const f = new FileReader(); f.onload = () => r(f.result as string); f.readAsDataURL(b); });

export async function makeBackup(withPhotos: boolean): Promise<File> {
  const data: Backup = { app: 'neckline', version: 1, exportedAt: new Date().toISOString(), settings: settings.value, entries: entries.value };
  if (withPhotos) {
    data.photos = {};
    for (const [id, blob] of await allPhotos()) data.photos[id] = await toDataUrl(blob);
  }
  return new File([JSON.stringify(data)], `neckline-backup-${stamp()}.json`, { type: 'application/json' });
}

/** Merges a backup into this device. Entries with the same id are replaced; nothing is deleted. */
export async function restoreBackup(file: File, restoreSettings: boolean) {
  const data = JSON.parse(await file.text()) as Backup;
  if (data.app !== 'neckline' || !Array.isArray(data.entries)) throw new Error('This doesn’t look like a Neckline backup.');
  for (const [id, url] of Object.entries(data.photos ?? {})) await putPhoto(id, await (await fetch(url)).blob());
  await replaceAll(data.entries, restoreSettings ? data.settings : null);
  return data.entries.length;
}
