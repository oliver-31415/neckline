// Neckline server: encrypted backups at /backup and check-in reminders at /reminders,
// for the users you create. See README.md.
//
//   node server.mjs                     start the server
//   node server.mjs add-user <name>     create a user (asks for a password)
//   node server.mjs remove-user <name>  delete a user, their backups and reminders
//   node server.mjs users               list users
import http from 'node:http';
import { HOST, ORIGIN, PORT } from './config.mjs';
import { addUser, authenticate, loadUsers, removeUser, validName } from './auth.mjs';
import * as backups from './backups.mjs';
import * as reminders from './reminders.mjs';

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
    const path = new URL(req.url, 'http://x').pathname.replace(/\/+$/, '') || '/';
    if (req.method === 'GET' && (path === '/health' || path === '/')) return reply(200, 'ok');

    const area = path === '/backup' || path.startsWith('/backup/') ? backups : path.startsWith('/reminders/') ? reminders : null;
    if (!area) return reply(404, 'not found');
    let user = null;
    if (!(area === reminders && reminders.isPublic(req, path))) {
      user = authenticate(req);
      if (Array.isArray(user)) { req.resume(); return reply(...user); }
    }
    try {
      await area.handle(req, res, path, user, reply);
    } catch (e) {
      if (Array.isArray(e)) { req.resume(); return reply(...e); }
      console.error(e);
      if (!res.headersSent) reply(500, 'server error');
    }
  }).listen(PORT, HOST, () => console.log(`Neckline server on http://${HOST}:${PORT} (${Object.keys(loadUsers()).length} user(s))`));
  reminders.startReminders();
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
  const users = loadUsers();
  const name = (rawName ?? '').toLowerCase();
  if (cmd === 'users') {
    for (const u of Object.keys(users)) {
      const list = backups.listBackups(u);
      console.log(`${u}\t${list.length} backup(s)${list[0] ? `, latest ${new Date(list[0].at).toLocaleString()}` : ''}\t${reminders.phoneCount(u)} phone(s) with reminders`);
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
    addUser(name, password);
    console.log(`Added "${name}". Sign in on the phone with this name and password.`);
    console.log('The password also encrypts the backups: without it they can’t be opened, by anyone.');
    return;
  }
  if (cmd === 'remove-user') {
    if (!users[name]) throw new Error(`No user "${name}".`);
    const n = backups.listBackups(name).length;
    if (!process.argv.includes('--yes') && (await ask(`Delete "${name}", ${n} backup(s) and their reminders? Type the name to confirm: `)) !== name) throw new Error('Cancelled.');
    removeUser(name);
    backups.deleteBackups(name);
    reminders.forgetUser(name);
    console.log(`Removed "${name}".`);
    return;
  }
  throw new Error('Commands: add-user <name>, remove-user <name>, users. With no command, starts the server.');
}

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (args.length) cli(args).then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); });
else serve();
