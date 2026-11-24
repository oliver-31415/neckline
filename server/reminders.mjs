// Check-in reminders. Stores, per phone: a Web Push address, check-in times, a time zone and whose
// phone it is. It never receives diary entries, and each push says only "time for a check-in".
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import webpush from 'web-push';
import { DATA, VAPID_SUBJECT } from './config.mjs';

const MAX_PER_USER = 10;
const vapidFile = DATA + 'vapid.json';
const subsFile = DATA + 'subs.json';

if (!existsSync(vapidFile)) writeFileSync(vapidFile, JSON.stringify(webpush.generateVAPIDKeys(), null, 2), { mode: 0o600 });
const vapid = JSON.parse(readFileSync(vapidFile, 'utf8'));
webpush.setVapidDetails(VAPID_SUBJECT, vapid.publicKey, vapid.privateKey);

/** @type {Record<string, { user: string, subscription: any, times: string[], tz: string, sent: Record<string, string> }>} */
let subs = existsSync(subsFile) ? JSON.parse(readFileSync(subsFile, 'utf8')) : {};
const save = () => { writeFileSync(subsFile + '.tmp', JSON.stringify(subs), { mode: 0o600 }); renameSync(subsFile + '.tmp', subsFile); };
const keyOf = (endpoint) => createHash('sha256').update(endpoint).digest('hex').slice(0, 24);

export const phoneCount = (user) => Object.values(subs).filter((s) => s.user === user).length;
export function forgetUser(user) {
  if (existsSync(subsFile)) subs = JSON.parse(readFileSync(subsFile, 'utf8'));
  for (const [k, s] of Object.entries(subs)) if (s.user === user) delete subs[k];
  save();
}

function localNow(tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hhmm: `${parts.hour}:${parts.minute}` };
}

async function send(key, payload) {
  const s = subs[key];
  try {
    await webpush.sendNotification(s.subscription, JSON.stringify(payload), { TTL: 3600, urgency: 'normal' });
    return true;
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) { delete subs[key]; save(); console.log('removed expired subscription', key); }
    else console.error('push failed', key, e.statusCode ?? '', e.body ?? e.message);
    return false;
  }
}

/** Checks every 20 s; each slot fires at most once per local day. */
export function startReminders() {
  setInterval(() => {
    let dirty = false;
    for (const [key, s] of Object.entries(subs)) {
      const { date, hhmm } = localNow(s.tz);
      if (s.times.includes(hhmm) && s.sent[hhmm] !== date) {
        s.sent[hhmm] = date;
        dirty = true;
        send(key, { title: 'Neck check-in', body: 'How is your neck right now? A quick check-in takes about 20 seconds. Skipping is fine too.', slot: hhmm });
      }
    }
    if (dirty) save();
  }, 20_000);
}

function validTz(tz) {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 16_384) throw [413, 'too large']; }
  try { return JSON.parse(raw || '{}'); } catch { throw [400, 'bad json']; }
}

/** The public key is open; subscribe, unsubscribe and test need a signed-in user. */
export const isPublic = (req, path) => req.method === 'GET' && path === '/reminders/key';

export async function handle(req, res, path, user, reply) {
  if (isPublic(req, path)) return reply(200, vapid.publicKey);
  if (req.method !== 'POST') return reply(404, 'not found');
  const b = await body(req);

  if (path === '/reminders/subscribe') {
    const sub = b.subscription;
    const times = Array.isArray(b.times) ? b.times.filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)).slice(0, 12) : [];
    if (!sub?.endpoint?.startsWith('https://') || !sub.keys?.p256dh || !sub.keys?.auth) return reply(400, 'bad subscription');
    if (!validTz(b.tz)) return reply(400, 'bad tz');
    const key = keyOf(sub.endpoint);
    if (!subs[key] && phoneCount(user) >= MAX_PER_USER) return reply(429, 'too many devices');
    subs[key] = { user, subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, times, tz: b.tz, sent: subs[key]?.sent ?? {} };
    save();
    return reply(200, 'ok');
  }
  // A phone can only change or test its own subscription, and only under the user who made it.
  const key = typeof b.endpoint === 'string' ? keyOf(b.endpoint) : '';
  const mine = subs[key]?.user === user;
  if (path === '/reminders/unsubscribe') {
    if (mine) { delete subs[key]; save(); }
    return reply(200, 'ok');
  }
  if (path === '/reminders/test') {
    if (!mine) return reply(404, 'not subscribed');
    const ok = await send(key, { title: 'Neckline test', body: 'Reminders are working. You’ll get a nudge at your check-in times.', slot: null });
    return ok ? reply(200, 'ok') : reply(502, 'push service refused the message');
  }
  reply(404, 'not found');
}
