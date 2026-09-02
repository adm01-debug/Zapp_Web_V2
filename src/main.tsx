import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App.tsx';
import './index.css';
import './i18n'; // Initialize i18n
import { getLogger } from './lib/logger';
import { initWebVitals } from './lib/web-vitals';
import { ErrorBoundary } from './components/ErrorBoundary';
import { APP_BUILD_ID, startDeploymentUpdateMonitor } from './lib/deployment-update';

const log = getLogger('App');
if (window.performance && window.performance.mark) {
  performance.mark('main-init');
}
log.info('Initialized', { at: new Date().toISOString(), buildId: APP_BUILD_ID.slice(0, 12) });
startDeploymentUpdateMonitor();

// Global unhandled error handlers for resilience
window.addEventListener('unhandledrejection', (event) => {
  log.error('Unhandled promise rejection:', event.reason);
});

window.addEventListener('error', (event) => {
  log.error('Unhandled error:', event.error || event.message);
});

// Initialize Web Vitals monitoring
initWebVitals();

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

(window as Window & { __ZAPP_MARK_APP_MOUNTED__?: () => void }).__ZAPP_MARK_APP_MOUNTED__?.();

// No-op unless VITE_SENTRY_DSN is set (e.g. local dev without a Sentry
// account configured yet). Safe to leave unset — nothing below depends on it.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    integrations: [Sentry.browserTracingIntegration()],
  });
  log.info('[Sentry] initialized', { environment: import.meta.env.MODE });
}

// ErrorBoundary wraps the entire app so any unhandled render error
// shows a friendly UI instead of a blank screen.
ReactDOM.createRoot(rootElement).render(<App />);

// Accessibility auditing in development mode, deferred so it never blocks preview boot.
if (import.meta.env.DEV) {
  window.setTimeout(() => {
    import('@axe-core/react')
      .then((axe) => {
        axe.default(React, ReactDOM, 1000, undefined, undefined, (results) => {
          const violations = results?.violations;
          if (violations?.length) {
            log.warn(`[A11Y] ${violations.length} accessibility violation(s) detected`);
            violations.forEach((v) => {
              log.warn(
                `[A11Y] ${String(v.impact || 'UNKNOWN').toUpperCase()}: ${v.id} — ${v.description} (${v.nodes.length} element(s))`
              );
            });
          }
        });
        log.info('[A11Y] axe-core accessibility auditing enabled');
      })
      .catch((error) => {
        log.warn('[A11Y] Failed to load axe-core accessibility auditing', error);
      });
  }, 3000);
}
