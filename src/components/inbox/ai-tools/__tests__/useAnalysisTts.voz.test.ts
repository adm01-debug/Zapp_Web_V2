import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const tts = vi.hoisted(() => ({
  play: vi.fn(),
  lastOptions: null as null | { voiceId?: string; speed?: number },
}));

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://local.test',
  SUPABASE_ANON_KEY: 'anon-key',
}));

vi.mock('@/hooks/voice/playTtsAudio', () => ({
  playTtsAudio: (text: string, url: string, key: string, options: { voiceId?: string; speed?: number }) => {
    tts.play(text, url, key, options);
    tts.lastOptions = options;
    return { promise: Promise.resolve(), stop: vi.fn() };
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// A voz e a velocidade saem do mesmo lugar que o seletor do cabeçalho (`user_settings`).
vi.mock('@/hooks/system/useUserSettings', () => ({
  useUserSettings: () => ({
    settings: { tts_voice_id: 'CwhRBWXzGAHq8TQ4Fs17', tts_speed: 1.5 },
    isLoading: false,
  }),
}));

import { useAnalysisTts } from '../useAnalysisTts';

describe('useAnalysisTts — voz e velocidade das ferramentas de IA', () => {
  beforeEach(() => {
    tts.play.mockReset();
    tts.lastOptions = null;
  });

  it('manda para o player a voz e a velocidade escolhidas no cabeçalho', () => {
    const { result } = renderHook(() => useAnalysisTts());
    act(() => result.current.startTtsPlayback('Resumo da conversa'));

    expect(tts.play).toHaveBeenCalledTimes(1);
    expect(tts.lastOptions?.voiceId).toBe('CwhRBWXzGAHq8TQ4Fs17');
    expect(tts.lastOptions?.speed).toBe(1.5);
  });

  it('não começa a falar com texto vazio', () => {
    const { result } = renderHook(() => useAnalysisTts());
    act(() => result.current.startTtsPlayback('   '));

    expect(tts.play).not.toHaveBeenCalled();
  });
});
