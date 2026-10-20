import { afterEach, expect, vi } from 'vitest';

/**
 * Prova de regressão "zero WebSocket" para os testes do IncomingCallAlert.
 *
 * O realtime-js captura o construtor de `WebSocket` na CONSTRUÇÃO do
 * SupabaseClient (`RealtimeClient._initializeOptions` →
 * `WebSocketFactory.getWebSocketConstructor()`), ou seja, na avaliação do
 * módulo `@/integrations/supabase/client` — que acontece na fase de imports do
 * arquivo de teste. Por isso `instalarEspiaoWebSocket` precisa ser chamada
 * dentro de `vi.hoisted` (executa antes dos imports); chamá-la no escopo de
 * módulo do teste seria tarde demais e o transporte real já teria sido
 * capturado.
 *
 * O dublê só ANOTA a url construída: mantém `url`, `readyState`,
 * `addEventListener`, `removeEventListener`, `send`, `close` (e os campos que o
 * socket do phoenix escreve: `binaryType`, `timeout`, `onopen`, `onerror`,
 * `onmessage`, `onclose`) para não explodir dentro do supabase-js quando o
 * cenário está VERMELHO (sem o mock do cliente). Nunca abre rede.
 */

const urlsObservadas: string[] = [];

class WebSocketFalso {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = 0;
  bufferedAmount = 0;
  binaryType = 'blob';
  protocol = '';
  extensions = '';
  timeout = 0;
  onopen: unknown = null;
  onerror: unknown = null;
  onmessage: unknown = null;
  onclose: unknown = null;
  send = vi.fn();
  close = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  dispatchEvent = vi.fn(() => true);

  constructor(url: string | URL, _protocols?: string | string[]) {
    this.url = String(url);
    urlsObservadas.push(this.url);
  }
}

/**
 * Instala o dublê no lugar do `WebSocket` global. Chamar via `vi.hoisted` no
 * topo do arquivo de teste (antes de qualquer import que puxe o cliente
 * Supabase). Devolve a lista de urls observadas.
 */
export function instalarEspiaoWebSocket(): string[] {
  vi.stubGlobal('WebSocket', WebSocketFalso);
  return urlsObservadas;
}

/**
 * Asserção versionada de regressão: nenhum cenário do arquivo pode construir
 * WebSocket real. Registra um `afterEach` que falha listando as urls — chamar
 * uma vez, no escopo de módulo do arquivo de teste, depois de instalar o
 * espião.
 */
export function registrarGuardaDeWebSocket(): void {
  afterEach(() => {
    const vistos = urlsObservadas.splice(0, urlsObservadas.length);
    expect(
      vistos,
      'o IncomingCallAlert não pode abrir WebSocket real — duble @/integrations/supabase/client',
    ).toEqual([]);
  });
}
