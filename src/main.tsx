import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import '@fontsource-variable/newsreader/opsz.css';
import './styles/tokens.css';
import './styles/base.css';
import { App } from './App';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
