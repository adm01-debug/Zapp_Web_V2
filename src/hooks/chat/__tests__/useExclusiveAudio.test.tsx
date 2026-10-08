import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  getPlayingAudioId,
  pauseExclusiveAudio,
  playExclusiveAudio,
  registerExclusiveAudio,
  useExclusiveAudio,
} from '../useExclusiveAudio';

/**
 * A01 — store de reprodução exclusiva da aba Arquivos. É um singleton de módulo: cada teste
 * devolve o estado original cancelando os registros que abriu.
 */
const registros: Array<() => void> = [];

function controlador() {
  return { pause: vi.fn() };
}

function registrar(id: string, controller = controlador()) {
  const cancelar = registerExclusiveAudio(id, controller);
  registros.push(cancelar);
  return controller;
}

afterEach(() => {
  while (registros.length > 0) registros.pop()?.();
  expect(getPlayingAudioId()).toBeNull();
});

describe('useExclusiveAudio (A01/D02)', () => {
  it('nasce sem áudio tocando e marca o id ao tocar', () => {
    expect(getPlayingAudioId()).toBeNull();
    registrar('a1');

    playExclusiveAudio('a1');

    expect(getPlayingAudioId()).toBe('a1');
  });

  it('tocar o item B pausa o A: só um áudio por vez', () => {
    const a = registrar('a1');
    const b = registrar('b1');

    playExclusiveAudio('a1');
    playExclusiveAudio('b1');

    expect(a.pause).toHaveBeenCalledTimes(1);
    expect(b.pause).not.toHaveBeenCalled();
    expect(getPlayingAudioId()).toBe('b1');
  });

  it('tocar o mesmo id de novo não pausa ninguém (idempotente)', () => {
    const a = registrar('a1');

    playExclusiveAudio('a1');
    playExclusiveAudio('a1');

    expect(a.pause).not.toHaveBeenCalled();
    expect(getPlayingAudioId()).toBe('a1');
  });

  it('pause(id) para o áudio daquele id e não mexe em quem toca por outro motivo', () => {
    const a = registrar('a1');
    const b = registrar('b1');

    playExclusiveAudio('a1');
    playExclusiveAudio('b1');
    pauseExclusiveAudio('a1');

    expect(a.pause).toHaveBeenCalledTimes(2);
    expect(getPlayingAudioId()).toBe('b1');

    pauseExclusiveAudio('b1');
    expect(getPlayingAudioId()).toBeNull();
  });

  it('cancelar o registro (desmontar) pausa o som e libera o áudio para os outros', () => {
    const a = registrar('a1');
    playExclusiveAudio('a1');

    registros.pop()?.();

    expect(a.pause).toHaveBeenCalled();
    expect(getPlayingAudioId()).toBeNull();

    // Nada de id pendurado: o próximo registro assume o áudio normalmente.
    registrar('b1');
    playExclusiveAudio('b1');
    expect(getPlayingAudioId()).toBe('b1');
    pauseExclusiveAudio('b1');
    expect(getPlayingAudioId()).toBeNull();
  });

  it('o hook re-renderiza quem lê e devolve ações de identidade estável', () => {
    const { result, rerender } = renderHook(() => useExclusiveAudio());
    const acoes = result.current;
    expect(result.current.playingId).toBeNull();

    const a = registrar('a1');
    act(() => playExclusiveAudio('a1'));
    rerender();

    expect(result.current.playingId).toBe('a1');
    expect(result.current.play).toBe(acoes.play);
    expect(result.current.pause).toBe(acoes.pause);
    expect(result.current.register).toBe(acoes.register);

    act(() => pauseExclusiveAudio('a1'));
    rerender();

    expect(result.current.playingId).toBeNull();
    expect(a.pause).toHaveBeenCalled();
  });

  it('tocar outro id re-renderiza o leitor com o novo dono do áudio', () => {
    const { result, rerender } = renderHook(() => useExclusiveAudio());
    registrar('a1', controlador());
    registrar('b1', controlador());

    act(() => playExclusiveAudio('a1'));
    rerender();
    expect(result.current.playingId).toBe('a1');

    act(() => playExclusiveAudio('b1'));
    rerender();
    expect(result.current.playingId).toBe('b1');
  });
});
