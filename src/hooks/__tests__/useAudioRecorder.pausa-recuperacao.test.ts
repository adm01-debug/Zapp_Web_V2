import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: 'test.webm' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/test.webm' } }),
      }),
    },
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  useAudioRecorder,
  levelBufferToHeights,
  sendWithBackoff,
  DRAFT_TTL_MS,
  type RecordingDraft,
  type RecordingDraftStore,
} from '@/hooks/communication/useAudioRecorder';

/** MediaRecorder mínimo: estados reais e contagem de pause/resume. */
class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  pauseCalls = 0;
  resumeCalls = 0;

  constructor() {
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = 'recording';
  }

  pause() {
    if (this.state !== 'recording') throw new Error('InvalidStateError');
    this.state = 'paused';
    this.pauseCalls += 1;
  }

  resume() {
    if (this.state !== 'paused') throw new Error('InvalidStateError');
    this.state = 'recording';
    this.resumeCalls += 1;
  }

  stop() {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    this.onstop?.();
  }

  /** Simula o microfone entregando o trecho capturado até aqui. */
  emitChunk(texto = 'audio') {
    this.ondataavailable?.({ data: new Blob([texto], { type: 'audio/webm' }) });
  }
}

function criarStoreFalso(inicial: RecordingDraft | null = null) {
  const estado = { draft: inicial as RecordingDraft | null };
  const store: RecordingDraftStore & { estado: typeof estado } = {
    estado,
    save: vi.fn(async (draft: RecordingDraft) => {
      estado.draft = draft;
    }),
    load: vi.fn(async () => estado.draft),
    clear: vi.fn(async () => {
      estado.draft = null;
    }),
  };
  return store;
}

async function iniciarGravacao(result: { current: ReturnType<typeof useAudioRecorder> }) {
  await act(async () => {
    await result.current.startRecording();
  });
}

