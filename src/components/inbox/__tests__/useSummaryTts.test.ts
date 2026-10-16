import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const tts = vi.hoisted(() => ({
  stop: vi.fn(),
  lastOptions: null as null | {
    voiceId?: string;
    speed?: number;
    onError?: (err: Error) => void;
    onAutoplayBlocked?: () => void;
  },
  lastArgs: null as null | { text: string; url: string; key: string },
  resolvers: [] as Array<() => void>,
  play: vi.fn(),
}));

const toastError = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://local.test',
  SUPABASE_ANON_KEY: 'anon-key',
}));

vi.mock('@/hooks/voice/playTtsAudio', () => ({
  playTtsAudio: (
    text: string,
    url: string,
    key: string,
    options: NonNullable<typeof tts.lastOptions>,
  ) => {
    tts.play(text, url, key, options);
    tts.lastOptions = options;
    tts.lastArgs = { text, url, key };
    let resolver: () => void = () => {};
    const promise = new Promise<void>((resolve) => { resolver = () => resolve(); });
    tts.resolvers.push(resolver);
    return { promise, stop: tts.stop };
  },
}));

vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }));

// A voz e a velocidade do 'Ouvir resumo' vêm da mesma fonte do seletor do cabeçalho.
vi.mock('@/hooks/system/useUserSettings', () => ({
  useUserSettings: () => ({
    settings: { tts_voice_id: 'CwhRBWXzGAHq8TQ4Fs17', tts_speed: 1.5 },
    isLoading: false,
  }),
}));

import { useSummaryTts } from '../summary/useSummaryTts';

beforeEach(() => {
  tts.stop.mockReset();
  tts.play.mockReset();
  tts.lastOptions = null;
  tts.lastArgs = null;
  tts.resolvers = [];
  toastError.mockReset();
});

describe('useSummaryTts — iniciar e parar', () => {
  it('começa a tocar chamando o player com a URL e a chave do projeto', () => {
    const { result } = renderHook(() => useSummaryTts('c1'));
    act(() => result.current.startTtsPlayback('Olá mundo'));

    expect(tts.lastArgs).toEqual({ text: 'Olá mundo', url: 'https://local.test', key: 'anon-key' });
    expect(result.current.isTtsPlaying).toBe(true);
    expect(result.current.lastTtsText).toBe('Olá mundo');
  });

  it('manda para o player a voz e a velocidade escolhidas no cabeçalho', () => {
    const { result } = renderHook(() => useSummaryTts('c1'));
    act(() => result.current.startTtsPlayback('Olá mundo'));

    expect(tts.lastOptions?.voiceId).toBe('CwhRBWXzGAHq8TQ4Fs17');
    expect(tts.lastOptions?.speed).toBe(1.5);
  });

  it('não chama o player para texto vazio ou só espaços', () => {
    const { result } = renderHook(() => useSummaryTts('c1'));
    act(() => result.current.startTtsPlayback('   '));
    expect(tts.play).not.toHaveBeenCalled();
    expect(result.current.isTtsPlaying).toBe(false);
  });

  it('chamar de novo enquanto toca interrompe a reprodução', () => {
    const { result } = renderHook(() => useSummaryTts('c1'));
    act(() => result.current.startTtsPlayback('Olá'));
    act(() => result.current.startTtsPlayback('Olá'));

    expect(tts.stop).toHaveBeenCalledTimes(1);
    expect(result.current.isTtsPlaying).toBe(false);
    expect(tts.play).toHaveBeenCalledTimes(1);
  });

  it('para de marcar como tocando quando a reprodução termina', async () => {
    const { result } = renderHook(() => useSummaryTts('c1'));
    act(() => result.current.startTtsPlayback('Olá'));

    await act(async () => { tts.resolvers[0](); });
    expect(result.current.isTtsPlaying).toBe(false);
  });
});

describe('useSummaryTts — aviso de autoplay bloqueado', () => {
  it('marca autoplayBlocked quando o player avisa', () => {
    const { result } = renderHook(() => useSummaryTts('c1'));
    act(() => result.current.startTtsPlayback('Olá'));

    act(() => { tts.lastOptions?.onAutoplayBlocked?.(); });
    expect(result.current.autoplayBlocked).toBe(true);
    expect(result.current.isTtsPlaying).toBe(false);
    expect(result.current.lastTtsText).toBe('Olá');
  });

  it('tentar de novo depois do bloqueio reproduz o último texto', () => {
    const { result } = renderHook(() => useSummaryTts('c1'));
    act(() => result.current.startTtsPlayback('Olá'));
    act(() => { tts.lastOptions?.onAutoplayBlocked?.(); });

    act(() => result.current.handleRetryAutoplay());
    expect(tts.play).toHaveBeenCalledTimes(2);
    expect(tts.lastArgs?.text).toBe('Olá');
    expect(result.current.autoplayBlocked).toBe(false);
  });

  it('dispensar o aviso limpa o estado e esquece o texto', () => {
    const { result } = renderHook(() => useSummaryTts('c1'));
    act(() => result.current.startTtsPlayback('Olá'));
    act(() => { tts.lastOptions?.onAutoplayBlocked?.(); });

    act(() => result.current.handleDismissAutoplayWarning());
    expect(result.current.autoplayBlocked).toBe(false);
    expect(result.current.lastTtsText).toBeNull();
  });
});

describe('useSummaryTts — erros', () => {
  it('não mostra erro quando a causa é o autoplay bloqueado', () => {
    const { result } = renderHook(() => useSummaryTts('c1'));
    act(() => result.current.startTtsPlayback('Olá'));
    act(() => { tts.lastOptions?.onError?.(new Error('AUTOPLAY_BLOCKED')); });
    expect(toastError).not.toHaveBeenCalled();
  });

  it('mostra erro em falha comum de geração de áudio', () => {
    const { result } = renderHook(() => useSummaryTts('c1'));
    act(() => result.current.startTtsPlayback('Olá'));
    act(() => { tts.lastOptions?.onError?.(new Error('falha de rede')); });
    expect(toastError).toHaveBeenCalledWith('Erro ao gerar áudio: falha de rede');
  });
});

describe('useSummaryTts — troca de contato', () => {
  it('zera o estado quando muda o contato', () => {
    const { result, rerender } = renderHook(({ id }) => useSummaryTts(id), {
      initialProps: { id: 'c1' },
    });
    act(() => result.current.startTtsPlayback('Olá'));
    expect(result.current.isTtsPlaying).toBe(true);

    rerender({ id: 'c2' });
    expect(result.current.isTtsPlaying).toBe(false);
    expect(result.current.isTtsLoading).toBe(false);
    expect(result.current.autoplayBlocked).toBe(false);
    expect(tts.stop).toHaveBeenCalled();
  });
});
