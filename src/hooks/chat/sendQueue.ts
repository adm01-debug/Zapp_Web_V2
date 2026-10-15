/**
 * PK-21 — fila SERIAL de envio por conversa.
 *
 * O compositor não pode ficar travado até o despacho no Edge (e os refetches que
 * vinham depois dele): a mensagem entra nesta fila — uma fila por conversa — e o
 * editor é liberado na hora, aceitando a próxima digitação. A fila garante que a
 * segunda mensagem só começa depois que a primeira terminou: ordem preservada,
 * sem duas entregas concorrentes para o mesmo contato.
 *
 * A primeira tarefa de uma fila OCIOSA começa no mesmo tick (chamada síncrona).
 * Isso é de propósito: o `Enter` aciona o transporte dentro do próprio evento, e
 * os testes de acionamento (limite/assinatura) contam a chamada ali. Só a partir
 * da segunda a tarefa entra na cauda.
 *
 * A fila nunca encadeia rejeição: uma tarefa que falha libera a próxima (um erro
 * de rede não pode travar os envios seguintes do mesmo contato).
 */
export interface SerialSendQueue {
  /** Entra na fila da `key`; resolve/rejeita com o resultado da própria tarefa. */
  enqueue<T>(key: string, task: () => Promise<T> | T): Promise<T>;
  /** Há tarefa em voo (ou na cauda) para esta `key`? */
  isBusy(key: string): boolean;
  clear(): void;
}

export function createSerialSendQueue(): SerialSendQueue {
  const caudas = new Map<string, Promise<void>>();
  const ocupadas = new Set<string>();

  return {
    enqueue<T>(key: string, task: () => Promise<T> | T): Promise<T> {
      let execucao: Promise<T>;
      if (!ocupadas.has(key)) {
        ocupadas.add(key);
        // `task()` roda no MESMO tick (o Enter aciona o transporte dentro do evento),
        // mas um lançamento SÍNCRONO vira rejeição: sem isso a exceção escaparia do
        // `enqueue` e a chave nunca sairia de `ocupadas` — `isBusy` mentiria até o
        // próximo envio.
        try {
          execucao = Promise.resolve(task());
        } catch (erro) {
          execucao = Promise.reject(erro);
        }
      } else {
        const anterior = caudas.get(key) ?? Promise.resolve();
        execucao = anterior.then(() => task());
      }

      // A cauda guardada NUNCA rejeita — senão a próxima tarefa herdaria o erro
      // da anterior em vez de esperar a vez.
      const cauda = execucao.then(() => undefined, () => undefined);
      caudas.set(key, cauda);
      void cauda.then(() => {
        if (caudas.get(key) === cauda) {
          caudas.delete(key);
          ocupadas.delete(key);
        }
      });

      return execucao;
    },
    isBusy(key: string): boolean {
      return ocupadas.has(key);
    },
    clear(): void {
      caudas.clear();
      ocupadas.clear();
    },
  };
}

/** Fila do produto: uma instância por aba, compartilhada pelos painéis de chat. */
export const sendQueue = createSerialSendQueue();
