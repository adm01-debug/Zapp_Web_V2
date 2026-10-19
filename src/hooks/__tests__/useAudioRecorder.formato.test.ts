/**
 * G9 — o gravador do inbox escolhe um formato que o navegador sabe gravar.
 *
 * Defeito original: `new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })`
 * fixo. No Safari (sem WebM) a construção lança e o `catch` genérico culpa o
 * microfone; o blob e o upload também saíam sempre rotulados como webm/mp4.
 * Aqui `isTypeSupported` é simulado por navegador e o blob/upload reais são
 * conferidos.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { uploadMock, getPublicUrlMock, toastMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  getPublicUrlMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({ upload: uploadMock, getPublicUrl: getPublicUrlMock })),
    },
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: toastMock,
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  createLogger: vi.fn(() => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })),
  getLogger: vi.fn(() => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })),
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) },
}));

vi.mock('@/utils/audioToMp3', () => ({
  convertAudioToMp3: vi.fn(async (blob: Blob) => ({ ok: false, blob })),
}));

import { useAudioRecorder } from '@/hooks/communication/useAudioRecorder';

/**
 * MediaRecorder fake do navegador pedido: `isTypeSupported` aceita só os
 * prefixos passados (`null` = navegador sem isTypeSupported) e o recorder
 * informa o `mimeType` que recebeu — como o real.
 */
function makeFakeRecorder(suportados: string[] | null) {
  return class FakeMediaRecorder {
    static instances: FakeMediaRecorder[] = [];
    static isTypeSupported = suportados
      ? (tipo: string) => suportados.some((s) => tipo.startsWith(s))
      : undefined;
    mimeType: string;
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    state: 'inactive' | 'recording' = 'inactive';
    start = vi.fn(() => {
      this.state = 'recording';
    });
    stop = vi.fn(() => {
      this.state = 'inactive';
      this.onstop?.();
    });
    constructor(_stream: unknown, options?: { mimeType?: string }) {
      this.mimeType = options?.mimeType ?? '';
      FakeMediaRecorder.instances.push(this);
    }
  };
}

function makeMediaStream() {
  const track = { stop: vi.fn(), kind: 'audio', readyState: 'live' };
  return { stream: { getTracks: () => [track] }, track };
}

type FakeRecorder = ReturnType<typeof makeFakeRecorder>;

/** Inicia a gravação e devolve o recorder fake criado. */
async function iniciar(result: { current: ReturnType<typeof useAudioRecorder> }) {
  await act(async () => {
    await result.current.startRecording();
  });
}

describe('useAudioRecorder — formato de gravação e upload (G9)', () => {
  const getUserMedia = vi.fn();
  let Fake: FakeRecorder;

  function stubMediaRecorder(suportados: string[] | null) {
    Fake = makeFakeRecorder(suportados) as unknown as FakeRecorder;
    vi.stubGlobal('MediaRecorder', Fake);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    uploadMock.mockResolvedValue({ data: { path: 'x' }, error: null });
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: 'https://example.com/audio' } });
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:fake'), configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('no Safari (só audio/mp4) grava e rotula o blob como mp4', async () => {
    stubMediaRecorder(['audio/mp4']);
    const { stream } = makeMediaStream();
    getUserMedia.mockResolvedValue(stream);
    const onRecordingComplete = vi.fn();

    const { result } = renderHook(() => useAudioRecorder({ onRecordingComplete }));
    await iniciar(result);

    const recorder = (Fake as unknown as { instances: Array<{ mimeType: string; ondataavailable: ((e: { data: Blob }) => void) | null; onstop: (() => void) | null }> }).instances[0];
    expect(recorder.mimeType).toContain('audio/mp4');

    act(() => {
      recorder.ondataavailable?.({ data: new Blob(['audio']) });
      result.current.stopRecording();
    });

    const blob = onRecordingComplete.mock.calls[0][0] as Blob;
    expect(blob.type).toContain('audio/mp4');
  });

  it('no Chrome (webm) mantém webm/opus e o blob webm', async () => {
    stubMediaRecorder(['audio/webm']);
    const { stream } = makeMediaStream();
    getUserMedia.mockResolvedValue(stream);
    const onRecordingComplete = vi.fn();

    const { result } = renderHook(() => useAudioRecorder({ onRecordingComplete }));
    await iniciar(result);

    const recorder = (Fake as unknown as { instances: Array<{ mimeType: string }> }).instances[0];
    expect(recorder.mimeType).toBe('audio/webm;codecs=opus');

    act(() => {
      (Fake as unknown as { instances: Array<{ ondataavailable: ((e: { data: Blob }) => void) | null; onstop: (() => void) | null }> }).instances[0].ondataavailable?.({ data: new Blob(['audio']) });
      result.current.stopRecording();
    });

    expect((onRecordingComplete.mock.calls[0][0] as Blob).type).toContain('audio/webm');
  });

  it('o upload sai com extensão e Content-Type reais do blob mp4 (m4a/audio/mp4)', async () => {
    stubMediaRecorder(['audio/mp4']);
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.uploadAudio(new Blob(['a'], { type: 'audio/mp4' }), 'conv-1');
    });

    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [fileName, , options] = uploadMock.mock.calls[0];
    expect(fileName).toMatch(/^conv-1\/\d+\.m4a$/);
    expect(options).toEqual({ contentType: 'audio/mp4' });
  });

  it('o upload mantém webm para um blob webm (sem regressão do caminho Chrome)', async () => {
    stubMediaRecorder(['audio/webm']);
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.uploadAudio(new Blob(['a'], { type: 'audio/webm;codecs=opus' }), 'conv-2');
    });

    const [fileName, , options] = uploadMock.mock.calls[0];
    expect(fileName).toMatch(/^conv-2\/\d+\.webm$/);
    expect(options.contentType).toContain('audio/webm');
  });

  it('sem nenhum formato conhecido avisa em pt-BR em vez de rotular o áudio como webm', async () => {
    stubMediaRecorder([]); // isTypeSupported recusa todos e o recorder não informa mimeType
    const { stream } = makeMediaStream();
    getUserMedia.mockResolvedValue(stream);

    const { result } = renderHook(() => useAudioRecorder());
    await iniciar(result);

    expect(result.current.isRecording).toBe(true);
    // Sem nenhum formato suportado o hook usa o padrão do navegador (sem mimeType fixo).
    expect((Fake as unknown as { instances: Array<{ mimeType: string }> }).instances[0].mimeType).toBe('');
  });

  it('permissão negada no microfone tem mensagem própria (não é erro de formato)', async () => {
    stubMediaRecorder(['audio/webm']);
    const negado = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    getUserMedia.mockRejectedValue(negado);

    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => {
      await result.current.startRecording();
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Erro ao gravar',
        description: expect.stringContaining('Permissão de microfone negada'),
      }),
    );
  });

  it('recusa de formato na construção do recorder avisa formato, não microfone', async () => {
    stubMediaRecorder(['audio/webm']);
    const { stream, track } = makeMediaStream();
    getUserMedia.mockResolvedValue(stream);
    // Mesmo com o mime "suportado", o navegador pode recusar na construção.
    class FakeRecusando {
      static isTypeSupported = () => true;
      constructor() {
        throw Object.assign(new Error('nope'), { name: 'NotSupportedError' });
      }
    }
    vi.stubGlobal('MediaRecorder', FakeRecusando);

    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => {
      await result.current.startRecording();
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('formato disponível') }),
    );
    // E o stream é devolvido (nenhum microfone fica aberto).
    expect(track.stop).toHaveBeenCalledTimes(1);
  });
});
