/**
 * Fila offline de envio (SL-070 · item 025 do inventário de paridade V1/V3).
 *
 * O que este módulo existe para impedir: mensagem composta com a rede caída
 * simplesmente se perder. Quem envia offline vai para esta fila (IndexedDB, para
 * sobreviver ao reload) e a fila é drenada quando o `online` volta — NA ORDEM de
 * composição, e sem duplicar: a chave primária é o `clientMessageId`, a mesma
 * chave estável de idempotência do item 024.
 *
 * Módulo puro: sem React e sem DOM obrigatório. O driver de persistência é
 * injetável — os testes usam o driver de memória e um IndexedDB de mentira
 * (`src/test/fakeIndexedDb.ts`), e a aba que roda em navegador sem IndexedDB
 * (modo privado, política de armazenamento) cai no driver de memória em vez de
 * quebrar o envio.
 */

import { offlineQueueDrainLock, type CrossTabDrainLock } from './crossTabDrainLock';

export const OFFLINE_QUEUE_DATABASE = 'zapp-offline-outbox';
export const OFFLINE_QUEUE_DATABASE_VERSION = 1;
export const OFFLINE_QUEUE_STORE = 'outbound_messages';

export interface OfflineQueuedMessage {
  /** Chave primária e chave de idempotência do envio (item 024). */
  clientMessageId: string;
  contactId: string;
  content: string;
  messageType: string;
  mediaUrl: string | null;
  caption: string | null;
  replyToId: string | null;
  whatsappConnectionId: string | null;
  /** Atendente dono do item: a drenagem só processa mensagens do usuário atual. */
  userId?: string;
  /** Ordem de drenagem. Sempre único e crescente (a fila respeita a ordem de composição). */
  enqueuedAt: number;
  /** Tentativas de drenagem já feitas — observabilidade, não decide nada. */
  attempts: number;
}

export type OfflineQueueInput = Omit<OfflineQueuedMessage, 'enqueuedAt' | 'attempts'>;

export interface OfflineQueueDriver {
  readAll(): Promise<OfflineQueuedMessage[]>;
  put(message: OfflineQueuedMessage): Promise<void>;
  remove(clientMessageId: string): Promise<void>;
  clear(): Promise<void>;
}

export interface OfflineQueueDrainResult {
  /** Mensagens entregues nesta drenagem. */
  sent: number;
  /** Mensagens que continuam na fila. */
  remaining: number;
  /**
   * PK-28: `true` quando OUTRA aba está drenando e esta não tocou a fila. A fila
   * é o mesmo IndexedDB para todas as abas: entregar em paralelo mandaria cada
   * mensagem duas vezes. A aba que perdeu a trava não entrega nada — e é o
   * `remaining` já conhecido que alimenta o aviso de pendentes.
   */
  outraAba?: boolean;
}

export interface OfflineQueueDrainOptions {
  /** Chamado quando a drenagem falha (sem mensagem quando a leitura da fila falha). */
  onError?: OfflineQueueErrorHandler;
  /** Quando informado, só mensagens deste usuário (ou sem userId) são entregues. */
  userId?: string | (() => string | null);
}

/** Handler de erro da fila: recebe a mensagem quando a falha foi da entrega dela. */
export type OfflineQueueErrorHandler = (error: unknown, message?: OfflineQueuedMessage) => void;

export interface OfflineQueue {
  enqueue(input: OfflineQueueInput): Promise<OfflineQueuedMessage>;
  list(): Promise<OfflineQueuedMessage[]>;
  remove(clientMessageId: string): Promise<void>;
  clear(): Promise<void>;
  /** Tamanho da fila como visto pela última operação — alimenta o aviso "N pendentes". */
  getSnapshot(): number;
  subscribe(listener: () => void): () => void;
  drain(deliver: (message: OfflineQueuedMessage) => Promise<void>, options?: OfflineQueueDrainOptions): Promise<OfflineQueueDrainResult>;
}

export interface OfflineQueueOptions {
  driver?: OfflineQueueDriver;
  now?: () => number;
  /**
   * Trava de drenagem entre abas (PK-28). Padrão: `offlineQueueDrainLock`.
   * `null` desliga a coordenação (aba única / teste de regra da fila).
   */
  lock?: CrossTabDrainLock | null;
}

/** Driver de memória: fallback de ambiente sem IndexedDB e base dos testes de regra. */
export function createMemoryOfflineQueueDriver(): OfflineQueueDriver {
  const store = new Map<string, OfflineQueuedMessage>();
  return {
    async readAll() {
      return Array.from(store.values());
    },
    async put(message) {
      store.set(message.clientMessageId, message);
    },
    async remove(clientMessageId) {
      store.delete(clientMessageId);
    },
    async clear() {
      store.clear();
    },
  };
}

function requestError<T>(request: IDBRequest<T>, fallback: string): Error {
  return request.error ?? new Error(fallback);
}

