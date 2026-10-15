/**
 * Atalho global `M` — mudo do áudio EM REPRODUÇÃO (paridade com o app antigo, doc 06).
 *
 * A porta de entrada é o registry global (`useGlobalKeyboardShortcuts`): com um áudio
 * tocando (barramento A01/PH-22) o toque silencia e o seguinte restaura o volume; SEM
 * áudio tocando o toque é inerte; e a guarda de input/modificador vale como para
 * qualquer atalho. O último caso prova a outra metade do cartão: o botão do balão
 * REFLETE o mudo (`aria-pressed` + rótulo pt-BR) — do MESMO store, sem segundo dono.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// Mocks comuns aos testes de controle de volume (logger/framer-motion/ResizeObserver).
import '@/test/volumeControlMocks';

vi.mock('@/lib/lazyToast', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { useGlobalKeyboardShortcuts } from '@/hooks/ui/useGlobalKeyboardShortcuts';
import { toast } from '@/lib/lazyToast';
import { MediaVolumeControl } from '@/components/inbox/MediaVolumeControl';
import { MEDIA_VOLUME_LABEL, MEDIA_VOLUME_LABEL_MUTED } from '@/lib/volumeLabels';
import { DEFAULT_MEDIA_VOLUME_STATE, getSnapshot, setMuted, setVolume } from '@/lib/mediaVolumeStore';
import { getPlayingAudioId, pauseExclusiveAudio, playExclusiveAudio } from '@/hooks/chat/useExclusiveAudio';

const AUDIO = 'msg-audio-1';

function Registry() {
  useGlobalKeyboardShortcuts();
  return null;
}

/** Monta o registry e, quando pedido, o botão do balão que tem de refletir o mudo. */
function montar({ botao = false, campo = false } = {}) {
  window.history.replaceState(null, '', '/?view=inbox');
  render(
    <MemoryRouter>
      <Registry />
      {botao && <MediaVolumeControl />}
      {campo && <input aria-label="campo de mensagem" />}
    </MemoryRouter>,
  );
}

function teclar(key: string, extra: KeyboardEventInit = {}, alvo: EventTarget = window) {
  fireEvent.keyDown(alvo, { key, bubbles: true, ...extra });
}

describe('atalho M — mudo do áudio em reprodução', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
    setMuted(false);
    setVolume(DEFAULT_MEDIA_VOLUME_STATE.volume);
    const tocando = getPlayingAudioId();
    if (tocando) pauseExclusiveAudio(tocando);
  });

  afterEach(cleanup);

  it('sem áudio tocando o M não mexe no volume e não anuncia nada', () => {
    montar();
    teclar('m');
    expect(getSnapshot()).toEqual({ volume: 80, muted: false });
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('com áudio tocando o M silencia e o toque seguinte restaura o volume anterior', () => {
    setVolume(60);
    montar();
    playExclusiveAudio(AUDIO);

    teclar('m');
    expect(getSnapshot()).toEqual({ volume: 60, muted: true });
    expect(toast.info).toHaveBeenCalledWith('🔇 Áudio silenciado', { duration: 1500 });

    teclar('m');
    // D4: o desmudo devolve os 60, não o padrão.
    expect(getSnapshot()).toEqual({ volume: 60, muted: false });
    expect(toast.info).toHaveBeenLastCalledWith('🔊 Volume em 60%', { duration: 1500 });
  });

  it('o botão do balão reflete o mudo com aria-pressed e rótulo pt-BR', () => {
    montar({ botao: true });
    playExclusiveAudio(AUDIO);

    const botao = screen.getByLabelText(`${MEDIA_VOLUME_LABEL}: 80%`);
    expect(botao).toHaveAttribute('aria-pressed', 'false');

    teclar('m');
    expect(screen.getByLabelText(MEDIA_VOLUME_LABEL_MUTED)).toHaveAttribute('aria-pressed', 'true');
  });

  it('não dispara com modificador (Ctrl+M, Alt+M) nem dentro de campo de texto', () => {
    montar({ campo: true });
    playExclusiveAudio(AUDIO);

    teclar('m', { ctrlKey: true });
    teclar('m', { altKey: true });
    teclar('m', {}, screen.getByLabelText('campo de mensagem'));

    expect(getSnapshot().muted).toBe(false);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('volta a ser inerte quando o áudio é pausado', () => {
    montar();
    playExclusiveAudio(AUDIO);
    pauseExclusiveAudio(AUDIO);

    teclar('m');
    expect(getSnapshot().muted).toBe(false);
    expect(toast.info).not.toHaveBeenCalled();
  });
});
