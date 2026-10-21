import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: 'token-de-teste' } } })),
    },
    functions: {
      invoke: vi.fn(() => Promise.resolve({ data: { token: 'scribe-token' }, error: null })),
    },
  },
  SUPABASE_URL: 'https://projeto-de-teste.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key-de-teste',
}));

const hoisted = vi.hoisted(() => ({
  options: null as null | {
    onPartialTranscript?: (data: { text: string }) => void;
    onCommittedTranscript?: (data: { text: string }) => void;
  },
  scribe: null as null | {
    isConnected: boolean;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  },
}));

vi.mock('@elevenlabs/react', () => ({
  CommitStrategy: { VAD: 'vad' },
  useScribe: (options: unknown) => {
    hoisted.options = options as (typeof hoisted)['options'];
    // O objeto é ESTÁVEL entre renders (como o do @elevenlabs/react): se cada render
    // devolvesse um objeto novo, `isConnected` voltaria a false depois do connect.
    if (!hoisted.scribe) {
      hoisted.scribe = {
        isConnected: false,
        connect: vi.fn(async () => {
          hoisted.scribe!.isConnected = true;
        }),
        disconnect: vi.fn(() => {
          hoisted.scribe!.isConnected = false;
        }),
      };
    }
    return hoisted.scribe;
  },
}));

vi.mock('@/hooks/voice/processTranscript', () => ({ processVoiceTranscript: vi.fn() }));
vi.mock('@/hooks/voice/logVoiceCommand', () => ({ logVoiceCommand: vi.fn() }));
vi.mock('@/hooks/voice/playTtsAudio', () => ({
  playTtsAudio: vi.fn(() => ({ stop: vi.fn(), promise: Promise.resolve(), playObjectUrl: vi.fn() })),
}));

import { useVoiceAgent } from '@/hooks/communication/useVoiceAgent';

/**
 * #347 — a sessão do microfone (Scribe) ficava aberta para sempre: sem teto de
 * inatividade, sem teto de duração e sem parar quando a aba saía de foco (o
 * microfone continuava captando o ambiente). Aqui o hook REAL roda com o Scribe
 * falso e o relógio controlado: o teste prova que a sessão TERMINA sozinha, que a
 * fala reinicia o relógio de inatividade (e por isso o comando em curso não é
 * cortado) e que o fim NÃO se religa sozinho.
 */
describe('useVoiceAgent — limites da sessão de microfone (#347)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hoisted.scribe = null;
    hoisted.options = null;
    definirVisibilidade('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function definirVisibilidade(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  }

  async function escutar() {
    const { result } = renderHook(() => useVoiceAgent({}));
    await act(async () => {
      await result.current.startListening();
    });
    expect(result.current.phase).toBe('listening');
    expect(hoisted.scribe?.isConnected).toBe(true);
    return result;
  }

  async function avancar(ms: number) {
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
  }

  it('60 s sem fala encerram a escuta com aviso em pt-BR', async () => {
    const result = await escutar();

    await avancar(59_000);
    expect(result.current.phase).toBe('listening');
    expect(hoisted.scribe!.disconnect).not.toHaveBeenCalled();

    await avancar(2_000);

    expect(hoisted.scribe!.disconnect).toHaveBeenCalledTimes(1);
    expect(hoisted.scribe!.isConnected).toBe(false);
    expect(result.current.phase).toBe('idle');
    expect(result.current.error).toContain('60 segundos');
  });

  it('uma fala reinicia o relógio de inatividade (não corta o comando em curso)', async () => {
    const result = await escutar();

    await avancar(40_000);
    await act(async () => {
      hoisted.options!.onPartialTranscript!({ text: 'quais conversas' });
    });
    await avancar(40_000);

    expect(hoisted.scribe!.disconnect).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('listening');

    await avancar(25_000);

    expect(hoisted.scribe!.disconnect).toHaveBeenCalledTimes(1);
    expect(result.current.error).toContain('60 segundos');
  });

  it('teto de duração encerra a sessão mesmo com fala o tempo todo', async () => {
    const result = await escutar();

    for (let i = 0; i < 10; i++) {
      await avancar(30_000);
      await act(async () => {
        hoisted.options!.onPartialTranscript!({ text: 'seguindo' });
      });
    }

    expect(hoisted.scribe!.disconnect).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('idle');
    expect(result.current.error).toContain('5 minutos');
  });

  it('aba oculta encerra a escuta (o microfone não fica captando o ambiente)', async () => {
    const result = await escutar();

    definirVisibilidade('hidden');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(hoisted.scribe!.disconnect).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('idle');
    expect(result.current.error).toContain('aba');
  });

  it('depois do limite não há laço de reconexão', async () => {
    const result = await escutar();

    await avancar(60_000);
    expect(hoisted.scribe!.connect).toHaveBeenCalledTimes(1);

    await avancar(30_000);

    expect(hoisted.scribe!.connect).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('idle');
  });

  it('stopListening cancela os relógios: nada encerra depois disso', async () => {
    const result = await escutar();

    await act(async () => {
      result.current.stopListening();
    });
    expect(hoisted.scribe!.disconnect).toHaveBeenCalledTimes(1);

    await avancar(10 * 60_000);

    expect(hoisted.scribe!.disconnect).toHaveBeenCalledTimes(1);
  });
});
