import { chromium } from 'playwright-core';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Uses an already-downloaded Playwright Chromium (headless; never touches the desktop).
export async function launch() {
  const root = join(homedir(), '.cache/ms-playwright');
  const dirs = existsSync(root) ? readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) {
    const exe = join(root, d, 'chrome-linux64/chrome');
    if (existsSync(exe)) return chromium.launch({ executablePath: exe, headless: true });
  }
  return chromium.launch({ headless: true });
}
