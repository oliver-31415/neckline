// Neckline reminder server.
// Stores, per phone: a Web Push address, check-in times and a time zone. Nothing else.
// It never receives diary entries, and each push says only "time for a check-in".
import http from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import webpush from 'web-push';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';
const DATA = process.env.DATA_DIR ?? new URL('./data/', import.meta.url).pathname;
const TOKEN = process.env.ACCESS_TOKEN ?? '';
const ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';
const SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:reminders@example.com';
const MAX_SUBS = 10;

mkdirSync(DATA, { recursive: true });
const vapidFile = DATA + 'vapid.json';
const subsFile = DATA + 'subs.json';

if (!existsSync(vapidFile)) writeFileSync(vapidFile, JSON.stringify(webpush.generateVAPIDKeys(), null, 2), { mode: 0o600 });
const vapid = JSON.parse(readFileSync(vapidFile, 'utf8'));
webpush.setVapidDetails(SUBJECT, vapid.publicKey, vapid.privateKey);

/** @type {Record<string, { subscription: any, times: string[], tz: string, sent: Record<string, string> }>} */
let subs = existsSync(subsFile) ? JSON.parse(readFileSync(subsFile, 'utf8')) : {};
const save = () => { writeFileSync(subsFile + '.tmp', JSON.stringify(subs), { mode: 0o600 }); renameSync(subsFile + '.tmp', subsFile); };
const keyOf = (endpoint) => createHash('sha256').update(endpoint).digest('hex').slice(0, 24);

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

// Check every 20 s; each slot fires at most once per local day.
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

function validTz(tz) {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 16_384) throw new Error('too large'); }
  return JSON.parse(raw || '{}');
}

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Vary', 'Origin');
  const reply = (code, text = '') => { res.writeHead(code, { 'content-type': 'text/plain' }); res.end(text); };
  if (req.method === 'OPTIONS') return reply(204);
  const url = new URL(req.url, 'http://x');

  if (req.method === 'GET' && url.pathname === '/vapid-public-key') return reply(200, vapid.publicKey);
  if (req.method === 'GET' && url.pathname === '/health') return reply(200, 'ok');
  if (req.method !== 'POST') return reply(404);
  if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) return reply(401, 'bad token');

  let b;
  try { b = await body(req); } catch { return reply(400, 'bad json'); }

  if (url.pathname === '/subscribe') {
    const sub = b.subscription;
    const times = Array.isArray(b.times) ? b.times.filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)).slice(0, 12) : [];
    if (!sub?.endpoint?.startsWith('https://') || !sub.keys?.p256dh || !sub.keys?.auth) return reply(400, 'bad subscription');
    if (!validTz(b.tz)) return reply(400, 'bad tz');
    const key = keyOf(sub.endpoint);
    if (!subs[key] && Object.keys(subs).length >= MAX_SUBS) return reply(429, 'too many devices');
    subs[key] = { subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, times, tz: b.tz, sent: subs[key]?.sent ?? {} };
    save();
    return reply(200, 'ok');
  }
  if (url.pathname === '/unsubscribe') {
    if (typeof b.endpoint === 'string') { delete subs[keyOf(b.endpoint)]; save(); }
    return reply(200, 'ok');
  }
  if (url.pathname === '/test') {
    const key = typeof b.endpoint === 'string' ? keyOf(b.endpoint) : '';
    if (!subs[key]) return reply(404, 'not subscribed');
    const ok = await send(key, { title: 'Neckline test', body: 'Reminders are working. You’ll get a nudge at your check-in times.', slot: null });
    return ok ? reply(200, 'ok') : reply(502, 'push service refused the message');
  }
  reply(404);
}).listen(PORT, HOST, () => console.log(`Neckline reminders on http://${HOST}:${PORT} (${Object.keys(subs).length} device(s))`));
