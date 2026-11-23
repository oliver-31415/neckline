// Neckline backup server.
// Keeps encrypted backups for the users you create. The phone encrypts each backup with a key
// derived from the user's password before uploading, so this server only ever holds ciphertext
// and never learns the password or anything in the diary.
//
//   node server.mjs                     start the server
//   node server.mjs add-user <name>     create a user (asks for a password)
//   node server.mjs remove-user <name>  delete a user and all their backups
//   node server.mjs users               list users and their backups
import http from 'node:http';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { hkdfSync, pbkdf2Sync, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 8788);
const HOST = process.env.HOST ?? '127.0.0.1';
const DATA = process.env.DATA_DIR ?? new URL('./data/', import.meta.url).pathname;
const ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';
const MAX_BYTES = Number(process.env.MAX_MB ?? 100) * 1024 * 1024;
const MAGIC = Buffer.from('NKB1'); // every backup the app makes starts with this

mkdirSync(DATA + 'users', { recursive: true, mode: 0o700 });
const usersFile = DATA + 'users.json';
/** @type {Record<string, { salt: string, hash: string, created: string }>} */
let users = {};
let usersMtime = -1;
// Re-read when add-user/remove-user change the file, so the running server needn't restart.
function loadUsers() {
  const m = existsSync(usersFile) ? statSync(usersFile).mtimeMs : 0;
  if (m !== usersMtime) { users = m ? JSON.parse(readFileSync(usersFile, 'utf8')) : {}; usersMtime = m; }
  return users;
}
loadUsers();
const saveUsers = () => { writeFileSync(usersFile + '.tmp', JSON.stringify(users, null, 2), { mode: 0o600 }); renameSync(usersFile + '.tmp', usersFile); };
const dirOf = (user) => DATA + 'users/' + user + '/';
const validName = (n) => /^[a-z0-9_-]{1,32}$/.test(n);

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

/* ---------- sign-in, with lockout after repeated failures ---------- */

const DUMMY = { salt: randomBytes(16).toString('hex'), hash: randomBytes(32).toString('hex') };
const failures = new Map(); // "ip|user" -> { count, first, until }
let recentFailures = [];

function clientIp(req) {
  return process.env.TRUST_PROXY ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress : req.socket.remoteAddress;
}

/** Returns the user name, or a [status, message] pair. */
function authenticate(req) {
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

/* ---------- backups on disk ---------- */

function listBackups(user) {
  const dir = dirOf(user);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^\d{13}\.nkb$/.test(f)).map((f) => ({ id: f.slice(0, 13), at: Number(f.slice(0, 13)), size: statSync(dir + f).size })).sort((a, b) => b.at - a.at);
}

/** Keeps the latest 10, the last of each day for 60 days, and the last of each month. */
function prune(user) {
  const list = listBackups(user);
  const keep = new Set(list.slice(0, 10).map((b) => b.id));
  const days = new Set(), months = new Set();
  for (const b of list) {
    const d = new Date(b.at).toISOString();
    if (b.at > Date.now() - 60 * 86_400_000 && !days.has(d.slice(0, 10))) { days.add(d.slice(0, 10)); keep.add(b.id); }
    if (!months.has(d.slice(0, 7))) { months.add(d.slice(0, 7)); keep.add(b.id); }
  }
  for (const b of list) if (!keep.has(b.id)) unlinkSync(dirOf(user) + b.id + '.nkb');
}

async function receive(req, user) {
  const dir = dirOf(user);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  let at = Date.now();
  while (existsSync(dir + at + '.nkb')) at++;
  const tmp = dir + '.' + at + '.tmp';
  const out = createWriteStream(tmp, { mode: 0o600 });
  let size = 0, head = Buffer.alloc(0);
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BYTES) throw [413, 'backup too large'];
      if (head.length < 4) head = Buffer.concat([head, chunk]).subarray(0, 4);
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    }
    await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
    if (size < 32 || !head.equals(MAGIC)) throw [400, 'not a Neckline backup'];
    renameSync(tmp, dir + at + '.nkb');
    prune(user);
    return { id: String(at), at, size };
  } catch (e) {
    out.destroy();
    rmSync(tmp, { force: true });
    throw e;
  }
}

