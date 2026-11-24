// End-to-end test of the assistant against scripts/mock-ai.mjs (no real API key needed).
// Runs the chat once on the Claude path and once on the OpenAI-compatible path.
import { readFileSync } from 'node:fs';
import { launch } from './browser.mjs';

const BASE = process.env.BASE ?? 'http://localhost:4173/';
const MOCK = process.env.MOCK ?? 'http://127.0.0.1:8790';
const LOG = process.env.LOG ?? '/tmp/mock-ai.json';
const SHOTS = process.env.SHOTS ?? 'shots';
const browser = await launch();
const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };

async function run(provider) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail('page error ' + e.message));
  await page.goto(BASE + '#/report');
  await page.evaluate(async ({ provider, MOCK }) => {
    const db = await new Promise((r) => { const q = indexedDB.open('neckline', 1); q.onupgradeneeded = () => { const d = q.result; d.createObjectStore('entries', { keyPath: 'id' }).createIndex('time', 'time'); d.createObjectStore('photos'); d.createObjectStore('kv'); }; q.onsuccess = () => r(q.result); });
    const tx = db.transaction(['entries', 'kv'], 'readwrite');
    const now = Date.now(), H = 3600e3;
    const pain = (id, t, v, note) => ({ id, type: 'pain', mode: 'checkin', time: now - t * H, createdAt: now, updatedAt: now, intensity: v, regions: { 'spine-C5': 'ache' }, levels: { 'spine-C5': v }, kinds: { 'spine-C5': ['ache'] }, qualities: [], impacts: {}, symptoms: [], postures: [], activities: [], note });
    for (const e of [
      pain('p1', 50, 7, 'SECRET-NOTE do not share'), pain('p2', 30, 4), pain('p3', 26, 6), pain('p4', 5, 3),
      { id: 'c1', type: 'posture', posture: 'couch', minutes: 120, breaks: null, time: now - 52 * H, createdAt: now, updatedAt: now },
      { id: 'c2', type: 'posture', posture: 'couch', minutes: 90, breaks: null, time: now - 28 * H, createdAt: now, updatedAt: now },
    ]) tx.objectStore('entries').put(e);
    tx.objectStore('kv').put({ onboarded: true, version: 3, name: 'PRIVATE NAME', ai: { provider, keys: { [provider]: 'test-key-123' }, models: { other: 'mock-model-a' }, endpoints: { claude: MOCK, other: MOCK + '/v1' }, notes: false } }, 'settings');
    await new Promise((r) => (tx.oncomplete = r));
  }, { provider, MOCK });
  await page.reload();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Ask the assistant' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/ai-01-empty-${provider}.png` });
  await page.locator('.suggest', { hasText: 'Write a report' }).click();
  await page.locator('.approval.waiting').waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${SHOTS}/ai-02-approval-${provider}.png` });
  console.log(`[${provider}] approval:`, (await page.locator('.approval-title').innerText()).trim());
  await page.locator('.approval .btn.primary').click();
  await page.locator('.chat-file').waitFor({ timeout: 20000 });
  await page.locator('.bubble.ai', { hasText: 'Your report is ready' }).waitFor({ timeout: 15000 });
  await page.locator('.tool-chip').first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/ai-03-done-${provider}.png` });
  console.log(`[${provider}] chips:`, (await page.locator('.tool-chip').allInnerTexts()).join(' | '));
  console.log(`[${provider}] file:`, (await page.locator('.chat-file').innerText()).replace(/\s+/g, ' '));
  const qs = await page.evaluate(async () => {
    const db = await new Promise((r) => { const q = indexedDB.open('neckline', 1); q.onsuccess = () => r(q.result); });
    return new Promise((r) => { const q = db.transaction('kv').objectStore('kv').get('settings'); q.onsuccess = () => r(q.result.questions); });
  });
  console.log(`[${provider}] questions now:`, qs.map((q) => q.text));
  const sent = readFileSync(LOG, 'utf8');
  if (sent.includes('SECRET-NOTE')) fail('notes were sent with "Share my notes" off');
  if (sent.includes('PRIVATE NAME')) fail('the name was sent');
  const reqs = JSON.parse(sent).filter((r) => !r.path.endsWith('/models'));
  const last = reqs[reqs.length - 1];
  console.log(`[${provider}] requests: ${reqs.length}, model: ${last.body.model}, browser header: ${last.headers.browser}, tools: ${last.body.tools.length}`);
  if (provider === 'claude') console.log('[claude] effort:', JSON.stringify(last.body.output_config), 'eager:', last.body.tools.every((t) => t.eager_input_streaming));
  await ctx.close();
}

