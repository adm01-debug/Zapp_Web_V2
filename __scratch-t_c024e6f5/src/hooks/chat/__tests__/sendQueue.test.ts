/**
 * PK-21 — prova da fila SERIAL por conversa.
 *
 * O defeito de origem: o compositor travava até o enqueue + despacho no Edge + os
 * dois refetches, e não havia fila nenhuma — um segundo Enter durante um envio em
 * andamento era descartado. A fila abaixo é o alicerce do envio em série: uma fila
 * por conversa, ordem preservada, e nenhuma rejeição encadeada (um erro de rede
 * não pode travar os envios seguintes do mesmo contato).
 */
import { describe, expect, it, vi } from 'vitest';
import { createSerialSendQueue } from '../sendQueue';

describe('fila serial de envio por conversa (PK-21)', () => {
  it('preserva a ordem: a segunda só começa depois que a primeira termina', async () => {
    const fila = createSerialSendQueue();
    const ordem: string[] = [];
    let liberarPrimeira!: () => void;

    const primeira = fila.enqueue('conv-1', async () => {
      ordem.push('a:inicio');
      await new Promise<void>((resolve) => { liberarPrimeira = resolve; });
      ordem.push('a:fim');
    });
    const segunda = fila.enqueue('conv-1', async () => {
      ordem.push('b:inicio');
      ordem.push('b:fim');
    });

    await Promise.resolve();
    expect(ordem).toEqual(['a:inicio']);
    expect(fila.isBusy('conv-1')).toBe(true);

    liberarPrimeira();
    await Promise.all([primeira, segunda]);

    expect(ordem).toEqual(['a:inicio', 'a:fim', 'b:inicio', 'b:fim']);
    expect(fila.isBusy('conv-1')).toBe(false);
  });

  it('fila ociosa começa no mesmo tick — o Enter aciona o transporte dentro do evento', () => {
    const fila = createSerialSendQueue();
    const tarefa = vi.fn().mockReturnValue(undefined);

    fila.enqueue('conv-1', tarefa);

    // Sem esperar microtask: o acionamento (limite/assinatura) conta a chamada ali.
    expect(tarefa).toHaveBeenCalledTimes(1);
  });

  it('uma tarefa que falha libera a seguinte e propaga a própria rejeição', async () => {
    const fila = createSerialSendQueue();

    const primeira = fila.enqueue('conv-1', async () => { throw new Error('enqueue indisponível'); });
    const segunda = fila.enqueue('conv-1', async () => 'ok');

    await expect(primeira).rejects.toThrow('enqueue indisponível');
    await expect(segunda).resolves.toBe('ok');
    expect(fila.isBusy('conv-1')).toBe(false);
  });

  it('a fila de um contato não espera pela de outro', async () => {
    const fila = createSerialSendQueue();
    const ordem: string[] = [];
    let liberar!: () => void;

    const um = fila.enqueue('conv-1', async () => {
      ordem.push('um:inicio');
      await new Promise<void>((resolve) => { liberar = resolve; });
      ordem.push('um:fim');
    });
    const dois = fila.enqueue('conv-2', async () => { ordem.push('dois'); });

    await dois;
    expect(ordem).toEqual(['um:inicio', 'dois']);

    liberar();
    await um;
    expect(ordem).toEqual(['um:inicio', 'dois', 'um:fim']);
  });

  it('tarefa que lança em vez de rejeitar vira rejeição — nunca exceção síncrona', async () => {
    const fila = createSerialSendQueue();
    const erro = new Error('falha síncrona');
    let entrega: Promise<unknown> | undefined;
    expect(() => {
      entrega = fila.enqueue('conv-1', () => {
        throw erro;
      });
    }).not.toThrow();
    await expect(entrega).rejects.toBe(erro);
    // A fila não trava: o próximo envio da mesma conversa anda normalmente.
    await expect(fila.enqueue('conv-1', async () => 'depois')).resolves.toBe('depois');
    expect(fila.isBusy('conv-1')).toBe(false);
  });
});
