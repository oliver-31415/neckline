// End-to-end: sign in to a local backup server, back up, wipe the phone, restore.
// Needs: vite preview on 4173 and server/ on 8799 (DATA_DIR elsewhere) with user "tester" / "correct horse battery".
import { launch } from './browser.mjs';

const BASE = process.env.BASE ?? 'http://localhost:4173/';
const SERVER = process.env.SERVER ?? 'http://127.0.0.1:8799';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
page.on('dialog', (d) => { console.log('dialog:', d.message()); d.accept(); });
const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };

await page.goto(BASE + '#/settings');
await page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('neckline', 1); q.onsuccess = () => r(q.result); });
  const tx = db.transaction(['entries', 'kv'], 'readwrite');
  const now = Date.now();
  tx.objectStore('entries').put({ id: 'e1', type: 'pain', time: now - 3600e3, createdAt: now, updatedAt: now, note: 'backup me', intensity: 6, regions: ['C5'], levels: { C5: 6 } });
  tx.objectStore('kv').put({ onboarded: true, version: 3 }, 'settings');
  await new Promise((r) => (tx.oncomplete = r));
});
await page.reload();
await page.waitForTimeout(600);

// Wrong password first.
const form = page.locator('form.col-form');
await form.locator('input[type=url]').fill(SERVER);
await form.locator('input[autocomplete=username]').fill('Tester');
await form.locator('input[type=password]').fill('wrong password!');
await form.locator('button').click();
await page.getByText('Wrong user name or password.').waitFor({ timeout: 15000 });
console.log('wrong password rejected');

await form.locator('input[type=password]').fill('correct horse battery');
await form.locator('button').click();
await page.getByText('Last backup').waitFor({ timeout: 15000 });
await page.waitForFunction(() => !document.body.innerText.includes('Not yet') && !document.body.innerText.includes('Backing up'), null, { timeout: 15000 });
console.log('signed in; status:', await page.locator('.section', { hasText: 'Neckline server' }).innerText());
await page.locator('.section', { hasText: 'Neckline server' }).screenshot({ path: 'shots/backup-block.png' });

// Stored settings never contain the password; the uploaded file is ciphertext.
const stored = await page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('neckline', 1); q.onsuccess = () => r(q.result); });
  return new Promise((r) => { const q = db.transaction('kv').objectStore('kv').get('settings'); q.onsuccess = () => r(q.result); });
});
if (JSON.stringify(stored).includes('correct horse')) fail('password stored on phone');
console.log('stored backup settings keys:', Object.keys(stored.backup), 'user:', stored.backup.user);

const before = stored.backup.lastAt;

// An idle app must not keep re-uploading: each backup's own bookkeeping isn't a change.
await page.waitForTimeout(12000);
const idle = await page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('neckline', 1); q.onsuccess = () => r(q.result); });
  return new Promise((r) => { const q = db.transaction('kv').objectStore('kv').get('settings'); q.onsuccess = () => r(q.result.backup.lastAt); });
});
if (idle !== before) fail('backed up again with nothing changed'); else console.log('idle: no extra backups');

// Wipe the phone, sign in again, restore.
await ctx.clearCookies();
await page.evaluate(async () => { await new Promise((r) => { const q = indexedDB.deleteDatabase('neckline'); q.onsuccess = q.onerror = q.onblocked = r; }); });
await page.goto(BASE + '#/settings');
await page.reload();
await page.waitForTimeout(800);
const form2 = page.locator('form.col-form');
await form2.locator('input[type=url]').fill(SERVER);
await form2.locator('input[autocomplete=username]').fill('tester');
await form2.locator('input[type=password]').fill('correct horse battery');
await form2.locator('button').click();
await page.getByText('Restored 1 entries').waitFor({ timeout: 20000 });
const back = await page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('neckline', 1); q.onsuccess = () => r(q.result); });
  return new Promise((r) => { const q = db.transaction('entries').objectStore('entries').getAll(); q.onsuccess = () => r(q.result); });
});
if (back[0]?.note !== 'backup me') fail('restore lost the entry'); else console.log('restored entry note:', back[0].note, 'lastAt before', before);

// Restore menu lists versions.
await page.getByRole('button', { name: 'Restore from server' }).click();
const items = await page.locator('.menu .menu-item').allInnerTexts();
console.log('restore menu:', items);
await page.screenshot({ path: 'shots/backup-restore-menu.png' });
await browser.close();

