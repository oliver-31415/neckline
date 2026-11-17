// Pinch-zoom the body diagram with real multi-touch events, tap an area while zoomed, then reset.
import { launch } from './browser.mjs';
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(process.argv[2] ?? 'http://localhost:4173/#/checkin');
await page.waitForTimeout(800);
const cdp = await ctx.newCDPSession(page);
const box = await page.locator('.zoom-box').boundingBox();
const cx = box.x + box.width * 0.35, cy = box.y + box.height * 0.3; // around the neck
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
await touch('touchStart', [[cx - 20, cy], [cx + 20, cy]]);
for (let i = 1; i <= 10; i++) await touch('touchMove', [[cx - 20 - i * 8, cy], [cx + 20 + i * 8, cy]]);
await touch('touchEnd', []);
await page.waitForTimeout(300);
const t1 = await page.locator('.zoom-inner').evaluate((el) => el.style.transform);
const pageZoom = await page.evaluate(() => visualViewport.scale);
console.log('after pinch:', t1, '| page zoom:', pageZoom);
await page.screenshot({ path: 'shots/13-zoomed.png' });
// Tap an area while zoomed.
await page.touchscreen.tap(cx, cy + 10);
await page.waitForTimeout(200);
console.log('marked while zoomed:', await page.locator('.arow-label').allTextContents());
// One-finger drag off the spine pans (on the spine it selects a range).
await touch('touchStart', [[cx - 120, cy]]);
for (let i = 1; i <= 6; i++) await touch('touchMove', [[cx - 120 + i * 10, cy + i * 10]]);
await touch('touchEnd', []);
console.log('after drag:', await page.locator('.zoom-inner').evaluate((el) => el.style.transform), '| marked:', (await page.locator('.arow-label').allTextContents()).length);
await page.click('[aria-label="Zoom out fully"]');
await page.waitForTimeout(400);
console.log('after reset:', await page.locator('.zoom-inner').evaluate((el) => el.style.transform), '| reset button gone:', (await page.locator('[aria-label="Zoom out fully"]').count()) === 0);
// Pinch elsewhere on the page must not zoom it.
await touch('touchStart', [[150, 120], [240, 120]]);
for (let i = 1; i <= 8; i++) await touch('touchMove', [[150 - i * 10, 120], [240 + i * 10, 120]]);
await touch('touchEnd', []);
await page.waitForTimeout(300);
console.log('page zoom after pinching the page:', await page.evaluate(() => visualViewport.scale));
await b.close();
