import { render } from 'preact';
import './styles.css';
import { App, registerSW } from './app';
import { init } from './lib/store';

init().then(registerSW);
render(<App />, document.getElementById('app')!);
