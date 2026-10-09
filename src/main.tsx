import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n"; // Initialize i18n 
import { getLogger } from "./lib/logger";
import { initWebVitals } from "./lib/web-vitals";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { APP_BUILD_ID, startDeploymentUpdateMonitor } from "./lib/deployment-update";
import { reportClientError } from "./lib/errorReporter";

const log = getLogger('App');
if (window.performance && typeof window.performance.mark === 'function') {
  performance.mark('main-init');
}
log.info('Initialized', { at: new Date().toISOString(), buildId: APP_BUILD_ID.slice(0, 12) });
startDeploymentUpdateMonitor();

// Global unhandled error handlers for resilience
window.addEventListener('unhandledrejection', (event) => {
  log.error('Unhandled promise rejection:', event.reason);
  reportClientError(event.reason, { source: 'unhandledrejection' });
});

window.addEventListener('error', (event) => {
  log.error('Unhandled error:', event.error || event.message);
  reportClientError(event.error ?? event.message, { source: 'window.onerror' });
});

// Initialize Web Vitals monitoring (alvos de performance-budget.json) + envio ao Speed Insights
initWebVitals();
// Speed Insights num módulo lazy: não entra no bundle inicial (a folga do orçamento é pequena).
void import("./lib/speed-insights").then((m) => m.initSpeedInsights());

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error('Root element not found');
}

(window as Window & { __ZAPP_MARK_APP_MOUNTED__?: () => void }).__ZAPP_MARK_APP_MOUNTED__?.();

// ErrorBoundary wraps the entire app so any unhandled render error
// shows a friendly UI instead of a blank screen.
//
// E38: StrictMode ligado. O código ja tinha defesas escritas PARA ele
// (useSupabaseRealtime, TelefoniaView, team-chat citam o remount em comentario),
// mas ele nunca foi montado — entao nenhuma dessas defesas era exercitada.
// Em 19.3 o StrictMode monta/desmonta e re-renderiza duas vezes em dev,
// expondo efeitos sem cleanup e impurezas de render. E so em desenvolvimento.
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Accessibility auditing in development mode, deferred so it never blocks preview boot.
if (import.meta.env.DEV) {
  window.setTimeout(() => {
    import('@axe-core/react').then((axe) => {
      axe.default(React, ReactDOM, 1000, undefined, undefined, (results) => {
        // O axe audita a cada ciclo de render. Sem esperar o app montar, ele mede
        // arvores transitorias e reporta o que nao existe no estado final:
        // landmark-one-main e page-has-heading-one "faltando", aria-hidden-focus em
        // subarvores que o React remove na hidratacao e aria-input-field-name em
        // campo que ganha nome depois. Medido em 02/10/2026: tres varreduras com
        // axe no DOM assentado nao encontram nenhuma dessas regras.
        if (!document.querySelector('main')) return;
        const violations = results?.violations;
        if (violations?.length) {
          log.warn(`[A11Y] ${violations.length} accessibility violation(s) detected`);
          violations.forEach((v) => {
            log.warn(`[A11Y] ${String(v.impact || 'UNKNOWN').toUpperCase()}: ${v.id} — ${v.description} (${v.nodes.length} element(s))`);
          });
        }
      });
      log.info('[A11Y] axe-core accessibility auditing enabled');
    }).catch((error) => {
      log.warn('[A11Y] Failed to load axe-core accessibility auditing', error);
    });
  }, 3000);
}
