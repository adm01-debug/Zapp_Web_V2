import { describe, expect, it, vi } from 'vitest';

import { createFakeIndexedDb } from '@/test/fakeIndexedDb';
import {
  createIndexedDbOfflineQueueDriver,
  createMemoryOfflineQueueDriver,
  createOfflineQueue,
  drainOfflineQueueOnReconnect,
  OFFLINE_QUEUE_STORE,
  type OfflineQueueDriver,
  type OfflineQueueInput,
} from '../offlineQueue';

function mensagem(indice: number): OfflineQueueInput {
  return {
    clientMessageId: `id-${indice}`,
    contactId: 'contato-1',
    content: `mensagem ${indice}`,
    messageType: 'text',
    mediaUrl: null,
    caption: null,
    replyToId: null,
    whatsappConnectionId: null,
  };
}

describe('createOfflineQueue', () => {
  it('enfileira e drena na ordem de composição (3 mensagens offline, 3 na mesma ordem)', async () => {
    const queue = createOfflineQueue({ driver: createMemoryOfflineQueueDriver() });
    await queue.enqueue(mensagem(1));
    await queue.enqueue(mensagem(2));
    await queue.enqueue(mensagem(3));

    expect(queue.getSnapshot()).toBe(3);
    const entregues: string[] = [];
    const resultado = await queue.drain(async (item) => {
      entregues.push(item.content);
    });

    expect(entregues).toEqual(['mensagem 1', 'mensagem 2', 'mensagem 3']);
    expect(resultado).toEqual({ sent: 3, remaining: 0 });
    expect(queue.getSnapshot()).toBe(0);
  });

  it('não duplica o mesmo envio: a mesma chave continua sendo uma mensagem só', async () => {
    const queue = createOfflineQueue({ driver: createMemoryOfflineQueueDriver() });
    await queue.enqueue(mensagem(1));
    await queue.enqueue(mensagem(2));
    await queue.enqueue(mensagem(1));

    const fila = await queue.list();

    expect(fila.map((item) => item.clientMessageId)).toEqual(['id-1', 'id-2']);
    expect(queue.getSnapshot()).toBe(2);
  });

  it('para na primeira falha e mantém a ordem para a próxima tentativa', async () => {
    const queue = createOfflineQueue({ driver: createMemoryOfflineQueueDriver() });
    for (const indice of [1, 2, 3]) await queue.enqueue(mensagem(indice));

    const falhas: string[] = [];
    let deveFalhar = true;
    const primeira = await queue.drain(
      async (item) => {
        if (item.clientMessageId === 'id-2' && deveFalhar) throw new Error('rede caiu de novo');
        falhas.push(item.content);
      },
      { onError: (_erro, item) => falhas.push(`erro:${item?.clientMessageId}`) },
    );

    expect(primeira).toEqual({ sent: 1, remaining: 2 });
    expect(falhas).toEqual(['mensagem 1', 'erro:id-2']);

    deveFalhar = false;
    const segunda = await queue.drain(async (item) => {
      falhas.push(item.content);
    });

    expect(segunda).toEqual({ sent: 2, remaining: 0 });
    expect(falhas).toEqual(['mensagem 1', 'erro:id-2', 'mensagem 2', 'mensagem 3']);
  });

  it('uma drenagem por vez: dois gatilhos próximos não entregam a mesma mensagem duas vezes', async () => {
    const queue = createOfflineQueue({ driver: createMemoryOfflineQueueDriver() });
    await queue.enqueue(mensagem(1));

    const entregues = vi.fn(async () => {
      await Promise.resolve();
    });
    const [primeira, segunda] = await Promise.all([queue.drain(entregues), queue.drain(entregues)]);

    expect(entregues).toHaveBeenCalledTimes(1);
    expect(primeira).toEqual(segunda);
  });

  it('falha ao dar baixa na mensagem entregue passa por onError, para a drenagem e não rejeita', async () => {
    const driver = createMemoryOfflineQueueDriver();
    const queue = createOfflineQueue({ driver });
    await queue.enqueue(mensagem(1));
    await queue.enqueue(mensagem(2));

    let removerQuebrado = true;
    const removerOriginal = driver.remove.bind(driver);
    driver.remove = async (clientMessageId: string) => {
      if (removerQuebrado) throw new Error('IndexedDB perdeu a transação');
      return removerOriginal(clientMessageId);
    };

    const onError = vi.fn();
    const entregues: string[] = [];
    const primeira = await queue.drain(async (item) => {
      entregues.push(item.clientMessageId);
    }, { onError });

    // A 1ª foi entregue mas não saiu da fila: a drenagem para de forma
    // controlada (a 2ª não sai na frente) e o drain resolve, não rejeita.
    expect(primeira).toEqual({ sent: 1, remaining: 2 });
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ clientMessageId: 'id-1' }));

    removerQuebrado = false;
    const segunda = await queue.drain(async (item) => {
      entregues.push(item.clientMessageId);
    });

    // A 1ª é reenviada: quem impede a duplicata é a chave de idempotência
    // (`clientMessageId`, item 024), não a remoção local.
    expect(segunda).toEqual({ sent: 2, remaining: 0 });
    expect(entregues).toEqual(['id-1', 'id-1', 'id-2']);
  });

  it('falha de leitura da fila no meio da drenagem passa por onError e não vira rejeição solta', async () => {
    const driver = createMemoryOfflineQueueDriver();
    const queue = createOfflineQueue({ driver });
    await queue.enqueue(mensagem(1));
    await queue.enqueue(mensagem(2));

    // A listagem inicial do drain funciona; a releitura depois da entrega quebra.
    let leiturasNaDrenagem = 0;
    const lerOriginal = driver.readAll.bind(driver);
    driver.readAll = async () => {
      leiturasNaDrenagem += 1;
      if (leiturasNaDrenagem > 1) throw new Error('IndexedDB indisponível');
      return lerOriginal();
    };

    const onError = vi.fn();
    const entregues: string[] = [];
    const resultado = await queue.drain(async (item) => {
      entregues.push(item.clientMessageId);
    }, { onError });

    // A 1ª saiu, a 2ª ficou para a próxima: sem rejeição e com aviso no onError.
    expect(resultado).toEqual({ sent: 1, remaining: 2 });
    expect(entregues).toEqual(['id-1']);
    expect(onError).toHaveBeenCalled();
  });
});

