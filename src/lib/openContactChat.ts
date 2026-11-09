import { navigateToView } from '@/hooks/system/useNavigationHistory';

/**
 * Timer da cadeia de retry de `openContactChat` que ainda está agendado.
 *
 * `openContactChat` não é um hook: não existe cleanup de componente para
 * pendurar a limpeza, então o handle vive no módulo. Sem ele o `clearTimeout`
 * não tinha onde ser chamado e a cadeia seguia disparando o evento até 15
 * vezes depois de a inbox já ter aberto o contato — o último timer ficava
 * pendente atravessando o teardown do jsdom (falha latente da suíte).
 */
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function clearRetryTimer(): void {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

/**
 * CT-06 — abre a conversa do contato no inbox a partir do toast de sucesso.
 *
 * Não existe rota `?view=inbox&contact=<id>`: o inbox recebe a conversa por
 * evento (`open-contact-chat`, escutado em useRealtimeInbox) e o parâmetro de
 * URL só troca a view. É o mesmo mecanismo já usado por useContactsCRUD
 * .openContactChat — repetir a tentativa cobre a view do inbox ainda montando.
 */
export function openContactChat(contactId: string): void {
  // O retry abaixo agenda timers que podem disparar depois de o ambiente de
  // execução sair de cena (jsdom desmontado no fim da suíte, ou SSR onde
  // `window` nunca existiu). Sem esta guarda o callback estoura
  // `ReferenceError: window is not defined` fora de qualquer try/catch e
  // derruba o processo — era isso que reprovava o `test:coverage` do CI.
  if (typeof window === 'undefined') return;
  const appWindow = window as Window & { __pendingOpenContactId?: string };
  // Uma chamada nova cancela a cadeia anterior: duas cadeias concorrentes
  // disputariam o mesmo `__pendingOpenContactId`.
  clearRetryTimer();
  appWindow.__pendingOpenContactId = contactId;
  if (new URLSearchParams(window.location.search).get('view') !== 'inbox') {
    navigateToView('inbox');
  }
  let attempts = 0;
  const tryDispatch = () => {
    retryTimer = null;
    attempts++;
    // O timer sobrevive ao ambiente (teardown do jsdom): reavaliar antes de
    // tocar o DOM evita o ReferenceError e encerra a cadeia de retry.
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('open-contact-chat', { detail: { contactId } }));
    // A inbox limpa `__pendingOpenContactId` ao consumir o evento
    // (useRealtimeInbox): isso é a confirmação de entrega. Confirmada, a
    // cadeia para aqui — não há por que redisparar o evento nem deixar timer
    // pendente para o teardown do jsdom.
    if (appWindow.__pendingOpenContactId !== contactId) return;
    if (attempts < 15) retryTimer = setTimeout(tryDispatch, 200);
  };
  retryTimer = setTimeout(tryDispatch, 150);
}