/**
 * Driver em IndexedDB. Cada operação abre a conexão, usa e fecha: a fila é
 * pequena e de baixa frequência, e assim não há conexão pendurada sobrevivendo a
 * um reload ou a um `upgradeneeded` de outra versão.
 */
export function createIndexedDbOfflineQueueDriver(
  factory: IDBFactory,
  options: { databaseName?: string } = {},
): OfflineQueueDriver {
  const databaseName = options.databaseName ?? OFFLINE_QUEUE_DATABASE;

  function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = factory.open(databaseName, OFFLINE_QUEUE_DATABASE_VERSION);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('IndexedDB indisponível.'));
        return;
      }
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(OFFLINE_QUEUE_STORE)) {
          database.createObjectStore(OFFLINE_QUEUE_STORE, { keyPath: 'clientMessageId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(requestError(request, 'Falha ao abrir a fila offline.'));
      request.onblocked = () => reject(new Error('Fila offline bloqueada por outra aba.'));
    });
  }

  async function run<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const database = await openDatabase();
    return new Promise<T>((resolve, reject) => {
      let result: T;
      const transaction = database.transaction(OFFLINE_QUEUE_STORE, mode);
      const request = operation(transaction.objectStore(OFFLINE_QUEUE_STORE));
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(requestError(request, 'Falha ao falar com a fila offline.'));
      transaction.oncomplete = () => {
        database.close();
        resolve(result);
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error('Transação da fila offline falhou.'));
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error ?? new Error('Transação da fila offline abortada.'));
      };
    });
  }

  return {
    readAll: () => run('readonly', (store) => store.getAll() as IDBRequest<OfflineQueuedMessage[]>),
    put: (message) => run('readwrite', (store) => store.put(message) as IDBRequest<IDBValidKey>).then(() => undefined),
    remove: (clientMessageId) =>
      run('readwrite', (store) => store.delete(clientMessageId) as IDBRequest<undefined>).then(() => undefined),
    clear: () => run('readwrite', (store) => store.clear() as IDBRequest<undefined>).then(() => undefined),
  };
}

/** Driver padrão do navegador; sem IndexedDB a fila vive só enquanto a aba viver. */
export function resolveOfflineQueueDriver(): OfflineQueueDriver {
  try {
    if (typeof indexedDB !== 'undefined' && indexedDB) {
      return createIndexedDbOfflineQueueDriver(indexedDB);
    }
  } catch {
    // IndexedDB bloqueado pelo navegador: cai no driver de memória.
  }
  return createMemoryOfflineQueueDriver();
}

