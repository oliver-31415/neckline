// Headless screenshots at iPhone size with generated sample data.
// Usage: npm run build && npx vite preview --port 4173 & node scripts/screens.mjs [--dark]
import { mkdirSync } from 'node:fs';
import { launch } from './browser.mjs';

const BASE = process.env.BASE ?? 'http://localhost:4173/';
const dark = process.argv.includes('--dark');
const out = 'shots' + (dark ? '/dark' : '');
mkdirSync(out, { recursive: true });

function sample() {
  const H = 3600e3, D = 24 * H;
  const now = Date.now();
  const day0 = new Date(); day0.setHours(0, 0, 0, 0);
  const list = [];
  let n = 0;
  const id = () => 's' + (n++).toString(36);
  const base = (t) => ({ id: id(), time: t, createdAt: t, updatedAt: t, note: '' });
  let rnd = 7;
  const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  for (let d = 20; d >= 0; d--) {
    const dayStart = day0.getTime() - d * D;
    const longDown = r() < 0.45;
    const poorSleep = r() < 0.3;
    list.push({ ...base(dayStart + 12 * H), type: 'day', date: new Date(dayStart).toLocaleDateString('en-CA'), sleepHours: poorSleep ? 5 : 7 + Math.round(r()), sleepQuality: poorSleep ? 'poor' : 'good', stress: r() < 0.2 ? 8 : 2, exertion: r() < 0.1 });
    if (longDown) list.push({ ...base(dayStart + 10.5 * H), type: 'posture', posture: 'down', minutes: 90, breaks: 'no' });
    list.push({ ...base(dayStart + 13 * H), type: 'activity', activity: 'Computer', minutes: 150, effort: 'light' });
    if (r() < 0.4) list.push({ ...base(dayStart + 17.5 * H), type: 'activity', activity: 'Driving', minutes: 45, effort: 'light' });
    list.push({ ...base(dayStart + 8 * H), type: 'meal', tags: ['Breakfast', 'Coffee'], photoId: null });
    list.push({ ...base(dayStart + 12.7 * H), type: 'meal', tags: ['Lunch'], photoId: null, note: r() < 0.3 ? 'Big pasta lunch' : '' });
    for (const [h, slot] of [[9, '09:00'], [14, '14:00'], [20, '20:00']]) {
      const t = dayStart + h * H + Math.round(r() * 40) * 60e3;
      if (t > now || r() < 0.12) continue;
      let v = 3 + (h === 14 && longDown ? 3 : 0) + (h === 9 && poorSleep ? 1.5 : 0) + (r() - 0.5) * 2 - (20 - d) * 0.05;
      v = Math.max(0, Math.min(10, Math.round(v)));
      const regions = { 'neck-front-R': 'pain', 'shoulder-top-R': 'pain' };
      if (v >= 5) Object.assign(regions, { 'upper-arm-R': 'pain', 'hand-thumb-R': 'tingling' });
      if (r() < 0.3) regions['skull-base-R'] = 'pain';
      list.push({
        ...base(t), type: 'pain', mode: 'checkin', intensity: r() < 0.05 ? null : v, trend: null, regions,
        qualities: v >= 5 ? ['Aching', 'Burning', 'Tingling'] : ['Aching', 'Stiff'], duration: v >= 5 ? 'Hours' : 'Minutes',
        impacts: { sleep: h === 9 ? (poorSleep ? 2 : 0) : null, concentration: v >= 5 ? 1 : 0, work: v >= 6 ? 2 : 0, movement: 1, daily: v >= 6 ? 1 : 0 },
        symptoms: v >= 6 ? ['Headache'] : [], postures: h === 14 && longDown ? ['down'] : [], activities: h === 14 ? ['Computer'] : [], slot,
        note: v >= 7 ? 'Pain shot down to my thumb after reading on the phone' : '',
      });
      if (v >= 5 && h === 14) {
        list.push({ ...base(t + 10 * 60e3), type: 'treatment', kind: 'medication', name: 'Ibuprofen', dose: '400 mg', helped: d === 0 ? null : r() < 0.6 ? 'little' : 'lot', sideEffects: r() < 0.2 ? ['Upset stomach'] : [] });
        list.push({ ...base(t + 2.5 * H), type: 'pain', mode: 'change', intensity: Math.max(1, v - 2), trend: 'better', regions: {}, qualities: [], duration: null, impacts: {}, symptoms: [], postures: [], activities: [], slot: null });
      }
      if (h === 20 && r() < 0.5) list.push({ ...base(t + 20 * 60e3), type: 'treatment', kind: 'heat', name: 'Heat', dose: '15 min', helped: 'little', sideEffects: [] });
    }
  }
  return list.filter((e) => e.time <= now);
}

