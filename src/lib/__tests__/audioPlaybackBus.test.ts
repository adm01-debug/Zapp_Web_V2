/**
 * `audioPlaybackBus` — o barramento que o atalho global `M` consulta.
 *
 * Contrato: com áudio tocando o toque silencia e o próximo restaura o volume
 * anterior (D4); SEM áudio tocando o barramento fica inerte, em vez de mutar um
 * áudio que ainda não começou (o mesmo contrato do `toggleMuteActive` do V3).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { getActiveAudioId, toggleMuteActive } from '@/lib/audioPlaybackBus';
import { getPlayingAudioId, pauseExclusiveAudio, playExclusiveAudio } from '@/hooks/chat/useExclusiveAudio';
import { DEFAULT_MEDIA_VOLUME_STATE, getSnapshot, setMuted, setVolume } from '@/lib/mediaVolumeStore';

const AUDIO = 'msg-audio-1';

describe('audioPlaybackBus', () => {
  beforeEach(() => {
    // Store de módulo: cada cenário parte do padrão (E01).
    setMuted(false);
    setVolume(DEFAULT_MEDIA_VOLUME_STATE.volume);
    const tocando = getPlayingAudioId();
    if (tocando) pauseExclusiveAudio(tocando);
  });

  it('sem áudio tocando não mexe no volume e não devolve estado', () => {
    expect(getActiveAudioId()).toBeNull();
    expect(toggleMuteActive()).toBeNull();
    expect(getSnapshot()).toEqual({ volume: 80, muted: false });
  });

  it('com áudio tocando: o primeiro toque silencia e o segundo devolve o volume anterior', () => {
    setVolume(60);
    playExclusiveAudio(AUDIO);

    expect(getActiveAudioId()).toBe(AUDIO);
    expect(toggleMuteActive()).toEqual({ muted: true, volume: 60 });
    expect(getSnapshot().muted).toBe(true);

    // D4: o mudo preserva o valor — volta para 60, não para o padrão.
    expect(toggleMuteActive()).toEqual({ muted: false, volume: 60 });
    expect(getSnapshot()).toEqual({ volume: 60, muted: false });
  });

  it('áudio pausado devolve o barramento ao estado inerte', () => {
    playExclusiveAudio(AUDIO);
    pauseExclusiveAudio(AUDIO);

    expect(getActiveAudioId()).toBeNull();
    expect(toggleMuteActive()).toBeNull();
    expect(getSnapshot().muted).toBe(false);
  });
});
