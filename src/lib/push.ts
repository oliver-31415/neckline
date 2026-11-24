/*
 * Check-in reminders from your own Neckline server (see server/), using the same sign-in as backups.
 * The server only learns: a push address for this phone, your check-in times and time zone.
 * It never receives any diary data. Pushes are relayed by Apple and carry only "time to check in".
 */
import { request } from './cloud';
import { settings } from './store';

function b64ToBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const post = (path: string, body: unknown) =>
  request('/reminders/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Must be called straight from a tap: iOS only shows the permission prompt for a user gesture. */
export async function enablePush(times: string[]) {
  if (!pushSupported()) throw new Error('This browser can’t receive notifications. On iPhone, open Neckline from its Home Screen icon (iOS 16.4 or later).');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications are turned off for Neckline. You can allow them in iPhone Settings → Notifications.');
  const reg = await navigator.serviceWorker.ready;
  const key = (await (await request('/reminders/key')).text()).trim();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  await post('subscribe', { subscription: sub.toJSON(), times, tz: tz() });
}

export async function syncSchedule(times: string[]) {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await post('subscribe', { subscription: sub.toJSON(), times, tz: tz() });
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await post('unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

export async function testPush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) throw new Error('Reminders aren’t switched on yet.');
  await post('test', { endpoint: sub.endpoint });
}

export const pushReady = () => !!settings.value.backup.auth;