export function createOfflineQueue(options: OfflineQueueOptions = {}): OfflineQueue {
  const driver = options.driver ?? resolveOfflineQueueDriver();
  const now = options.now ?? (() => Date.now());
  const lock = options.lock !== undefined ? options.lock : offlineQueueDrainLock;
  const listeners = new Set<() => void>();
  let snapshot = 0;
  let draining: Promise<OfflineQueueDrainResult> | null = null;

  function commitSnapshot(next: number): void {
    if (next === snapshot) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  async function list(): Promise<OfflineQueuedMessage[]> {
    const all = await driver.readAll();
    return all.sort((a, b) => a.enqueuedAt - b.enqueuedAt || a.clientMessageId.localeCompare(b.clientMessageId));
  }

  async function remove(clientMessageId: string): Promise<void> {
    await driver.remove(clientMessageId);
    commitSnapshot((await driver.readAll()).length);
  }

  /** Corpo da drenagem, sem coordenação entre abas: quem chama já é o dono. */
  async function executar(
    deliver: (message: OfflineQueuedMessage) => Promise<void>,
    drainOptions: OfflineQueueDrainOptions = {},
  ): Promise<OfflineQueueDrainResult> {
      let sent = 0;
      let pending: OfflineQueuedMessage[];
      try {
        pending = await list();
      } catch (error) {
        drainOptions.onError?.(error);
        return { sent: 0, remaining: snapshot };
      }
      commitSnapshot(pending.length);
      const uid = typeof drainOptions.userId === 'function' ? drainOptions.userId() : drainOptions.userId;
      const ownMessages = uid ? pending.filter(m => !m.userId || m.userId === uid) : pending;
      for (const message of ownMessages) {
        try {
          await driver.put({ ...message, attempts: message.attempts + 1 });
          await deliver(message);
        } catch (error) {
          // Para na primeira falha: a ordem de composição vale mais que a vazão.
          drainOptions.onError?.(error, message);
          break;
        }
        // A entrega já aconteceu: conta como enviada mesmo se a baixa local falhar.
        sent += 1;
        try {
          await driver.remove(message.clientMessageId);
          commitSnapshot((await driver.readAll()).length);
        } catch (error) {
          // A baixa local falhou depois da entrega: a mensagem fica na fila e a
          // próxima drenagem a reenvia — a chave `clientMessageId` (item 024)
          // faz o servidor descartar a duplicata. A drenagem para aqui, em
          // ordem, em vez de virar rejeição solta.
          drainOptions.onError?.(error, message);
          break;
        }
      }
      let remaining = snapshot;
      try {
        remaining = (await driver.readAll()).length;
      } catch (error) {
        drainOptions.onError?.(error);
      }
      return { sent, remaining };
  }

  /**
   * Uma drenagem por aba por vez E uma aba por vez (PK-28): a fila é o MESMO
   * IndexedDB para todas as abas da origem, então dois gatilhos de `online` em
   * abas diferentes entregariam as mesmas mensagens em dobro. Quem não pega a
   * trava devolve `outraAba: true` sem tocar na fila.
   */
  async function drain(
    deliver: (message: OfflineQueuedMessage) => Promise<void>,
    drainOptions: OfflineQueueDrainOptions = {},
  ): Promise<OfflineQueueDrainResult> {
    // Uma drenagem por vez NESTA aba: dois gatilhos de `online` próximos não
    // podem entregar a mesma mensagem duas vezes.
    if (draining) return draining;
    const run = (async (): Promise<OfflineQueueDrainResult> => {
      if (!lock) return executar(deliver, drainOptions);
      const resultado = await lock.runExclusive(() => executar(deliver, drainOptions));
      if (!resultado.ran) return { sent: 0, remaining: snapshot, outraAba: true };
      return resultado.value ?? { sent: 0, remaining: snapshot };
    })();
    draining = run;
    try {
      return await run;
    } finally {
      draining = null;
    }
  }

  return {
    async enqueue(input: OfflineQueueInput): Promise<OfflineQueuedMessage> {
      const all = await driver.readAll();
      const anterior = all.find((message) => message.clientMessageId === input.clientMessageId);
      const maiorHorario = all.reduce((max, message) => Math.max(max, message.enqueuedAt), 0);
      const message: OfflineQueuedMessage = {
        ...input,
        // Já enfileirada (retry da mesma ação): mantém o lugar e as tentativas.
        enqueuedAt: anterior ? anterior.enqueuedAt : Math.max(now(), maiorHorario + 1),
        attempts: anterior ? anterior.attempts : 0,
      };
      await driver.put(message);
      commitSnapshot(anterior ? all.length : all.length + 1);
      return message;
    },
    list,
    remove,
    async clear() {
      await driver.clear();
      commitSnapshot(0);
    },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    drain,
  };
}

/** Fila de envio da aba. Uma só: o dedupe entre abas cuida da concorrência. */
export const offlineSendQueue: OfflineQueue = createOfflineQueue();

export type OnlineScope = Pick<Window, 'addEventListener' | 'removeEventListener'>;

/**
 * Reconciliação ao reconectar: a fila drena no evento `online`. Devolve o
 * desligamento — quem instala (o dono do ciclo de vida da aba) desinstala.
 *
 * Exceção de leitura da fila não derruba o listener: a drenagem devolve
 * `sent: 0` e a próxima reconexão tenta de novo.
 */
export function drainOfflineQueueOnReconnect(
  queue: OfflineQueue,
  deliver: (message: OfflineQueuedMessage) => Promise<void>,
  options: { scope?: OnlineScope | null; onError?: OfflineQueueErrorHandler; userId?: string | (() => string | null) } = {},
): () => void {
  const scope = options.scope !== undefined ? options.scope : typeof window === 'undefined' ? null : window;
  if (!scope) return () => {};
  const handleOnline = () => {
    void queue.drain(deliver, { onError: options.onError, userId: options.userId });
  };
  scope.addEventListener('online', handleOnline);
  return () => scope.removeEventListener('online', handleOnline);
}

/**
 * Drenagem de ABERTURA (item 025): o cenário que o evento `online` não alcança
 * é o usuário que compõe offline, fecha a aba e reabre já com rede — nenhum
 * `online` dispara e a mensagem fica parada no IndexedDB até a próxima
 * queda/volta de rede. Quem chama é o efeito de sessão autenticada (a fila é
 * por usuário: nunca antes do login).
 *
 * Só drena quando a aba está online (`navigator.onLine !== false`): offline não
 * há o que tentar agora, e a drenagem de reconexão cuida disso. Ordem e dedupe
 * são os do `drain` — uma drenagem por vez e chave estável `clientMessageId`.
 * Devolve `null` quando não era hora de drenar.
 */
export function drainOfflineQueueOnOpen(
  queue: OfflineQueue,
  deliver: (message: OfflineQueuedMessage) => Promise<void>,
  options: { online?: boolean; onError?: OfflineQueueErrorHandler; userId?: string | (() => string | null) } = {},
): Promise<OfflineQueueDrainResult | null> {
  const online = options.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  if (!online) return Promise.resolve(null);
  return queue.drain(deliver, { onError: options.onError, userId: options.userId });
}
