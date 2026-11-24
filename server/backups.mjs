// Encrypted backups: the phone uploads ciphertext, this keeps and prunes it.
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { DATA, MAX_BYTES } from './config.mjs';

const MAGIC = Buffer.from('NKB1'); // every backup the app makes starts with this
const dirOf = (user) => DATA + 'users/' + user + '/';

export function listBackups(user) {
  const dir = dirOf(user);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^\d{13}\.nkb$/.test(f)).map((f) => ({ id: f.slice(0, 13), at: Number(f.slice(0, 13)), size: statSync(dir + f).size })).sort((a, b) => b.at - a.at);
}

export function deleteBackups(user) {
  rmSync(dirOf(user), { recursive: true, force: true });
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

/** GET /backup lists, POST /backup uploads, GET /backup/<id> downloads. */
export async function handle(req, res, path, user, reply) {
  if (req.method === 'GET' && path === '/backup') return reply(200, listBackups(user));
  if (req.method === 'POST' && path === '/backup') return reply(200, await receive(req, user));
  const id = /^\/backup\/(\d{13})$/.exec(path)?.[1];
  if (req.method === 'GET' && id) {
    const file = dirOf(user) + id + '.nkb';
    if (!existsSync(file)) return reply(404, 'no such backup');
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': statSync(file).size });
    return createReadStream(file).pipe(res);
  }
  reply(404, 'not found');
}
