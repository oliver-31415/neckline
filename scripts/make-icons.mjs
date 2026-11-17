import { readFileSync, writeFileSync } from 'node:fs';
import { launch } from './browser.mjs';

const svg = readFileSync('public/icons/icon.svg', 'utf8');
const browser = await launch();
const page = await browser.newPage();
async function render(size, file, { maskable = false, square = false } = {}) {
  await page.setViewportSize({ width: size, height: size });
  const inner = maskable
    ? `<div style="width:${size}px;height:${size}px;background:#0d5e66;display:grid;place-items:center"><img src="data:image/svg+xml;base64,${Buffer.from(svg.replace('rx="112"', 'rx="0"')).toString('base64')}" style="width:${size}px;height:${size}px"></div>`
    : `<img src="data:image/svg+xml;base64,${Buffer.from(square ? svg.replace('rx="112"', 'rx="0"') : svg).toString('base64')}" style="width:${size}px;height:${size}px;display:block">`;
  await page.setContent(`<html><body style="margin:0;background:transparent">${inner}</body></html>`);
  writeFileSync(file, await page.screenshot({ omitBackground: !square && !maskable }));
}
await render(180, 'public/icons/apple-touch-icon.png', { square: true }); // iOS rounds corners itself
await render(192, 'public/icons/icon-192.png');
await render(512, 'public/icons/icon-512.png');
await render(512, 'public/icons/icon-512-maskable.png', { maskable: true });
await browser.close();
console.log('icons written');
