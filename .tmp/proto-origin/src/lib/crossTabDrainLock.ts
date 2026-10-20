/**
 * Trava de drenagem da fila offline entre abas (PK-28 · paridade doc 06).
 *
 * A fila (`offlineQueue.ts`) mora no IndexedDB — o MESMO banco para todas as abas
 * da mesma origem — e o evento `online` chega em todas elas. Sem coordenação,
 * duas abas drenam a mesma fila no mesmo instante: cada mensagem sai duas vezes
 * (a chave `clientMessageId` evita a linha duplicada no servidor, mas o request e
 * o disparo acontecem em dobro e a segunda aba apaga o item que a primeira ainda
 * está entregando).
 *
 * Contrato: `runExclusive(fn)` roda `fn` em NO MÁXIMO uma aba por vez. A aba que
 * pega a trava drena; as outras recebem `{ ran: false }` e não tocam a fila.
 *
 * Escada de recursos (mesma filosofia de `crossTabSendDedupe` e `tabLeaderStore`):
 * 1. `navigator.locks.request(nome, { ifAvailable: true })` — exclusão real entre
 *    abas do mesmo navegador. `ifAvailable` é o ponto: a aba que perdeu NÃO
 *    espera a vez (não enfileira o callback), ela desiste da drenagem.
 * 2. Sem `navigator.locks`: eleição por `BroadcastChannel` — reivindicação com
 *    `(at, tabId)` e janela de settle, igual ao dedupe de envio.
 * 3. Sem canal (ou canal quebrado): aba única — não há com quem disputar, drena.
 *
 * Módulo puro: sem React. Toda a concorrência é injetável, para o teste montar
 * duas "abas" no mesmo processo.
 */

/** Nome da trava Web Locks — uma só para a fila offline do Zapp. */
export const OFFLINE_QUEUE_LOCK_NAME = 'zapp-offline-queue';

/** Canal da eleição quando não há `navigator.locks`. */
export const OFFLINE_QUEUE_LOCK_CHANNEL_NAME = 'zapp-offline-queue-lock';

/** Janela em que uma reivindicação rival ainda conta como "a mesma disputa". */
export const OFFLINE_QUEUE_LOCK_WINDOW_MS = 2_000;

type LockMessage =
  | { version: 1; type: 'CLAIM'; tabId: string; at: number }
  | { version: 1; type: 'RELEASE'; tabId: string };

interface Claim {
  tabId: string;
  at: number;
}

export interface CrossTabDrainLock {
  /**
   * Roda `fn` se — e somente se — esta aba pegar a trava.
   * `{ ran: false }` = outra aba está drenando; quem chamou não faz nada.
   * Erro de `fn` propaga (a trava é liberada no `finally`).
   */
  runExclusive<T>(fn: () => Promise<T>): Promise<{ ran: boolean; value?: T }>;
  /** Fecha o canal (desmonte da aba nos testes). */
  dispose(): void;
}

export interface CrossTabDrainLockOptions {
  lockName?: string;
  channelName?: string;
  tabId?: string;
  now?: () => number;
  /** Janela de espera pela reivindicação rival antes de decidir (eleição por canal). */
  settle?: () => Promise<void>;
  /** Injeção do LockManager (teste); `null` força a eleição por canal. */
  locks?: LockManager | null;
  /** Injeção do canal (teste); `null` força o modo aba única. */
  createChannel?: (name: string) => BroadcastChannel | null;
  windowMs?: number;
}

let contadorSemCrypto = 0;

/** Identidade da aba, na mesma escada de recurso do `crossTabSendDedupe`. */
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

function resolveDefaultLocks(): LockManager | null {
  try {
    if (typeof navigator === 'undefined') return null;
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    return typeof locks?.request === 'function' ? locks : null;
  } catch {
    return null;
  }
}

function defaultCreateChannel(name: string): BroadcastChannel | null {
  try {
    if (typeof BroadcastChannel === 'undefined') return null;
    return new BroadcastChannel(name);
  } catch {
    return null;
  }
}

function isLockMessage(payload: unknown): payload is LockMessage {
  if (!payload || typeof payload !== 'object') return false;
  const { version, type, tabId } = payload as { version?: unknown; type?: unknown; tabId?: unknown };
  if (version !== 1 || typeof tabId !== 'string') return false;
  if (type === 'RELEASE') return true;
  if (type !== 'CLAIM') return false;
  return typeof (payload as { at?: unknown }).at === 'number';
}

