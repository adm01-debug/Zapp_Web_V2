/**
 * Dedupe de envio entre abas (SL-070 · item 026 do inventário de paridade V1/V3).
 *
 * O problema real: o mesmo agente com o Zapp aberto em duas abas manda a mesma
 * mensagem (mesmo contato, mesmo conteúdo, mesmo anexo) em cada aba. Sem
 * coordenação são DUAS chamadas a `enqueue_outbound_message` e duas linhas
 * enfileiradas. O contrato aqui é: a mesma AÇÃO dispara UM request — a segunda
 * aba não fala com o servidor, ela adota o `clientMessageId` da aba dona (a
 * chave estável que a idempotência do item 024 já usa no servidor).
 *
 * Como a disputa é resolvida (mesma filosofia da eleição de aba de chamadas,
 * `src/lib/calls/tabLeaderStore.ts`): cada aba publica a própria reivindicação e
 * espera um tick antes de decidir. Se uma reivindicação rival aparecer dentro da
 * janela, ela vence por `(at, tabId)` — quem publicou primeiro, e no empate o id
 * de aba menor. Os dois lados veem as duas reivindicações, então exatamente uma
 * vence; nunca as duas e nunca nenhuma.
 *
 * Módulo puro: sem React, sem DOM obrigatório. Sem `BroadcastChannel` (ou com o
 * canal lançando) a aba age sozinha — a coordenação degrada, o envio nunca para
 * por falta de canal.
 */

export const SEND_DEDUPE_CHANNEL_NAME = 'zapp-send-dedupe';

/** Janela em que uma reivindicação rival ainda conta como "a mesma ação". */
export const SEND_DEDUPE_WINDOW_MS = 2_000;

/** Contrato v1 das mensagens do canal. */
type DedupeMessage =
  | { version: 1; type: 'CLAIM'; tabId: string; key: string; clientMessageId: string; at: number }
  | { version: 1; type: 'RELEASE'; tabId: string; key: string };

interface DedupeClaimRecord {
  tabId: string;
  clientMessageId: string;
  at: number;
}

export interface SendDedupeClaim {
  /** `true` = esta aba manda; `false` = outra aba já reivindicou e o request é dela. */
  owner: boolean;
  /** Chave estável do envio — a MESMA nas duas abas quando `owner` é `false`. */
  clientMessageId: string;
}

export interface CrossTabSendDedupe {
  claim(actionKey: string, clientMessageId: string): Promise<SendDedupeClaim>;
  /** Libera a chave depois que o envio dono terminou. */
  release(actionKey: string): void;
  /** Fecha o canal (unmount/desligamento da aba nos testes). */
  dispose(): void;
}

export interface CrossTabSendDedupeOptions {
  channelName?: string;
  windowMs?: number;
  tabId?: string;
  now?: () => number;
  /** Janela de espera pela reivindicação rival antes de decidir. */
  settle?: () => Promise<void>;
  /** Injeção do canal (teste); `null` força o modo aba única. */
  createChannel?: (name: string) => BroadcastChannel | null;
}

/** Contador do último recurso de `generateTabId()` (aba sem `crypto`). */
let contadorSemCrypto = 0;

/**
 * Identidade da aba, na mesma escada de recurso do `tabLeaderStore`
 * (`randomUUID` -> `getRandomValues` -> relógio + contador). O id só é comparado
 * por igualdade de string e ordenação, nunca enviado ao banco.
 */
function generateTabId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const sorte = crypto.getRandomValues(new Uint32Array(1))[0];
      return `tab-${sorte.toString(36)}`;
    }
  } catch {
    // `crypto` bloqueado: cai no último recurso abaixo.
  }
  contadorSemCrypto += 1;
  return `tab-${Date.now().toString(36)}-${contadorSemCrypto.toString(36)}`;
}

function defaultCreateChannel(name: string): BroadcastChannel | null {
  try {
    if (typeof BroadcastChannel === 'undefined') return null;
    return new BroadcastChannel(name);
  } catch {
    return null;
  }
}

function isDedupeMessage(payload: unknown): payload is DedupeMessage {
  if (!payload || typeof payload !== 'object') return false;
  const { version, type, tabId, key } = payload as {
    version?: unknown;
    type?: unknown;
    tabId?: unknown;
    key?: unknown;
  };
  if (version !== 1 || typeof tabId !== 'string' || typeof key !== 'string') return false;
  if (type === 'RELEASE') return true;
  if (type !== 'CLAIM') return false;
  const { clientMessageId, at } = payload as { clientMessageId?: unknown; at?: unknown };
  return typeof clientMessageId === 'string' && typeof at === 'number';
}

