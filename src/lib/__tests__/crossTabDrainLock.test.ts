/**
 * PK-28 · paridade doc 06 — trava de drenagem da fila offline entre abas.
 *
 * O defeito que este teste prende: a fila é o MESMO IndexedDB para todas as abas
 * da origem e o `online` volta em todas elas. Sem coordenação, cada mensagem da
 * fila era entregue uma vez por aba.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeBroadcastChannel } from '@/test/fakeBroadcastChannel';
import {
  createCrossTabDrainLock,
  OFFLINE_QUEUE_LOCK_NAME,
  type CrossTabDrainLock,
} from '../crossTabDrainLock';

/**
 * `LockManager` de mentira que modela SÓ o que o módulo usa: `ifAvailable`.
 * Com a trava tomada, o callback recebe `null` e o navegador NÃO enfileira —
 * é exatamente essa a diferença que faz a aba perdedora desistir da drenagem.
 */
function fakeLockManager() {
  const tomadas = new Set<string>();
  const request = vi.fn(
    async (
      name: string,
      options: { ifAvailable?: boolean } | undefined,
      callback: (lock: { name: string } | null) => Promise<unknown>,
    ) => {
      if (options?.ifAvailable && tomadas.has(name)) return callback(null);
      tomadas.add(name);
      try {
        return await callback({ name });
      } finally {
        tomadas.delete(name);
      }
    },
  );
  return { request } as unknown as LockManager;
}

afterEach(() => {
  FakeBroadcastChannel.reset();
});

describe('createCrossTabDrainLock — navigator.locks', () => {
  it('duas abas no mesmo navegador: só a que pega a trava drena', async () => {
    const locks = fakeLockManager();
    const abaA = createCrossTabDrainLock({ locks, tabId: 'aba-a' });
    const abaB = createCrossTabDrainLock({ locks, tabId: 'aba-b' });

    let liberarA: () => void = () => {};
    const Asegurou = new Promise<void>((resolve) => {
      liberarA = resolve;
    });
    const drenouA = vi.fn(async () => {
      await Asegurou;
      return 'mensagem entregue por A';
    });
    const drenouB = vi.fn(async () => 'mensagem entregue por B');

    const corridaA = abaA.runExclusive(drenouA);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const resultadoB = await abaB.runExclusive(drenouB);
    expect(resultadoB).toEqual({ ran: false });
    expect(drenouB).not.toHaveBeenCalled();

    liberarA();
    await expect(corridaA).resolves.toEqual({ ran: true, value: 'mensagem entregue por A' });
    expect(drenouA).toHaveBeenCalledTimes(1);

    abaA.dispose();
    abaB.dispose();
  });

  it('liberada a trava, a próxima drenagem roda (a fila não fica presa)', async () => {
    const locks = fakeLockManager();
    const abaA = createCrossTabDrainLock({ locks, tabId: 'aba-a' });
    const abaB = createCrossTabDrainLock({ locks, tabId: 'aba-b' });

    await expect(abaA.runExclusive(async () => 'primeira')).resolves.toEqual({ ran: true, value: 'primeira' });
    // A já liberou: B pode drenar agora.
    await expect(abaB.runExclusive(async () => 'segunda')).resolves.toEqual({ ran: true, value: 'segunda' });

    abaA.dispose();
    abaB.dispose();
  });

  it('erro dentro da drenagem propaga e não deixa a trava presa', async () => {
    const locks = fakeLockManager();
    const aba = createCrossTabDrainLock({ locks, tabId: 'aba-a' });

    await expect(aba.runExclusive(async () => {
      throw new Error('entrega indisponível');
    })).rejects.toThrow('entrega indisponível');

    await expect(aba.runExclusive(async () => 'depois')).resolves.toEqual({ ran: true, value: 'depois' });
    aba.dispose();
  });
});

describe('createCrossTabDrainLock — eleição pelo BroadcastChannel', () => {
  /** Cada chamada abra uma "aba" nova ligada ao mesmo nome de canal. */
  function abrirCanal(name: string): BroadcastChannel {
    return new FakeBroadcastChannel(name) as unknown as BroadcastChannel;
  }

  function duasAbas() {
    const comum = {
      locks: null,
      settle: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
      now: () => 1_000,
      createChannel: abrirCanal,
    };
    return {
      abaA: createCrossTabDrainLock({ ...comum, tabId: 'aba-a' }),
      abaB: createCrossTabDrainLock({ ...comum, tabId: 'aba-b' }),
    };
  }

  it('sem navigator.locks: a eleição deixa uma aba com a drenagem e a outra desiste', async () => {
    const { abaA, abaB } = duasAbas();
    const drenouA = vi.fn(async () => 'A');
    const drenouB = vi.fn(async () => 'B');

    const corridaA = abaA.runExclusive(drenouA);
    const resultadoB = await abaB.runExclusive(drenouB);

    expect(resultadoB).toEqual({ ran: false });
    expect(drenouB).not.toHaveBeenCalled();
    await expect(corridaA).resolves.toEqual({ ran: true, value: 'A' });

    abaA.dispose();
    abaB.dispose();
  });

  it('sem canal (aba única): não há com quem disputar, então drena', async () => {
    const aba = createCrossTabDrainLock({ locks: null, createChannel: () => null });
    await expect(aba.runExclusive(async () => 'única')).resolves.toEqual({ ran: true, value: 'única' });
    aba.dispose();
  });

  it('a aba perdedora drena depois, quando a vencedora libera', async () => {
    const { abaA, abaB } = duasAbas();

    await expect(abaA.runExclusive(async () => 'A')).resolves.toEqual({ ran: true, value: 'A' });
    await expect(abaB.runExclusive(async () => 'B')).resolves.toEqual({ ran: true, value: 'B' });

    abaA.dispose();
    abaB.dispose();
  });
});

describe('createCrossTabDrainLock — contrato de nome', () => {
  it('usa o nome canônico da trava da fila offline', async () => {
    const locks = fakeLockManager();
    const aba: CrossTabDrainLock = createCrossTabDrainLock({ locks, tabId: 'aba-a' });
    await aba.runExclusive(async () => null);
    expect(locks.request).toHaveBeenCalledWith(
      OFFLINE_QUEUE_LOCK_NAME,
      { ifAvailable: true },
      expect.any(Function),
    );
    aba.dispose();
  });
});