export function createCrossTabDrainLock(options: CrossTabDrainLockOptions = {}): CrossTabDrainLock {
  const lockName = options.lockName ?? OFFLINE_QUEUE_LOCK_NAME;
  const windowMs = options.windowMs ?? OFFLINE_QUEUE_LOCK_WINDOW_MS;
  const now = options.now ?? (() => Date.now());
  const settle = options.settle ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  const createChannel = options.createChannel ?? defaultCreateChannel;
  const locks = options.locks !== undefined ? options.locks : resolveDefaultLocks();
  const tabId = options.tabId ?? generateTabId();

  let channel: BroadcastChannel | null = null;
  let channelResolved = false;
  /** Última reivindicação vencedora conhecida (desta aba ou de uma rival). */
  let claim: Claim | null = null;
  /**
   * Esta chamada viu uma reivindicação RIVAL que ganha da minha. Sem `locks`, é
   * isto que faz a aba perdedora desistir da rodada em vez de drenar depois que
   * a vencedora solta: a vencedora manda um ACK com o `at` dela, e a janela de
   * settle é o tempo em que os dois lados trocam essas reivindicações.
   */
  let viuRivalVencedor = false;

  function wins(a: Claim, b: Claim): boolean {
    if (a.at !== b.at) return a.at < b.at;
    return a.tabId < b.tabId;
  }

  function handleMessage(payload: unknown): void {
    if (!isLockMessage(payload)) return;
    if (payload.type === 'RELEASE') {
      if (claim?.tabId === payload.tabId) claim = null;
      return;
    }
    const incoming: Claim = { tabId: payload.tabId, at: payload.at };
    if (incoming.tabId !== tabId) {
      const meu = claim && claim.tabId === tabId ? claim : null;
      if (!meu || wins(incoming, meu)) viuRivalVencedor = true;
    }
    if (!claim || wins(incoming, claim)) claim = incoming;
    // ACK: quem já segura a trava se reapresenta, para a aba que chega depois
    // (ou que publica depois) aprender quem é a dona.
    if (claim?.tabId === tabId && payload.tabId !== tabId) {
      publish({ version: 1, type: 'CLAIM', tabId, at: claim.at });
    }
  }

  function resolveChannel(): BroadcastChannel | null {
    if (channelResolved) return channel;
    channelResolved = true;
    channel = createChannel(options.channelName ?? OFFLINE_QUEUE_LOCK_CHANNEL_NAME);
    if (channel) {
      channel.onmessage = (event: MessageEvent) => handleMessage(event.data);
    }
    return channel;
  }

  function publish(message: LockMessage): void {
    const open = resolveChannel();
    if (!open) return;
    try {
      open.postMessage(message);
    } catch {
      // Canal fechado (unload): ninguém para ouvir.
    }
  }

  /** Rival vencedora com reivindicação dentro da janela, ou `null`. */
  function rivalClaim(mine: Claim): Claim | null {
    if (!claim) return null;
    if (claim.tabId === mine.tabId) return null;
    if (claim.at <= mine.at - windowMs) return null;
    return wins(claim, mine) ? claim : null;
  }

  async function porCanal<T>(fn: () => Promise<T>): Promise<{ ran: boolean; value?: T }> {
    const open = resolveChannel();
    // Canal ausente = aba única: não há com quem disputar.
    if (!open) return { ran: true, value: await fn() };

    const mine: Claim = { tabId, at: now() };
    if (rivalClaim(mine)) return { ran: false };

    // Rodada nova: a reivindicação rival só conta a partir daqui.
    viuRivalVencedor = false;
    // Registro otimista ANTES do settle: quem publicar depois já me enxerga.
    if (!claim || wins(mine, claim)) claim = mine;
    publish({ version: 1, type: 'CLAIM', tabId, at: mine.at });
    await settle();

    if (rivalClaim(mine) || viuRivalVencedor) {
      if (claim?.tabId === tabId) claim = null;
      return { ran: false };
    }
    try {
      return { ran: true, value: await fn() };
    } finally {
      if (claim?.tabId === tabId) claim = null;
      publish({ version: 1, type: 'RELEASE', tabId });
    }
  }

  return {
    async runExclusive<T>(fn: () => Promise<T>): Promise<{ ran: boolean; value?: T }> {
      if (!locks) return porCanal(fn);
      // `ifAvailable`: a aba que perdeu recebe `lock === null` e desiste — não
      // fica na fila esperando a vez (a drenagem dela já não faz sentido).
      const resultado = await locks.request(lockName, { ifAvailable: true }, async (lock) => {
        if (!lock) return { ran: false } as { ran: boolean; value?: T };
        return { ran: true, value: await fn() };
      });
      return resultado ?? { ran: false };
    },

    dispose(): void {
      claim = null;
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

/** Trava da fila offline da aba: uma só, compartilhada pelos gatilhos de drenagem. */
export const offlineQueueDrainLock: CrossTabDrainLock = createCrossTabDrainLock();
