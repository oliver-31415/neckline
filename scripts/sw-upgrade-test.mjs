// Simulates a deploy: install version A, swap the server to version B (A's files gone), reopen.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';
import { launch } from './browser.mjs';

const [dirA, dirB] = process.argv.slice(2);
let root = dirA;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/neckline/, ''));
  if (p.endsWith('/')) p += 'index.html';
  try {
    const body = await readFile(join(root, p));
    res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream', 'cache-control': 'max-age=600' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nope'); }
}).listen(4180);

const b = await launch();
const exe = b._options?.executablePath;
await b.close();
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'nl-')), { headless: true, executablePath: exe, viewport: { width: 390, height: 844 } });
const page = ctx.pages()[0] ?? await ctx.newPage();
const tabs = async () => (await page.locator('.tab').allTextContents()).join(',');
await page.goto('http://localhost:4180/neckline/');
await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
await page.reload(); await page.waitForTimeout(1000);
console.log('A:', await tabs());
root = dirB; // deploy B; A's asset files no longer exist
for (let i = 1; i <= 3; i++) {
  await page.reload(); await page.waitForTimeout(1500);
  const sw = await page.evaluate(async () => ({ active: (await navigator.serviceWorker.getRegistration())?.active?.scriptURL, caches: await caches.keys() }));
  console.log(`after deploy, open ${i}:`, await tabs() || 'WHITE PAGE', JSON.stringify(sw.caches));
}
await ctx.route('**/*', (r) => r.abort()); // offline
await page.reload().catch(() => {}); await page.waitForTimeout(1500);
console.log('offline:', await tabs() || 'WHITE PAGE');
await ctx.close();
server.close();