describe('driver em IndexedDB', () => {
  it('grava no store próprio e sobrevive a um reload da fila', async () => {
    const fake = createFakeIndexedDb();
    const driver = createIndexedDbOfflineQueueDriver(fake.factory as unknown as IDBFactory);
    const queue = createOfflineQueue({ driver });
    await queue.enqueue(mensagem(1));
    await queue.enqueue(mensagem(2));

    // "Reload": uma fila nova sobre o MESMO IndexedDB.
    const driverNovo = createIndexedDbOfflineQueueDriver(fake.factory as unknown as IDBFactory);
    const depoisDoReload = createOfflineQueue({ driver: driverNovo });
    const fila = await depoisDoReload.list();

    expect(fake.storeNames('zapp-offline-outbox')).toEqual([OFFLINE_QUEUE_STORE]);
    expect(fila.map((item) => item.content)).toEqual(['mensagem 1', 'mensagem 2']);
  });

  it('remove da fila o que já foi entregue', async () => {
    const fake = createFakeIndexedDb();
    const driver = createIndexedDbOfflineQueueDriver(fake.factory as unknown as IDBFactory);
    const queue = createOfflineQueue({ driver });
    await queue.enqueue(mensagem(1));

    await queue.drain(async () => {});

    expect(await queue.list()).toEqual([]);
  });
});

describe('drainOfflineQueueOnReconnect', () => {
  it('drena quando o navegador avisa que voltou a rede', async () => {
    const driver = createMemoryOfflineQueueDriver();
    const queue = createOfflineQueue({ driver });
    await queue.enqueue(mensagem(1));

    const ouvintes = new Map<string, EventListener>();
    const escopo = {
      addEventListener: (tipo: string, ouvinte: EventListener) => ouvintes.set(tipo, ouvinte),
      removeEventListener: (tipo: string) => ouvintes.delete(tipo),
    };
    const entregues: string[] = [];
    const desligar = drainOfflineQueueOnReconnect(
      queue,
      async (item) => {
        entregues.push(item.content);
      },
      { scope: escopo },
    );

    expect(entregues).toEqual([]);
    ouvintes.get('online')?.(new Event('online'));
    await vi.waitFor(() => expect(entregues).toEqual(['mensagem 1']));

    desligar();
    expect(ouvintes.has('online')).toBe(false);
  });

  it('falha de leitura da fila não vira entrega falsa', async () => {
    const driverQuebrado: OfflineQueueDriver = {
      readAll: async () => {
        throw new Error('IndexedDB indisponível');
      },
      put: async () => {},
      remove: async () => {},
      clear: async () => {},
    };
    const queue = createOfflineQueue({ driver: driverQuebrado });
    const onError = vi.fn();

    expect(await queue.drain(async () => {}, { onError })).toEqual({ sent: 0, remaining: 0 });
    expect(onError).toHaveBeenCalledOnce();
  });
});
