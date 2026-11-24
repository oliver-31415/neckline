// Users and sign-in, shared by backups and reminders.
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { hkdfSync, pbkdf2Sync, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DATA, TRUST_PROXY } from './config.mjs';

mkdirSync(DATA, { recursive: true, mode: 0o700 });
const usersFile = DATA + 'users.json';

/** @type {Record<string, { salt: string, hash: string, created: string }>} */
let users = {};
let usersMtime = -1;
// Re-read when add-user/remove-user change the file, so the running server needn't restart.
export function loadUsers() {
  const m = existsSync(usersFile) ? statSync(usersFile).mtimeMs : 0;
  if (m !== usersMtime) { users = m ? JSON.parse(readFileSync(usersFile, 'utf8')) : {}; usersMtime = m; }
  return users;
}
function saveUsers() {
  writeFileSync(usersFile + '.tmp', JSON.stringify(users, null, 2), { mode: 0o600 });
  renameSync(usersFile + '.tmp', usersFile);
}
export const validName = (n) => /^[a-z0-9_-]{1,32}$/.test(n);

/*
 * Keys, identical to src/lib/cloud.ts in the app:
 *   master  = PBKDF2-SHA256(password, "neckline-backup:" + user, 600 000 rounds)
 *   auth    = HKDF(master, "neckline auth")    sent to this server to sign in
 *   encrypt = HKDF(master, "neckline encrypt") never leaves the phone
 * The server stores only scrypt(auth), so its files can't be replayed to sign in.
 */
function authKey(user, password) {
  const master = pbkdf2Sync(password.normalize('NFC'), 'neckline-backup:' + user, 600_000, 32, 'sha256');
  return Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'neckline auth', 32));
}
const hashAuth = (auth, salt) => scryptSync(auth, salt, 32);

export function addUser(name, password) {
  const salt = randomBytes(16);
  loadUsers()[name] = { salt: salt.toString('hex'), hash: hashAuth(authKey(name, password), salt).toString('hex'), created: new Date().toISOString() };
  saveUsers();
}
export function removeUser(name) {
  delete loadUsers()[name];
  saveUsers();
}

/* ---------- sign-in, with lockout after repeated failures ---------- */

const DUMMY = { salt: randomBytes(16).toString('hex'), hash: randomBytes(32).toString('hex') };
const failures = new Map(); // "ip|user" -> { count, first, until }
let recentFailures = [];

const clientIp = (req) => (TRUST_PROXY && String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()) || req.socket.remoteAddress;

/** Returns the user name, or a [status, message] pair. */
export function authenticate(req) {
  const m = /^Bearer ([a-z0-9_-]{1,32}):([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? '');
  if (!m) return [401, 'sign in required'];
  const [, user, token] = m;
  const now = Date.now();
  const key = clientIp(req) + '|' + user;
  const f = failures.get(key);
  if (f && f.until > now) return [429, 'too many attempts, try again later'];
  recentFailures = recentFailures.filter((t) => t > now - 60_000);
  if (recentFailures.length >= 30) return [429, 'too many attempts, try again later'];

  const u = loadUsers()[user] ?? DUMMY; // same work for unknown users, so names can't be probed by timing
  const ok = timingSafeEqual(hashAuth(Buffer.from(token, 'base64url'), Buffer.from(u.salt, 'hex')), Buffer.from(u.hash, 'hex')) && u !== DUMMY;
  if (ok) { failures.delete(key); return user; }

  recentFailures.push(now);
  const next = f && now - f.first < 15 * 60_000 ? f : { count: 0, first: now, until: 0 };
  if (++next.count >= 5) next.until = now + 15 * 60_000;
  if (failures.size > 10_000) for (const [k, v] of failures) if (now - v.first > 15 * 60_000 && v.until < now) failures.delete(k);
  failures.set(key, next);
  console.warn(`failed sign-in for "${user}" from ${clientIp(req)} (${next.count})`);
  return [401, 'wrong user name or password'];
}
