// @node: F1.7
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installBrowserCssProbe } from './engine/checks/cssProbeBrowser';
import './styles.css';

installBrowserCssProbe(); // @node: F12.4
const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
