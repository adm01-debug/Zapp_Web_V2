import { navigateToView } from '@/hooks/system/useNavigationHistory';

/**
 * openContactInChat — fonte ÚNICA para abrir a conversa de um contato no Inbox.
 *
 * Contatos (useContactsCRUD) e Catálogo (useSendProduct) abrem a conversa pelo
 * MESMO mecanismo: não existe rota `?view=inbox&contact=<id>`, o Inbox recebe o
 * contato por evento (`open-contact-chat`, escutado em useRealtimeInbox) e o
 * parâmetro de URL só troca a view. Antes cada tela carregava a própria cópia
 * da cadeia de retry; a do Catálogo tinha as três proteções abaixo e a de
 * Contatos não (loop de 15 tentativas sem dono nem cancelamento). Agora existe
 * uma só função.
 *
 * Regras que a implementação precisa manter:
 * - CANCELA a cadeia anterior: uma chamada nova limpa o timer ainda agendado —
 *   duas cadeias concorrentes disputariam o mesmo `__pendingOpenContactId`.
 * - PARA ao ser consumida: o Inbox apaga `__pendingOpenContactId` ao tratar o
 *   evento; isso é a confirmação de entrega e encerra o retry (sem isso o
 *   evento era redisparado até 15 vezes depois de a conversa já estar aberta).
 * - LIMPA os timers: sem o `clearTimeout` o handle ficava pendente atravessando
 *   o teardown do jsdom (falha latente da suíte).
 * - SOBREVIVE ao ambiente: o callback do timer pode disparar depois de o jsdom
 *   sair de cena (ou em SSR, onde `window` nunca existiu); reavaliar o ambiente
 *   antes de tocar o DOM evita o `ReferenceError` que derrubava o `test:coverage`.
 */

/**
 * Timer da cadeia de retry ainda agendado.
 *
 * A função não é um hook: não existe cleanup de componente para pendurar a
 * limpeza, então o handle vive no módulo.
 */
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function clearRetryTimer(): void {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

export function openContactInChat(contactId: string): void {
  if (typeof window === 'undefined') return;
  const appWindow = window as Window & { __pendingOpenContactId?: string };
  // Uma chamada nova cancela a cadeia anterior.
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
    // O Inbox limpa `__pendingOpenContactId` ao consumir o evento: confirmada a
    // entrega, não há por que redisparar o evento nem deixar timer pendente.
    if (appWindow.__pendingOpenContactId !== contactId) return;
    if (attempts < 15) retryTimer = setTimeout(tryDispatch, 200);
  };
  retryTimer = setTimeout(tryDispatch, 150);
}
