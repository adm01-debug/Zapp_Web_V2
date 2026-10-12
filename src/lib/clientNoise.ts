/**
 * Filtro de ruído benigno dos eventos globais de erro do browser.
 *
 * Fonte única da verdade usada pelos handlers de `window` em `src/main.tsx`.
 * Ruído benigno é silenciado de verdade: `preventDefault()` + `return`, SEM log
 * e SEM `reportClientError` — assim ele não gasta a cota de 10 envios por sessão
 * do errorReporter (src/lib/errorReporter.ts) e não aparece como erro real.
 *
 * O que é ruído (e NUNCA deve ser confundido com erro real):
 * - `ResizeObserver loop ...` (limit exceeded / completed with undelivered
 *   notifications): aviso esperado do browser em app com observação contínua de
 *   layout; não tem stack acionável.
 * - `Script error.`: erro cross-origin entrega mensagem sem detalhes nem stack.
 *   SOMENTE a mensagem "pura" — `Script error: TypeError: x is not a function`
 *   é acionável e segue o fluxo normal.
 * - `Extension context invalidated` / `chrome-extension://` / `moz-extension://`:
 *   erro de extensão do browser, fora do controle do app.
 * - `AbortError`: cancelamento de navegação/render (ex.: unmount com request em
 *   voo) — rejeição esperada, não bug.
 * - `TimeoutError` / `InvalidStateError` por `name`: o App.tsx já silenciava
 *   esses dois nos handlers de `useEffect`; a paridade é mantida aqui para não
 *   reintroduzir o log de storage/IDB/service worker.
 */

const BENIGN_MESSAGE_SUBSTRINGS: readonly string[] = [
  'resizeobserver loop',
  'extension context invalidated',
  'chrome-extension://',
  'moz-extension://',
];

const BENIGN_ERROR_NAMES: readonly string[] = [
  'AbortError',
  'TimeoutError',
  'InvalidStateError',
  'ResizeObserver',
];

function extractName(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error) {
    const name = (error as { name?: unknown }).name;
    return typeof name === 'string' ? name : '';
  }
  return '';
}

function extractMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : '';
  }
  return '';
}

/** "Script error." sem nada depois — o ruído cross-origin puro (CORS). */
function isBareScriptError(message: string): boolean {
  return message.trim().toLowerCase().replace(/\.+$/, '') === 'script error';
}

/**
 * Retorna `true` quando `error` é ruído benigno conhecido do browser e deve ser
 * silenciado pelos handlers globais (sem log, sem reportClientError). Erro real
 * retorna `false` e segue o fluxo normal.
 */
export function isBenignClientNoise(error: unknown): boolean {
  const name = extractName(error);
  if (BENIGN_ERROR_NAMES.includes(name)) return true;

  const message = extractMessage(error);
  if (!message) return false;
  if (isBareScriptError(message)) return true;

  const lowered = message.toLowerCase();
  return BENIGN_MESSAGE_SUBSTRINGS.some((substring) => lowered.includes(substring));
}

export interface ClientErrorHandlerDeps {
  /** Log de erro do app (logger real em produção; espião nos testes). */
  logError: (message: string, detail: unknown) => void;
  /** reportClientError — chamado NO MÁXIMO uma vez por evento real. */
  report: (error: unknown, context: Record<string, unknown>) => void;
}

/**
 * Cria o par de handlers globais. `src/main.tsx` registra este par UMA vez em
 * `window` ("unhandledrejection" e "error"); o App.tsx não registra mais nada,
 * então um erro real passa por um handler só (um log e um report).
 */
export function createClientErrorHandlers(deps: ClientErrorHandlerDeps) {
  const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    if (isBenignClientNoise(event.reason)) {
      event.preventDefault();
      return;
    }
    deps.logError('Unhandled promise rejection:', event.reason);
    deps.report(event.reason, { source: 'unhandledrejection' });
  };

  const onWindowError = (event: ErrorEvent): void => {
    const detail = event.error || event.message;
    if (isBenignClientNoise(event.error) || isBenignClientNoise(event.message)) {
      event.preventDefault();
      return;
    }
    deps.logError('Unhandled error:', detail);
    deps.report(detail, { source: 'window.onerror' });
  };

  return { onUnhandledRejection, onWindowError };
}
