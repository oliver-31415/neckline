import { render } from 'preact';
import './styles.css';
import { App, registerSW } from './app';
import { init } from './lib/store';
import { startAutoBackup } from './lib/cloud';

// iOS ignores user-scalable=no, so block its pinch gesture directly; the body diagram handles its own zoom.
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });

init().then(() => { registerSW(); startAutoBackup(); });
render(<App />, document.getElementById('app')!);
