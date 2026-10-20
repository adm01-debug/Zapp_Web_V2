import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * t_a8b2a47f — o estado de reprodução guardado por `messageId`
 * (`src/lib/audioPlayerState.ts`).
 *
 * O que este arquivo mede é o CONTRATO do store que o hook do balão usa para sobreviver à
 * remontagem da lista virtualizada do chat: o que foi guardado volta igual (e como cópia),
 * campo novo não apaga o antigo, valor inválido (`NaN`, negativo) não estraga o que já
 * estava bom, entrada velha expira em 30 min e o Map não cresce sem teto.
 */

import {
  AUDIO_STATE_MAX_ENTRIES,
  AUDIO_STATE_TTL_MS,
  audioStateCount,
  forgetAudioState,
  readAudioState,
  saveAudioState,
  type PersistedAudioState,
} from '@/lib/audioPlayerState';

/** Ids usados no teste, para o Map de módulo não vazar de um caso para o outro. */
let usados: string[] = [];

function gravar(id: string, patch: Partial<PersistedAudioState>) {
  usados.push(id);
  return saveAudioState(id, patch);
}

beforeEach(() => {
  usados = [];
});

afterEach(() => {
  usados.forEach((id) => forgetAudioState(id));
  vi.restoreAllMocks();
});

describe('audioPlayerState — estado guardado por messageId', () => {
  it('guarda posição e velocidade e devolve uma CÓPIA (mexer no lido não muda o guardado)', () => {
    expect(gravar('m1', { currentTime: 42, playbackRate: 1.5 })).toEqual({
      currentTime: 42,
      playbackRate: 1.5,
      paused: true,
    });
    expect(readAudioState('m1')).toEqual({ currentTime: 42, playbackRate: 1.5, paused: true });

    const lido = readAudioState('m1');
    lido!.currentTime = 99;
    expect(readAudioState('m1')!.currentTime, 'o guardado não é o objeto devolvido').toBe(42);
  });

  it('funde os campos sem apagar o que já existe e ignora valor inválido', () => {
    gravar('m2', { currentTime: 10 });
    gravar('m2', { playbackRate: 2 });
    expect(readAudioState('m2')).toEqual({ currentTime: 10, playbackRate: 2, paused: true });

    gravar('m2', { currentTime: Number.NaN, playbackRate: -1 });
    expect(readAudioState('m2'), 'NaN/negativo não apaga o bom').toEqual({
      currentTime: 10,
      playbackRate: 2,
      paused: true,
    });
  });

  it('não guarda nada para messageId vazio', () => {
    expect(saveAudioState('', { currentTime: 5 })).toBeNull();
    expect(readAudioState('')).toBeNull();
  });

  it('a entrada expira em 30 min (e não antes)', () => {
    const agora = Date.now();
    const relogio = vi.spyOn(Date, 'now').mockReturnValue(agora);
    gravar('m3', { currentTime: 7 });

    relogio.mockReturnValue(agora + AUDIO_STATE_TTL_MS - 1);
    expect(readAudioState('m3'), 'dentro do TTL').not.toBeNull();

    relogio.mockReturnValue(agora + AUDIO_STATE_TTL_MS);
    expect(readAudioState('m3'), 'no TTL já expirou').toBeNull();
  });

  it('respeita o teto: com mais de 200 entradas, a atualizada há mais tempo sai', () => {
    for (let i = 0; i < AUDIO_STATE_MAX_ENTRIES; i += 1) gravar(`g${i}`, { currentTime: i });
    expect(audioStateCount()).toBe(AUDIO_STATE_MAX_ENTRIES);

    gravar('novo', { currentTime: 1 });
    expect(audioStateCount(), 'o teto não é furado').toBe(AUDIO_STATE_MAX_ENTRIES);
    expect(readAudioState('g0'), 'a mais antiga saiu').toBeNull();
    expect(readAudioState('g1'), 'a seguinte continua').not.toBeNull();
    expect(readAudioState('novo'), 'a recém-guardada fica').not.toBeNull();
  });

  it('tocar de novo a MESMA mensagem a rejuvenesce no teto (não é descartada por engano)', () => {
    for (let i = 0; i < AUDIO_STATE_MAX_ENTRIES; i += 1) gravar(`h${i}`, { currentTime: i });
    gravar('h0', { currentTime: 30 }); // reinsere no fim: h0 passa a ser a mais recente
    gravar('mais-nova', { currentTime: 1 });
    expect(audioStateCount()).toBe(AUDIO_STATE_MAX_ENTRIES);
    expect(readAudioState('h0'), 'h0 foi rejuvenescida').not.toBeNull();
    expect(readAudioState('h1'), 'a que nunca foi tocada de novo saiu').toBeNull();
  });
});