/* ---------- HTTP ---------- */

function serve() {
  http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', ORIGIN);
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (code, data = '') => {
      res.writeHead(code, { 'content-type': typeof data === 'string' ? 'text/plain' : 'application/json' });
      res.end(typeof data === 'string' ? data : JSON.stringify(data));
    };
    if (req.method === 'OPTIONS') return reply(204);
    const path = new URL(req.url, 'http://x').pathname;
    if (req.method === 'GET' && path === '/health') return reply(200, 'ok');
    if (path !== '/backups' && !path.startsWith('/backups/')) return reply(404, 'not found');

    const user = authenticate(req);
    if (Array.isArray(user)) { req.resume(); return reply(...user); }

    try {
      if (req.method === 'GET' && path === '/backups') return reply(200, listBackups(user));
      if (req.method === 'POST' && path === '/backups') return reply(200, await receive(req, user));
      const id = /^\/backups\/(\d{13})$/.exec(path)?.[1];
      if (req.method === 'GET' && id) {
        const file = dirOf(user) + id + '.nkb';
        if (!existsSync(file)) return reply(404, 'no such backup');
        res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': statSync(file).size });
        return createReadStream(file).pipe(res);
      }
      reply(404, 'not found');
    } catch (e) {
      if (Array.isArray(e)) { req.resume(); return reply(...e); }
      console.error(e);
      reply(500, 'server error');
    }
  }).listen(PORT, HOST, () => console.log(`Neckline backups on http://${HOST}:${PORT} (${Object.keys(users).length} user(s))`));
}

/* ---------- command line ---------- */

function ask(question, hidden) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    stdout.write(question);
    let text = '';
    const raw = hidden && stdin.isTTY;
    if (raw) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (s) => {
      for (const ch of s) {
        if (ch === '\u0003') process.exit(130);
        if (ch === '\r' || ch === '\n') {
          stdin.off('data', onData);
          if (raw) stdin.setRawMode(false);
          stdin.pause();
          stdout.write('\n');
          return resolve(text);
        }
        if (ch === '\u007f' || ch === '\b') text = text.slice(0, -1);
        else text += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function cli([cmd, rawName]) {
  const name = (rawName ?? '').toLowerCase();
  if (cmd === 'users') {
    for (const u of Object.keys(users)) {
      const list = listBackups(u);
      console.log(`${u}\t${list.length} backup(s)${list[0] ? `, latest ${new Date(list[0].at).toLocaleString()}` : ''}`);
    }
    if (!Object.keys(users).length) console.log('No users yet. Add one with: node server.mjs add-user <name>');
    return;
  }
  if (!validName(name)) throw new Error('User names are 1–32 characters: a–z, 0–9, - or _.');
  if (cmd === 'add-user') {
    if (users[name]) throw new Error(`"${name}" already exists. Remove it first to start over.`);
    const password = process.env.NECKLINE_PASSWORD ?? await ask('Password: ', true);
    if (password.length < 10) throw new Error('Use at least 10 characters.');
    if (!process.env.NECKLINE_PASSWORD && (await ask('Again: ', true)) !== password) throw new Error('The passwords didn’t match.');
    const salt = randomBytes(16);
    users[name] = { salt: salt.toString('hex'), hash: hashAuth(authKey(name, password), salt).toString('hex'), created: new Date().toISOString() };
    saveUsers();
    console.log(`Added "${name}". Sign in on the phone with this name and password.`);
    console.log('The password also encrypts the backups: without it they can’t be opened, by anyone.');
    return;
  }
  if (cmd === 'remove-user') {
    if (!users[name]) throw new Error(`No user "${name}".`);
    const n = listBackups(name).length;
    if (!process.argv.includes('--yes') && (await ask(`Delete "${name}" and ${n} backup(s)? Type the name to confirm: `)) !== name) throw new Error('Cancelled.');
    delete users[name];
    saveUsers();
    rmSync(dirOf(name), { recursive: true, force: true });
    console.log(`Removed "${name}".`);
    return;
  }
  throw new Error('Commands: add-user <name>, remove-user <name>, users. With no command, starts the server.');
}

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (args.length) cli(args).catch((e) => { console.error(e.message); process.exit(1); });
else serve();
