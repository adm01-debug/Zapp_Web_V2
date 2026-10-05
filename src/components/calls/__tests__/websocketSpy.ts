/**
 * Espião do construtor global de `WebSocket`, compartilhado pelas provas do
 * `IncomingCallAlert`.
 *
 * Contexto: `useTerminoRemoto` assina `public.calls` pelo cliente padrão do
 * Supabase (`supabase.channel(...).on(...).subscribe()`). O `RealtimeClient`
 * resolve o construtor de `WebSocket` **quando o cliente é criado** — ou seja, no
 * import de `@/integrations/supabase/client` — e guarda a referência para abrir a
 * conexão no `subscribe()`. A guarda de rede de `src/test/setup.ts` só troca o
 * `fetch`: o WebSocket passa direto e abre conexão real durante o teste.
 *
 * Este módulo troca `globalThis.WebSocket` por um dublê que só ANOTA a
 * construção e nunca fala com a rede. A asserção "nenhuma construção" vira o
 * teste de regressão do reparo: enquanto o dublê do cliente Supabase
 * (`vi.mock('@/integrations/supabase/client', ...)`) estiver no arquivo de teste,
 * a lista fica vazia; se esse dublê sair, o socket real volta e a lista deixa de
 * ser vazia.
 *
 * O espião é instalado na AVALIAÇÃO deste módulo — por isso o arquivo de teste
 * precisa importá-lo ANTES de `../IncomingCallAlert`: quando o componente carrega
 * `@/integrations/supabase/client`, o construtor já tem de estar dublado.
 */

/** URLs entregues ao construtor global de `WebSocket` desde a instalação. */
export const construcoesWebSocket: string[] = [];

const construtorOriginal: typeof WebSocket | undefined = globalThis.WebSocket;

/**
 * Dublê do `WebSocket`: registra a URL construída e não abre conexão nenhuma.
 * Implementa só a superfície que o transporte do realtime toca (`binaryType`,
 * `timeout`, os quatro handlers e `close`).
 */
class WebSocketEspiao {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readonly url: string;
  readyState = 0;
  binaryType: BinaryType = 'blob';
  bufferedAmount = 0;
  extensions = '';
  protocol = '';
  timeout = 0;
  onopen: ((evento: Event) => void) | null = null;
  onerror: ((evento: Event) => void) | null = null;
  onclose: ((evento: CloseEvent) => void) | null = null;
  onmessage: ((evento: MessageEvent) => void) | null = null;

  constructor(url: string | URL) {
    this.url = String(url);
    construcoesWebSocket.push(this.url);
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return false;
  }
  send(): void {}
  close(): void {
    this.readyState = WebSocketEspiao.CLOSED;
  }
}

Object.defineProperty(globalThis, 'WebSocket', {
  configurable: true,
  writable: true,
  value: WebSocketEspiao,
});

/** Devolve ao global o construtor original de `WebSocket`. */
export function restaurarWebSocket(): void {
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    writable: true,
    value: construtorOriginal,
  });
}
