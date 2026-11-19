// Primeiro de tudo: Zod sem `new Function` (CSP sem unsafe-eval). Ver src/lib/zodJitless.ts.
import "./lib/zodJitless";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n"; // Initialize i18n 
import { getLogger } from "./lib/logger";
import { initWebVitals } from "./lib/web-vitals";
import { AppErrorBoundary } from "./providers/AppProviders";
import { APP_BUILD_ID, startDeploymentUpdateMonitor } from "./lib/deployment-update";
import { reportClientError } from "./lib/errorReporter";
import { aplicarTamanhoDoChatSalvo } from "./components/theme/useChatTextSize";

const log = getLogger('App');
if (window.performance && typeof window.performance.mark === 'function') {
  performance.mark('main-init');
}

// Aparência: aplica o tamanho do texto do chat lembrado ANTES do primeiro render, para a
// escolha do usuário valer no chat sem depender de ele abrir a aba Aparência nesta sessão.
// Lê de localStorage com try/catch (modo privado/SSR não quebra o boot).
aplicarTamanhoDoChatSalvo();
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
// O ErrorBoundary MAIS EXTERNO envolve o AppProviders (dentro de <App />) para
// cobrir o caso que o boundary interno do provider nao alcanca: erro no proprio
// AuthProvider/QueryClient durante o primeiro render. Sem ele, esse erro subia
// ate o ReactDOM e virava tela branca.
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);

// Accessibility auditing in development mode, deferred so it never blocks preview boot.
//
// Fica FORA da automacao (`navigator.webdriver`). O E2E roda contra este mesmo
// dev server, e aqui o custo nao e' o aviso no console: o dev server entrega
// 4.559.240 bytes de `@axe-core/react` (medido em 16/11/2026) para dentro da
// pagina, e o `axe.default(..., 1000, ...)` abaixo re-audita a arvore React
// INTEIRA a cada ciclo de render, para sempre. Somado ao `axe.min.js` que as
// specs injetam por conta propria (+580 KB), isso derrubava o processo de
// conteudo do Firefox com `Page crashed` nos testes do painel CRM
// (`e2e/email-navy-visual.spec.ts:343` e `:418`).
//
// Nenhuma cobertura se perde: toda spec que afere acessibilidade injeta o
// proprio axe (`addScriptTag`) e afirma `violations` — ver
// `a11y-tarefas-dashboard.spec.ts:16`, `monitoring.spec.ts:28` e
// `email-navy-visual.spec.ts:154`. Esta auditoria do app so escreve aviso no
// console; nao afirma nada.
// `navigator.webdriver` sozinho NAO resolveu o `Page crashed`: depois de o adicionar
// (#3190, 16/11), o crash parou de sortear vitima e passou a cair SEMPRE em
// `email-navy-visual.spec.ts:343`, nas duas tentativas, em 8 de 8 tentativas de 4 jobs
// de CI (134120598224, 134152512413, 135270304713, 135270180565) -- e so no Firefox.
//
// MEDIDO: `navigator.webdriver` e `true` no Chromium do Playwright, o que explica
// `chromium-email-navy` e `webkit-email-navy` nunca caírem.
// NAO VERIFICADO: o valor dele no Firefox do Playwright. Nao ha binario de Firefox neste
// ambiente e o download e barrado pelo proxy de egress. O que se sabe do codigo e que o
// Playwright nao seta esse campo em JS (`grep -rn webdriver node_modules/playwright-core/lib/`
// devolve um unico comentario) e que o Firefox dele sobe sob Juggler, sem Marionette.
//
// Independente do mecanismo, depender de adivinhar o browser e frágil. `VITE_A11Y_AUDIT_CONTINUO`
// e explicita e vale nos tres engines: o proprio `playwright.config.ts` a define no dev
// server que o E2E sobe.
if (
  import.meta.env.DEV
  && import.meta.env.VITE_A11Y_AUDIT_CONTINUO !== 'off'
  && !navigator.webdriver
) {
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
