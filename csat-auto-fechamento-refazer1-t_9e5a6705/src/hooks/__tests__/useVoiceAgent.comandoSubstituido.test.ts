import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { VoiceAgentAction } from '@/hooks/voice/types';

/**
 * R2-INB-048 (item 342) — "Comando antigo de voz ainda aplica ação depois de um comando mais recente".
 *
 * Fixture da auditoria (voice_old_tts_applies_old_action): comando A já em fala (TTS tocando),
 * comando B entra, B termina, e só então a fala de A termina. A ação aplicada tem de ser só a do
 * comando vigente (B); A não pode chamar onAction, nem registrar log de sucesso, nem mexer na fase.
 */

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/logger', () => {
  const logger = { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() };
  return { log: logger, getLogger: () => logger };
});

const h = vi.hoisted(() => ({
  scribeOptions: undefined as
    | { onCommittedTranscript?: (data: { text: string }) => void; onPartialTranscript?: (data: { text: string }) => void }
    | undefined,
  scribe: { connect: vi.fn(async () => {}), disconnect: vi.fn(), isConnected: false },
  transcripts: new Map<string, { resolve: (value: VoiceAgentAction) => void }>(),
  tts: [] as Array<{ text: string; resolve: () => void; stop: ReturnType<typeof vi.fn> }>,
}));

vi.mock('@elevenlabs/react', () => ({
  CommitStrategy: { VAD: 'vad' },
  useScribe: (options: unknown) => {
    h.scribeOptions = options as typeof h.scribeOptions;
    return h.scribe;
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'token-sintetico' } } })),
      getUser: vi.fn(async () => ({ data: { user: null } })),
    },
    functions: { invoke: vi.fn(async () => ({ data: { token: 'token-scribe' }, error: null })) },
  },
  SUPABASE_URL: 'https://banco-local.invalid',
  SUPABASE_ANON_KEY: 'anon-key-local',
}));

// Transcrição controlada: cada texto só conclui quando o teste mandar.
vi.mock('@/hooks/voice/processTranscript', () => ({
  processVoiceTranscript: vi.fn(
    (text: string) =>
      new Promise<VoiceAgentAction>((resolve) => {
        h.transcripts.set(text, { resolve });
      })
  ),
}));

// Fala controlada: cada resposta só "termina de tocar" quando o teste mandar.
vi.mock('@/hooks/voice/playTtsAudio', () => ({
  playTtsAudio: vi.fn((text: string) => {
    let resolve!: () => void;
    const promise = new Promise<void>((res) => {
      resolve = res;
    });
    const stop = vi.fn();
    h.tts.push({ text, resolve, stop });
    return { promise, stop };
  }),
}));

vi.mock('@/hooks/voice/logVoiceCommand', () => ({ logVoiceCommand: vi.fn() }));

import { useVoiceAgent } from '@/hooks/communication/useVoiceAgent';
import { logVoiceCommand } from '@/hooks/voice/logVoiceCommand';

const drain = async () => {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
};

const comando = (text: string, route: string, response: string): VoiceAgentAction => ({
  action: 'navigate',
  response,
  data: { route },
});

describe('useVoiceAgent — comando de voz substituído (R2-INB-048)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.transcripts.clear();
    h.tts.length = 0;
    h.scribeOptions = undefined;
    h.scribe.isConnected = false;
  });

  it('aplica só a ação do comando vigente e não deixa a fala antiga concluir a ação', async () => {
    const onAction = vi.fn();
    renderHook(() => useVoiceAgent({ onAction }));

    // Comando A: processa e entra em fala (TTS de A ainda tocando).
    act(() => {
      h.scribeOptions?.onCommittedTranscript?.({ text: 'abrir inbox' });
    });
    await drain();
    await act(async () => {
      h.transcripts.get('abrir inbox')?.resolve(comando('abrir inbox', 'inbox', 'Abrindo a inbox.'));
    });
    await drain();

    expect(h.tts).toHaveLength(1);
    expect(h.tts[0].text).toBe('Abrindo a inbox.');
    expect(onAction).not.toHaveBeenCalled();

    // Comando B chega enquanto A ainda fala: substitui A (para a fala antiga) sem cancelar B.
    act(() => {
      h.scribeOptions?.onCommittedTranscript?.({ text: 'abrir contatos' });
    });
    expect(h.tts[0].stop).toHaveBeenCalledTimes(1);

    await drain();
    await act(async () => {
      h.transcripts.get('abrir contatos')?.resolve(comando('abrir contatos', 'contacts', 'Abrindo os contatos.'));
    });
    await drain();
    expect(h.tts).toHaveLength(2);
    await act(async () => {
      h.tts[1].resolve();
    });
    await drain();

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'navigate', data: { route: 'contacts' } }));

    // A fala de A termina DEPOIS da de B: nada de aplicar a ação velha.
    await act(async () => {
      h.tts[0].resolve();
    });
    await drain();

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({ action: 'navigate', data: { route: 'contacts' } });
    expect(logVoiceCommand).toHaveBeenCalledTimes(1);
    expect(logVoiceCommand).toHaveBeenCalledWith(expect.objectContaining({ transcript: 'abrir contatos', success: true }));
  });
});