describe('useAudioRecorder — pausa, recuperação e desfazer o descarte', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    FakeMediaRecorder.instances = [];
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:fake-url'),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('pausa congela o cronômetro e retomar continua de onde parou', async () => {
    const { result } = renderHook(() => useAudioRecorder({ userId: 'user-1', drafts: criarStoreFalso() }));
    await iniciarGravacao(result);

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.duration).toBe(2);

    act(() => result.current.pauseRecording());
    expect(result.current.isPaused).toBe(true);
    expect(FakeMediaRecorder.instances[0].pauseCalls).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    // Cinco segundos pausados não entram no áudio nem no contador.
    expect(result.current.duration).toBe(2);

    act(() => result.current.resumeRecording());
    expect(result.current.isPaused).toBe(false);
    expect(FakeMediaRecorder.instances[0].resumeCalls).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.duration).toBe(5);
  });

  it('descarte abre 5 s de desfazer e o desfazer devolve a gravação para a prévia', async () => {
    const store = criarStoreFalso();
    const onRecordingComplete = vi.fn();
    const { result } = renderHook(() =>
      useAudioRecorder({ userId: 'user-1', drafts: store, onRecordingComplete }),
    );
    await iniciarGravacao(result);
    act(() => FakeMediaRecorder.instances[0].emitChunk());
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    act(() => result.current.cancelRecording());
    expect(result.current.isRecording).toBe(false);
    expect(result.current.audioUrl).toBeNull();
    expect(result.current.discardedDraft).not.toBeNull();
    expect(result.current.discardSecondsLeft).toBe(5);
    // O trecho descartado ainda está no disco: descartar não apaga da memória do usuário.
    expect(store.save).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.discardedDraft).not.toBeNull();
    expect(result.current.discardSecondsLeft).toBe(1);

    act(() => result.current.undoDiscard());
    expect(result.current.discardedDraft).toBeNull();
    expect(result.current.discardSecondsLeft).toBe(0);
    expect(result.current.audioUrl).toBe('blob:fake-url');
    expect(onRecordingComplete).toHaveBeenCalledWith(expect.any(Blob), 'blob:fake-url');
    // Desfeito: saiu do disco, está na prévia.
    expect(store.clear).toHaveBeenCalled();
  });

  it('sem desfazer em 5 s, avisa o dono e mantém a gravação recuperável no disco', async () => {
    const store = criarStoreFalso();
    const onDiscardCommitted = vi.fn();
    const { result } = renderHook(() =>
      useAudioRecorder({ userId: 'user-1', drafts: store, onDiscardCommitted }),
    );
    await iniciarGravacao(result);
    act(() => FakeMediaRecorder.instances[0].emitChunk());

    act(() => result.current.cancelRecording());
    const salvo = await store.load('user-1');
    expect(salvo?.blob.size).toBeGreaterThan(0);

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.discardedDraft).toBeNull();
    expect(onDiscardCommitted).toHaveBeenCalledTimes(1);
    // O rascunho continua no store (recuperável), não foi apagado pelo descarte.
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('gravação concluída e não enviada vira rascunho em disco', async () => {
    const store = criarStoreFalso();
    const { result } = renderHook(() => useAudioRecorder({ userId: 'user-1', drafts: store }));
    await iniciarGravacao(result);
    act(() => FakeMediaRecorder.instances[0].emitChunk());

    act(() => result.current.stopRecording());

    expect(result.current.audioUrl).toBe('blob:fake-url');
    expect(store.save).toHaveBeenCalledTimes(1);
    const salvo = await store.load('user-1');
    expect(salvo?.userId).toBe('user-1');
    expect(salvo?.blob.size).toBeGreaterThan(0);
  });

  it('desmontar no meio da gravação guarda o trecho capturado em vez de perdê-lo', async () => {
    const store = criarStoreFalso();
    const { result, unmount } = renderHook(() => useAudioRecorder({ userId: 'user-1', drafts: store }));
    await iniciarGravacao(result);
    act(() => FakeMediaRecorder.instances[0].emitChunk());

    unmount();

    expect(store.save).toHaveBeenCalledTimes(1);
    const salvo = await store.load('user-1');
    expect(salvo?.blob.size).toBeGreaterThan(0);
  });

  it('recupera o rascunho órfão do usuário na montagem e o devolve para a prévia', async () => {
    const store = criarStoreFalso({
      userId: 'user-1',
      blob: new Blob(['orfao'], { type: 'audio/webm' }),
      createdAt: Date.now() - 1000,
    });
    const onRecordingComplete = vi.fn();
    const { result } = renderHook(() =>
      useAudioRecorder({ userId: 'user-1', drafts: store, onRecordingComplete }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.draftChecked).toBe(true);
    expect(result.current.recoveredDraft?.blob.size).toBe(5);

    act(() => result.current.acceptRecoveredDraft());
    expect(result.current.audioUrl).toBe('blob:fake-url');
    expect(result.current.recoveredDraft).toBeNull();
    expect(onRecordingComplete).toHaveBeenCalledWith(expect.any(Blob), 'blob:fake-url');
    // Saiu do disco (está na mão do usuário): não pode reaparecer como órfão.
    expect(store.clear).toHaveBeenCalledWith('user-1');
  });

  it('rascunho fora da janela do PD-63 é descartado sem virar oferta', async () => {
    const store = criarStoreFalso({
      userId: 'user-1',
      blob: new Blob(['velho'], { type: 'audio/webm' }),
      createdAt: Date.now() - DRAFT_TTL_MS - 1,
    });
    const { result } = renderHook(() => useAudioRecorder({ userId: 'user-1', drafts: store }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.draftChecked).toBe(true);
    expect(result.current.recoveredDraft).toBeNull();
    expect(store.clear).toHaveBeenCalledWith('user-1');
  });

  it('sem analisador de áudio, getLevel devolve -1 e o waveform cai no pulso fixo', async () => {
    const { result } = renderHook(() => useAudioRecorder({ userId: 'user-1', drafts: criarStoreFalso() }));
    await iniciarGravacao(result);
    expect(result.current.getLevel()).toBe(-1);
  });
});

describe('sendWithBackoff — retentativa com espera progressiva', () => {
  it('tenta 3 vezes antes de marcar erro definitivo e avisa o dono em cada espera', async () => {
    const send = vi.fn().mockRejectedValue(new Error('rede'));
    const onRetry = vi.fn();

    const entregue = await sendWithBackoff(send, { attempts: 3, backoffMs: [5, 10], onRetry });

    expect(entregue).toBe(false);
    expect(send).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, 5);
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, 10);
  });

  it('a segunda tentativa pode entregar: não marca erro', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValueOnce(undefined);

    const entregue = await sendWithBackoff(send, { attempts: 3, backoffMs: [5] });

    expect(entregue).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('levelBufferToHeights — waveform determinístico', () => {
  it('mapeia níveis em alturas entre o mínimo e o máximo, sem sorteio', () => {
    const random = vi.spyOn(Math, 'random');

    const alturas = levelBufferToHeights([0, 1], 4, 4, 28);

    expect(alturas).toEqual([4, 4, 28, 28]);
    expect(levelBufferToHeights([0, 1], 4, 4, 28)).toEqual(alturas);
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });

  it('sem amostra nenhuma devolve o mínimo (nada de barra fantasma)', () => {
    expect(levelBufferToHeights([], 3, 4, 28)).toEqual([4, 4, 4]);
  });
});
