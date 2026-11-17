import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

// Emits sw.js with the full list of built files so the app works fully offline.
function serviceWorker(): Plugin {
  return {
    name: 'neckline-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const publicFiles: string[] = [];
      const walk = (dir: string) => {
        for (const f of readdirSync(dir)) {
          const p = join(dir, f);
          if (statSync(p).isDirectory()) walk(p);
          else publicFiles.push(relative('public', p).split('\\').join('/'));
        }
      };
      walk('public');
      const files = ['./', ...Object.keys(bundle), ...publicFiles]
        .filter((f) => !f.endsWith('.map') && f !== 'sw.js')
        .map((f) => (f.startsWith('./') ? f : './' + f));
      const version = createHash('sha256').update(files.join('|')).digest('hex').slice(0, 12);
      const source = readFileSync('src/sw.js', 'utf8')
        .replace('__PRECACHE__', JSON.stringify(files))
        .replace('__VERSION__', version);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [preact(), serviceWorker()],
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
});
