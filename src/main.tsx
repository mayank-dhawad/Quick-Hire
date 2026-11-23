import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { registerServiceWorker } from './lib/pwaRegister';

// Register PWA service worker with automatic cache management
registerServiceWorker({
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('quickhire:pwa-update-ready'));
  },
  onOfflineReady() {
    console.log('[QuickHire PWA] Application precached and ready for offline use.');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
