// Drag along the spine with a real touch to select a range, give it one score, then separate it.
import { launch } from './browser.mjs';
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(process.argv[2] ?? 'http://localhost:4173/#/checkin');
await page.waitForTimeout(800);
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
const svg = await page.locator('.bodymap-svg').first().boundingBox();
const k = svg.width / 200;
const C = (i) => 74 + i * (64 / 7) + 64 / 14; // centre of cervical vertebra i (C1 = 0)
const at = (vy) => [svg.x + 100 * k, svg.y + (vy - 4) * k];
const rows = () => page.locator('.arow-line > .arow-label').allTextContents();

const y0 = await page.evaluate(() => scrollY);
const [x, a] = at(C(2)); // C3
await touch('touchStart', [[x, a]]);
for (let i = 1; i <= 12; i++) await touch('touchMove', [[x + (i % 2), a + (i / 12) * (C(5) - C(2)) * k]]); // to C6
await page.waitForTimeout(100);
const during = await page.locator('.vert.drag').count();
const flash = await page.locator('.map-flash').textContent();
await touch('touchEnd', []);
await page.waitForTimeout(200);
console.log('highlighted while dragging:', during, '| label:', flash, '| page scrolled:', (await page.evaluate(() => scrollY)) !== y0);
console.log('rows after drag:', await rows());

const sl = page.locator('.arow').first().locator('.slider');
await sl.evaluate((el) => el.scrollIntoView({ block: 'center' }));
const sb = await sl.boundingBox();
await page.touchscreen.tap(sb.x + sb.width * 0.8, sb.y + sb.height / 2);
await page.locator('.arow').first().locator('.kind:has-text("Stiff")').tap();
await page.screenshot({ path: 'shots/14-spine-range.png' });
await page.locator('.group-label').tap();
await page.waitForTimeout(150);
console.log('after separate:', await rows(), '| scores:', await page.locator('.arow .pain-pill').allTextContents());
console.log('stiff on all:', (await page.locator('.arow .kind.on:has-text("Stiff")').count()));

// Tapping one vertebra still toggles just that one.
await page.locator('.bodymap-svg').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
const svg2 = await page.locator('.bodymap-svg').first().boundingBox();
await page.touchscreen.tap(svg2.x + 100 * k, svg2.y + (C(0) - 4) * k);
await page.waitForTimeout(150);
console.log('after tapping C1:', await rows());
await b.close();
