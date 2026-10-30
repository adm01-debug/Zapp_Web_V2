import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FakeBroadcastChannel } from '@/test/fakeBroadcastChannel';
import { createCrossTabSendDedupe, SEND_DEDUPE_WINDOW_MS, type CrossTabSendDedupe } from '../crossTabSendDedupe';

const CHAVE = 'contato-1|text|Bom dia';

/** Canal de mentira: entrega a mensagem às outras "abas" do mesmo nome. */
const criarCanal = (nome: string) => new FakeBroadcastChannel(nome) as unknown as BroadcastChannel;

function abrirAba(tabId: string, agora: () => number): CrossTabSendDedupe {
  return createCrossTabSendDedupe({ tabId, now: agora, createChannel: criarCanal });
}

describe('createCrossTabSendDedupe', () => {
  let agora = 1_000;

  beforeEach(() => {
    agora = 1_000;
    FakeBroadcastChannel.reset();
  });

  afterEach(() => {
    FakeBroadcastChannel.reset();
  });

  it('a segunda aba adota o MESMO clientMessageId e não manda nada', async () => {
    const abaA = abrirAba('aba-a', () => agora);
    const abaB = abrirAba('aba-b', () => agora);

    const primeira = await abaA.claim(CHAVE, 'id-da-aba-a');
    const segunda = await abaB.claim(CHAVE, 'id-da-aba-b');

    expect(primeira).toEqual({ owner: true, clientMessageId: 'id-da-aba-a' });
    expect(segunda).toEqual({ owner: false, clientMessageId: 'id-da-aba-a' });
  });

  it('duas abas enviando no mesmo instante: exatamente uma vira dona', async () => {
    const abaA = abrirAba('aba-a', () => agora);
    const abaB = abrirAba('aba-b', () => agora);

    const [resultadoA, resultadoB] = await Promise.all([
      abaA.claim(CHAVE, 'id-da-aba-a'),
      abaB.claim(CHAVE, 'id-da-aba-b'),
    ]);

    const donas = [resultadoA, resultadoB].filter((resultado) => resultado.owner);
    expect(donas).toHaveLength(1);
    // As duas abas apontam para a mesma mensagem, seja quem for a dona.
    const ids = new Set([resultadoA.clientMessageId, resultadoB.clientMessageId]);
    expect(ids.size).toBe(1);
  });

  it('depois do release, um envio deliberado igual manda de novo', async () => {
    const abaA = abrirAba('aba-a', () => agora);
    const abaB = abrirAba('aba-b', () => agora);

    await abaA.claim(CHAVE, 'id-da-aba-a');
    abaA.release(CHAVE);
    const segunda = await abaB.claim(CHAVE, 'id-da-aba-b');

    expect(segunda).toEqual({ owner: true, clientMessageId: 'id-da-aba-b' });
  });

  it('fora da janela de dedupe a ação conta como nova', async () => {
    const abaA = abrirAba('aba-a', () => agora);
    await abaA.claim(CHAVE, 'id-da-aba-a');

    agora += SEND_DEDUPE_WINDOW_MS + 1;
    const abaB = abrirAba('aba-b', () => agora);

    expect(await abaB.claim(CHAVE, 'id-da-aba-b')).toEqual({ owner: true, clientMessageId: 'id-da-aba-b' });
  });

  it('sem canal (aba única) o envio nunca para', async () => {
    const semCanal = createCrossTabSendDedupe({ tabId: 'aba-so', now: () => agora, createChannel: () => null });

    expect(await semCanal.claim(CHAVE, 'id-1')).toEqual({ owner: true, clientMessageId: 'id-1' });
    expect(await semCanal.claim(CHAVE, 'id-2')).toEqual({ owner: true, clientMessageId: 'id-2' });
  });

  it('dispose fecha o canal e esquece as reivindicações', async () => {
    const canal = new FakeBroadcastChannel('fechamento');
    const aba = createCrossTabSendDedupe({
      tabId: 'aba-a',
      now: () => agora,
      createChannel: () => canal as unknown as BroadcastChannel,
    });
    await aba.claim(CHAVE, 'id-da-aba-a');

    aba.dispose();

    expect(canal.close).toHaveBeenCalledTimes(1);
    const outra = abrirAba('aba-b', () => agora);
    expect(await outra.claim(CHAVE, 'id-da-aba-b')).toEqual({ owner: true, clientMessageId: 'id-da-aba-b' });
  });
});
