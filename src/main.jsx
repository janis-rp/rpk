window.addEventListener('error', (e) =>
  console.error('Window error', e.error || e),
);
window.addEventListener('unhandledrejection', (e) =>
  console.error('Unhandled', e.reason),
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
