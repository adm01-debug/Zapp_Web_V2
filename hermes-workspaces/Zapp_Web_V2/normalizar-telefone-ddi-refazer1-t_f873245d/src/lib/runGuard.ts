// Guarda de execuções assíncronas concorrentes: cada `start()` invalida as
// execuções anteriores e devolve um id; quando a resposta chega, o chamador
// confere `isCurrent(id)` e descarta resultados obsoletos. Resolve a corrida
// clássica de "trocar de contato/chave no meio do fetch", em que a resposta
// antiga sobrescreveria o estado da chave atual.
export interface RunGuard {
  /** Inicia uma nova execução e retorna seu id, invalidando as anteriores. */
  start(): number;
  /** A execução `id` ainda é a mais recente? */
  isCurrent(id: number): boolean;
  /** Invalida todas as execuções em andamento (ex.: cleanup de efeito). */
  invalidate(): void;
}

export function createRunGuard(): RunGuard {
  let current = 0;
  return {
    start() {
      current += 1;
      return current;
    },
    isCurrent(id: number) {
      return id === current;
    },
    invalidate() {
      current += 1;
    },
  };
}