export function createCrossTabSendDedupe(options: CrossTabSendDedupeOptions = {}): CrossTabSendDedupe {
  const windowMs = options.windowMs ?? SEND_DEDUPE_WINDOW_MS;
  const now = options.now ?? (() => Date.now());
  const settle = options.settle ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  const createChannel = options.createChannel ?? defaultCreateChannel;
  const tabId = options.tabId ?? generateTabId();

  /** Última reivindicação vencedora vista por chave (desta aba ou de uma rival). */
  const claims = new Map<string, DedupeClaimRecord>();
  /** Reivindicações desta aba — é o que a faz reapresentar-se (ACK) para quem chega depois. */
  const minhas = new Map<string, DedupeClaimRecord>();
  let channel: BroadcastChannel | null = null;
  let channelResolved = false;

  /** `a` vence `b` quando publicou antes; no empate de relógio, o id de aba menor. */
  function wins(a: DedupeClaimRecord, b: DedupeClaimRecord): boolean {
    if (a.at !== b.at) return a.at < b.at;
    return a.tabId < b.tabId;
  }

  function handleMessage(payload: unknown): void {
    if (!isDedupeMessage(payload)) return;
    if (payload.type === 'RELEASE') {
      if (claims.get(payload.key)?.tabId === payload.tabId) claims.delete(payload.key);
      if (minhas.get(payload.key)?.tabId === payload.tabId) minhas.delete(payload.key);
      return;
    }
    const incoming: DedupeClaimRecord = {
      tabId: payload.tabId,
      clientMessageId: payload.clientMessageId,
      at: payload.at,
    };
    const atual = claims.get(payload.key);
    // Só a reivindicação vencedora fica guardada: isso impede que uma aba
    // perdedora "esconda" a dona de uma terceira aba.
    if (!atual || wins(incoming, atual)) claims.set(payload.key, incoming);

    // ACK: quem já segura a chave se reapresenta. É o que faz a aba que chega
    // depois (ou que publica depois) aprender quem é a dona.
    const minha = minhas.get(payload.key);
    if (minha && payload.tabId !== minha.tabId && wins(minha, incoming)) {
      publish({ version: 1, type: 'CLAIM', tabId, key: payload.key, clientMessageId: minha.clientMessageId, at: minha.at });
    }
  }

  function resolveChannel(): BroadcastChannel | null {
    if (channelResolved) return channel;
    channelResolved = true;
    channel = createChannel(options.channelName ?? SEND_DEDUPE_CHANNEL_NAME);
    if (channel) {
      channel.onmessage = (event: MessageEvent) => handleMessage(event.data);
    }
    return channel;
  }

  function publish(message: DedupeMessage): void {
    const open = resolveChannel();
    if (!open) return;
    try {
      open.postMessage(message);
    } catch {
      // Canal fechado (unload): ninguém para ouvir.
    }
  }

  function prune(at: number): void {
    claims.forEach((registro, key) => {
      if (registro.at <= at - windowMs) claims.delete(key);
    });
  }

  function rivalClaim(key: string, mine: DedupeClaimRecord): DedupeClaimRecord | null {
    const registro = claims.get(key);
    if (!registro) return null;
    if (registro.tabId === mine.tabId) return null;
    if (registro.at <= mine.at - windowMs) return null;
    return wins(registro, mine) ? registro : null;
  }

  // Canal aberto já na construção: uma aba que começa a enviar logo não perde a
  // reivindicação de quem já estava na chave.
  resolveChannel();

  return {
    async claim(actionKey: string, clientMessageId: string): Promise<SendDedupeClaim> {
      const at = now();
      prune(at);
      const mine: DedupeClaimRecord = { tabId, clientMessageId, at };
      // Canal ausente = aba única: não há com quem disputar, então esta aba manda.
      const open = resolveChannel();
      if (!open) return { owner: true, clientMessageId };

      const jaVisto = rivalClaim(actionKey, mine);
      if (jaVisto) return { owner: false, clientMessageId: jaVisto.clientMessageId };

      // Registro otimista ANTES do settle: quem publicar depois já me enxerga.
      claims.set(actionKey, mine);
      minhas.set(actionKey, mine);
      publish({ version: 1, type: 'CLAIM', tabId, key: actionKey, clientMessageId, at });
      await settle();

      const rival = rivalClaim(actionKey, mine);
      if (rival) {
        minhas.delete(actionKey);
        return { owner: false, clientMessageId: rival.clientMessageId };
      }
      return { owner: true, clientMessageId };
    },

    release(actionKey: string): void {
      if (minhas.get(actionKey)?.tabId === tabId) minhas.delete(actionKey);
      if (claims.get(actionKey)?.tabId === tabId) claims.delete(actionKey);
      publish({ version: 1, type: 'RELEASE', tabId, key: actionKey });
    },

    dispose(): void {
      claims.clear();
      minhas.clear();
      const open = channel;
      channelResolved = false;
      channel = null;
      if (!open) return;
      try {
        open.onmessage = null;
        open.close();
      } catch {
        // Canal já fechado.
      }
    },
  };
}

/** Dedupe do envio do chat: um só por aba, compartilhado pelos pontos de envio. */
export const crossTabSendDedupe: CrossTabSendDedupe = createCrossTabSendDedupe();