const browser = await launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  colorScheme: dark ? 'dark' : 'light',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  acceptDownloads: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));
// Pretend to be the installed Home Screen app so the install hint doesn't cover screenshots.
await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
await page.goto(BASE + '#/today');
await page.waitForTimeout(600);
await page.evaluate(async (list) => {
  const db = await new Promise((res, rej) => { const q = indexedDB.open('neckline'); q.onsuccess = () => res(q.result); q.onerror = rej; });
  const tx = db.transaction(['entries', 'kv'], 'readwrite');
  for (const e of list) tx.objectStore('entries').put(e);
  tx.objectStore('kv').put({ name: 'Sample Person', surgeryDate: '2026-09-28', lastAppointment: new Date(Date.now() - 20 * 864e5).toLocaleDateString('en-CA'), nextAppointment: new Date(Date.now() + 3 * 864e5).toLocaleDateString('en-CA'), incision: { view: 'front', x: 152, y: 118, orient: 'h' }, treatments: [{ name: 'Ibuprofen', kind: 'medication', dose: '400 mg' }, { name: 'Heat', kind: 'heat', dose: '15 min' }], questions: [{ id: 'q1', text: 'Is the tingling in my right thumb expected at 7 weeks?', done: false }, { id: 'q2', text: 'When can I start driving longer distances?', done: false }], onboarded: true }, 'settings');
  await new Promise((r) => (tx.oncomplete = r));
}, sample());

const shot = async (name, full = true) => { await page.waitForTimeout(350); await page.screenshot({ path: `${out}/${name}.png`, fullPage: full }); console.log('shot', name); };
const tab = async (name) => { await page.goto(BASE + '#/' + name); await page.reload(); await page.waitForTimeout(500); };

await tab('today'); await shot('01-today');
await tab('timeline'); await shot('02-timeline');
await tab('patterns'); await shot('03-patterns');
await tab('report'); await shot('04-report');
await tab('settings'); await shot('05-settings');

await tab('today');
await page.click('text=Check in');
await page.click('.painscale-track button:nth-child(6)');
await page.click('.bodymap-svg path[aria-label^="Right front of neck"]', { position: { x: 14, y: 52 } });
await page.click('text=Tingling');
await page.click('.bodymap-svg path[aria-label^="Right hand – thumb"]');
await page.click('.chip:has-text("Burning")');
await shot('06-checkin-top', false);
await page.evaluate(() => document.querySelector('.sheet-body').scrollTo(0, 1100));
await shot('07-checkin-mid', false);
await page.evaluate(() => document.querySelector('.sheet-body').scrollTo(0, 99999));
await shot('08-checkin-end', false);
await page.click('.sheet-foot .btn.primary');
await page.waitForTimeout(300);
await shot('09-saved', false);

await page.click('.tab-plus');
await shot('10-add-menu', false);
await page.click('.list-row:has-text("Posture")');
await page.click('.tile:has-text("Looking down")');
await shot('11-posture', false);
await page.click('.sheet-head .icon-btn');

await tab('report');
await page.click('text=Create PDF summary');
await page.waitForSelector('text=Share or save', { timeout: 20000 });
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Share or save')]);
await dl.saveAs(`${out}/report.pdf`);
console.log('pdf saved');
const [csv] = await Promise.all([page.waitForEvent('download'), page.click('text=Spreadsheet (CSV)')]);
await csv.saveAs(`${out}/diary.csv`);
await browser.close();