/** Logging from the chat: a bad call is rejected, the good one waits for Save, then lands like a check-in. */
async function runLog(provider) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail('page error ' + e.message));
  await page.goto(BASE + '#/history');
  await page.evaluate(async ({ provider, MOCK }) => {
    const db = await new Promise((r) => { const q = indexedDB.open('neckline', 1); q.onupgradeneeded = () => { const d = q.result; d.createObjectStore('entries', { keyPath: 'id' }).createIndex('time', 'time'); d.createObjectStore('photos'); d.createObjectStore('kv'); }; q.onsuccess = () => r(q.result); });
    const tx = db.transaction(['kv'], 'readwrite');
    tx.objectStore('kv').put({ onboarded: true, version: 3, treatments: [{ name: 'Paracetamol', kind: 'medication', dose: '1 g' }], ai: { provider, keys: { [provider]: 'test-key-123' }, models: { other: 'mock-model-a' }, endpoints: { claude: MOCK, other: MOCK + '/v1' }, notes: false } }, 'settings');
    await new Promise((r) => (tx.oncomplete = r));
  }, { provider, MOCK });
  await page.reload();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Ask the assistant' }).click();
  await page.locator('.chat-input').fill('LOG-TEST neck 6 after driving 90 min, took paracetamol');
  await page.locator('.chat-send').click();
  await page.locator('.approval.waiting').waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${SHOTS}/ai-04-log-${provider}.png` });
  console.log(`[${provider}] log card:`, (await page.locator('.approval').innerText()).replace(/\n+/g, ' | '));
  const before = await page.evaluate(() => new Promise((r) => { const q = indexedDB.open('neckline', 1); q.onsuccess = () => { const c = q.result.transaction('entries').objectStore('entries').count(); c.onsuccess = () => r(c.result); }; }));
  if (before !== 0) fail('entries saved before Save was tapped');
  await page.locator('.approval .btn.primary', { hasText: 'Save' }).click();
  await page.locator('.bubble.ai', { hasText: 'Saved.' }).waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${SHOTS}/ai-05-logged-${provider}.png` });
  const chips = await page.locator('.tool-chip').evaluateAll((els) => els.map((e) => `${e.textContent}:${e.className.replace('tool-chip ', '')}`));
  console.log(`[${provider}] chips:`, chips.join(' | '));
  if (!chips.some((c) => c.startsWith('Log 1 entry:error'))) fail('the bad log call was not rejected');
  const { list, settings } = await page.evaluate(() => new Promise((r) => { const q = indexedDB.open('neckline', 1); q.onsuccess = () => {
    const tx = q.result.transaction(['entries', 'kv']); const a = tx.objectStore('entries').getAll(); const b = tx.objectStore('kv').get('settings');
    tx.oncomplete = () => r({ list: a.result, settings: b.result });
  }; }));
  const by = (t) => list.filter((e) => e.type === t);
  const pain = by('pain').find((e) => Object.keys(e.regions).length);
  const sym = by('pain').find((e) => !Object.keys(e.regions).length);
  const med = by('treatment')[0], post = by('posture')[0], day = by('day')[0];
  const check = (ok, m) => (ok ? console.log(`[${provider}] ok:`, m) : fail(`[${provider}] ${m}`));
  check(list.length === 5, `5 entries saved (${list.length})`);
  check(pain && Object.keys(pain.regions).sort().join() === 'forearm-R,spine-C4,spine-C5,spine-C6' && pain.intensity === 6 && pain.levels['spine-C5'] === 6 && pain.kinds['forearm-R'][0] === 'tingling' && pain.duration === '1 h' && pain.impacts.sleep === 1, 'pain areas, levels, feel, lasted, impact');
  check(sym && sym.symptoms.join() === 'Headache,Ear ringing' && sym.symptomLevels.Headache === 3 && sym.intensity === null, 'symptom names matched, strength kept');
  check(med && med.name === 'Paracetamol' && med.kind === 'medication' && med.dose === '1 g', 'medication matched to saved name');
  check(post && post.posture === 'car' && post.minutes === 90 && Math.abs(Date.now() - post.time - 90 * 60e3) < 5 * 60e3, 'posture starts 90 min ago');
  check(day && day.sleepHours === 6 && day.sleepQuality === 'poor' && !day.group, 'sleep & day');
  check(new Set([pain, sym, med, post].map((e) => e?.group)).size === 1 && pain?.group, 'saved together as one group');
  check(settings.symptoms.includes('Ear ringing'), 'new symptom remembered');
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => new Promise((r) => { const q = indexedDB.open('neckline', 1); q.onsuccess = () => { const c = q.result.transaction('entries').objectStore('entries').count(); c.onsuccess = () => r(c.result); }; }));
  check(after === 0, `Undo removes them (${after} left)`);
  await ctx.close();
}

await run('claude');
await run('other');
await runLog('claude');
await runLog('other');
await browser.close();
