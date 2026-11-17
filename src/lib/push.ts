/*
 * Optional reminders through a small push server you run yourself (see push-server/).
 * The server only learns: a push address for this phone, your check-in times and time zone.
 * It never receives any diary data. Pushes are relayed by Apple and carry only "time to check in".
 */

function b64ToBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function clean(url: string) {
  return url.trim().replace(/\/+$/, '');
}

async function call(server: string, token: string, path: string, body: unknown) {
  const res = await fetch(clean(server) + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Server replied ${res.status}${res.status === 401 ? ' (check the access token)' : ''}`);
  return res;
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Must be called straight from a tap: iOS only shows the permission prompt for a user gesture. */
export async function enablePush(server: string, token: string, times: string[]) {
  if (!pushSupported()) throw new Error('This browser can’t receive notifications. On iPhone, open Neckline from its Home Screen icon (iOS 16.4 or later).');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications are turned off for Neckline. You can allow them in iPhone Settings → Notifications.');
  const reg = await navigator.serviceWorker.ready;
  const keyRes = await fetch(clean(server) + '/vapid-public-key');
  if (!keyRes.ok) throw new Error('Couldn’t reach the reminder server.');
  const key = (await keyRes.text()).trim();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  await call(server, token, '/subscribe', { subscription: sub.toJSON(), times, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
}

export async function syncSchedule(server: string, token: string, times: string[]) {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await call(server, token, '/subscribe', { subscription: sub.toJSON(), times, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
}

export async function disablePush(server: string, token: string) {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await call(server, token, '/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

export async function testPush(server: string, token: string) {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) throw new Error('Reminders aren’t switched on yet.');
  await call(server, token, '/test', { endpoint: sub.endpoint });
}
