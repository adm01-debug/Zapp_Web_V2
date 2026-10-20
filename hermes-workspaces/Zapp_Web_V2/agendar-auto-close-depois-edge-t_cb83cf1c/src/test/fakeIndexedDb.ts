/**
 * IndexedDB de mentira para o jsdom (que não implementa IndexedDB).
 *
 * Cobre só o que `src/lib/offlineQueue.ts` usa: `open` com `upgradeneeded`,
 * `objectStoreNames.contains`, `createObjectStore`, `transaction(...).objectStore()`
 * com `put`/`getAll`/`delete`/`clear`, `close` e os eventos `onsuccess`/`onerror`/
 * `oncomplete`. As respostas são entregues em microtask, e não no mesmo bloco
 * síncrono da chamada: é o que o IndexedDB de verdade faz e é o que o driver
 * pressupõe (ele liga os handlers DEPOIS de criar o request).
 *
 * O objeto devolvido é um `IDBFactory` de mentira — os testes passam por
 * `as unknown as IDBFactory`, do mesmo jeito que `fakeBroadcastChannel.ts` faz
 * com o canal.
 */

type Registro = Record<string, unknown>;

interface RequestFalso<T> {
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded: (() => void) | null;
  onblocked: (() => void) | null;
  result: T;
  error: Error | null;
}

interface StoreFalso {
  keyPath: string;
  registros: Map<string, Registro>;
}

interface TransacaoFalsa {
  error: Error | null;
  oncomplete: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  objectStore: () => Record<string, unknown>;
}

export interface FakeIndexedDb {
  /** Passe por `as unknown as IDBFactory` no teste. */
  factory: unknown;
  /** Stores criados no banco — prova que o `upgradeneeded` rodou. */
  storeNames: (databaseName: string) => string[];
}

function deMicrotask(callback: () => void): void {
  queueMicrotask(callback);
}

export function createFakeIndexedDb(): FakeIndexedDb {
  const databases = new Map<string, Map<string, StoreFalso>>();

  function database(nome: string): Map<string, StoreFalso> {
    const existente = databases.get(nome);
    if (existente) return existente;
    const novo = new Map<string, StoreFalso>();
    databases.set(nome, novo);
    return novo;
  }

  function request<T>(preencher: (req: RequestFalso<T>) => void): RequestFalso<T> {
    const req: RequestFalso<T> = {
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      onblocked: null,
      result: undefined as unknown as T,
      error: null,
    };
    deMicrotask(() => preencher(req));
    return req;
  }

  /** Resposta de uma operação de store: sucesso em microtask e transação completa depois. */
  function operacao(
    transacao: TransacaoFalsa,
    executar: (req: RequestFalso<unknown>) => void,
  ): RequestFalso<unknown> {
    return request<unknown>((req) => {
      executar(req);
      req.onsuccess?.();
      deMicrotask(() => transacao.oncomplete?.());
    });
  }

  function storeFalso(store: StoreFalso, transacao: TransacaoFalsa): Record<string, unknown> {
    return {
      put(value: unknown) {
        return operacao(transacao, (req) => {
          const registro = { ...(value as Registro) };
          const chave = String(registro[store.keyPath]);
          store.registros.set(chave, registro);
          req.result = chave;
        });
      },
      getAll() {
        return operacao(transacao, (req) => {
          req.result = Array.from(store.registros.values()).map((registro) => ({ ...registro }));
        });
      },
      delete(chave: unknown) {
        return operacao(transacao, (req) => {
          store.registros.delete(String(chave));
          req.result = undefined;
        });
      },
      clear() {
        return operacao(transacao, (req) => {
          store.registros.clear();
          req.result = undefined;
        });
      },
    };
  }

  function databaseFalsa(stores: Map<string, StoreFalso>): Record<string, unknown> {
    return {
      objectStoreNames: { contains: (nome: string) => stores.has(nome) },
      createObjectStore: (nome: string, options?: { keyPath?: string }) => {
        stores.set(nome, { keyPath: options?.keyPath ?? 'id', registros: new Map() });
        return {};
      },
      transaction: (nome: string): TransacaoFalsa => {
        const store = stores.get(nome);
        const transacao: TransacaoFalsa = {
          error: null,
          oncomplete: null,
          onerror: null,
          onabort: null,
          objectStore: () => {
            if (!store) throw new Error(`store inexistente: ${nome}`);
            return storeFalso(store, transacao);
          },
        };
        return transacao;
      },
      close: () => {},
    };
  }

  return {
    factory: {
      open: (nome: string): RequestFalso<unknown> => {
        const stores = database(nome);
        return request<unknown>((req) => {
          // `result` antes do `upgradeneeded`: o callback do driver lê
          // `request.result` para criar o store, como no IndexedDB de verdade.
          req.result = databaseFalsa(stores);
          if (stores.size === 0) req.onupgradeneeded?.();
          req.onsuccess?.();
        });
      },
    },
    storeNames: (nome) => Array.from(database(nome).keys()),
  };
}
