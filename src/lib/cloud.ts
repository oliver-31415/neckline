import { effect, signal } from '@preact/signals';
import { applyBackup, backupData, shareableSettings, type Backup } from '../export/backup';
import { entries, settings, updateSettings } from './store';

/*
 * Optional backups to a server you run yourself (see backup-server/).
 * Everything is encrypted on the phone before it's sent, with a key made from your password.
 * The server only sees your user name and a scrambled blob, and can't open it.
 *
 *   master  = PBKDF2-SHA256(password, "neckline-backup:" + user, 600 000 rounds)
 *   auth    = HKDF(master, "neckline auth")    signs in; the server keeps only a hash of it
 *   encrypt = HKDF(master, "neckline encrypt") AES-256-GCM key, never leaves the phone
 *
 * File layout: "NKB1" | flags (1 = gzip) | 12-byte IV | ciphertext. The first 5 bytes are authenticated too.
 */

export interface RemoteBackup { id: string; at: number; size: number }

const MAGIC = new TextEncoder().encode('NKB1');
const enc = new TextEncoder();

export const cloudBusy = signal(false);
export const cloudError = signal('');

const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const clean = (url: string) => url.trim().replace(/\/+$/, '');
export const normUser = (u: string) => u.trim().toLowerCase();

export async function deriveKeys(user: string, password: string) {
  const pw = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const master = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('neckline-backup:' + user), iterations: 600_000 }, pw, 256);
  const hk = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveBits']);
  const part = (info: string) => crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(info) }, hk, 256);
  return { auth: b64u(await part('neckline auth')), key: b64u(await part('neckline encrypt')) };
}

async function request(path: string, init: RequestInit = {}, b = settings.value.backup) {
  let res: Response;
  try {
    res = await fetch(clean(b.serverUrl) + path, { ...init, cache: 'no-store', headers: { ...init.headers, authorization: `Bearer ${b.user}:${b.auth}` } });
  } catch {
    throw new Error('Couldn’t reach the backup server.');
  }
  if (res.status === 401) throw new Error('Wrong user name or password.');
  if (res.status === 429) throw new Error('Too many attempts. Try again in 15 minutes.');
  if (!res.ok) throw new Error(`The backup server replied ${res.status}${res.status === 413 ? ' (backup too large)' : ''}.`);
  return res;
}

const aesKey = (key: string, use: KeyUsage) => crypto.subtle.importKey('raw', unb64u(key), 'AES-GCM', false, [use]);

async function pipe(data: Uint8Array<ArrayBuffer>, stream: GenericTransformStream) {
  return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer());
}

async function seal(data: Backup, key: string) {
  let body = enc.encode(JSON.stringify(data));
  const gzip = typeof CompressionStream === 'function';
  if (gzip) body = await pipe(body, new CompressionStream('gzip'));
  const head = new Uint8Array([...MAGIC, gzip ? 1 : 0]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: head }, await aesKey(key, 'encrypt'), body);
  return new Blob([head, iv, ct], { type: 'application/octet-stream' });
}

async function open(buf: ArrayBuffer, key: string): Promise<Backup> {
  const all = new Uint8Array(buf);
  const head = all.subarray(0, 5);
  if (!MAGIC.every((v, i) => head[i] === v)) throw new Error('This isn’t a Neckline backup.');
  let body: Uint8Array<ArrayBuffer>;
  try {
    body = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.subarray(5, 17), additionalData: head }, await aesKey(key, 'decrypt'), all.subarray(17)));
  } catch {
    throw new Error('Couldn’t unlock this backup. It was made with a different password.');
  }
  if (head[4] & 1) body = await pipe(body, new DecompressionStream('gzip'));
  return JSON.parse(new TextDecoder().decode(body));
}

/** Checks the sign-in and saves it on this phone. Returns the backups already on the server. */
export async function signIn(serverUrl: string, rawUser: string, password: string) {
  const user = normUser(rawUser);
  if (!/^https?:\/\//.test(serverUrl.trim())) throw new Error('Enter the server address, starting with https://');
  if (!/^[a-z0-9_-]{1,32}$/.test(user)) throw new Error('Check the user name.');
  const b = { ...settings.value.backup, serverUrl: clean(serverUrl), user, ...(await deriveKeys(user, password)), lastAt: null, lastHash: '' };
  const list = (await (await request('/backups', {}, b)).json()) as RemoteBackup[];
  await updateSettings({ backup: b });
  return list;
}

export async function signOut() {
  await updateSettings({ backup: { ...settings.value.backup, auth: '', key: '', lastAt: null, lastHash: '' } });
}

export const signedIn = () => !!(settings.value.backup.auth && settings.value.backup.key);

export async function listRemote() {
  return (await (await request('/backups')).json()) as RemoteBackup[];
}

async function fingerprint() {
  const text = JSON.stringify([entries.value, shareableSettings()]);
  return b64u(await crypto.subtle.digest('SHA-256', enc.encode(text))).slice(0, 22);
}

/** Uploads an encrypted copy. Without force, skips it when nothing has changed since the last one. */
export async function backUpNow(force = false) {
  if (!signedIn() || cloudBusy.value) return false;
  cloudBusy.value = true;
  try {
    const hash = await fingerprint();
    if (!force && hash === settings.value.backup.lastHash) return false;
    const blob = await seal(await backupData(true), settings.value.backup.key);
    const r = (await (await request('/backups', { method: 'POST', body: blob, headers: { 'content-type': 'application/octet-stream' } })).json()) as RemoteBackup;
    await updateSettings({ backup: { ...settings.value.backup, lastAt: r.at, lastHash: hash } });
    cloudError.value = '';
    return true;
  } catch (e) {
    cloudError.value = (e as Error).message;
    throw e;
  } finally {
    cloudBusy.value = false;
  }
}

export async function restoreRemote(id: string, restoreSettings: boolean) {
  const buf = await (await request('/backups/' + id)).arrayBuffer();
  return applyBackup(await open(buf, settings.value.backup.key), restoreSettings);
}

/** Backs up a few seconds after anything changes, on launch if needed, and when the app is put away. */
export function startAutoBackup() {
  let timer: number | undefined;
  const run = () => {
    clearTimeout(timer);
    timer = undefined;
    const b = settings.value.backup;
    if (b.auto && signedIn() && navigator.onLine !== false) backUpNow().catch(() => {});
  };
  let first = true;
  effect(() => {
    void entries.value;
    const { backup, ...rest } = settings.value;
    void rest; void backup.auto;
    if (first) { first = false; timer = window.setTimeout(run, 3000); return; }
    clearTimeout(timer);
    timer = window.setTimeout(run, 5000);
  });
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && timer !== undefined && run());
  window.addEventListener('online', () => run());
}
