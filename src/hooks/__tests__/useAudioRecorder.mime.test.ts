import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { uploadMock, getPublicUrlMock, convertAudioToMp3Mock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  getPublicUrlMock: vi.fn(),
  convertAudioToMp3Mock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({ upload: uploadMock, getPublicUrl: getPublicUrlMock })),
    },
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

// O encoder real só existe no navegador (script self-hosted): aqui ele é mockado.
vi.mock('@/utils/audioToMp3', () => ({ convertAudioToMp3: convertAudioToMp3Mock }));

import { pickRecorderMime, describeRecorderError, useAudioRecorder } from '@/hooks/communication/useAudioRecorder';
import { toast } from '@/hooks/ui/use-toast';

// MediaRecorder fake: guarda as opções do construtor (o mimeType escolhido) e
// dispara onstop no stop(), como o nativo.
class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static supported: string[] = [];
  static isTypeSupported = vi.fn((mime: string) => FakeMediaRecorder.supported.includes(mime));

  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  state: 'inactive' | 'recording' = 'inactive';
  mimeType: string;
  start = vi.fn(() => {
    this.state = 'recording';
  });
  stop = vi.fn(() => {
    this.state = 'inactive';
    this.onstop?.();
  });

  constructor(public stream: unknown, public options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? '';
    FakeMediaRecorder.instances.push(this);
  }
}

function makeMediaStream() {
  const track = { stop: vi.fn(), kind: 'audio', readyState: 'live' };
  return { stream: { getTracks: () => [track] }, track };
}

function erroComNome(name: string) {
  return Object.assign(new Error(`falha ${name}`), { name });
}

const CANDIDATOS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=aac', 'audio/mp4'];

describe('pickRecorderMime — formato suportado pelo MediaRecorder', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('escolhe webm;codecs=opus quando o navegador suporta tudo', () => {
    FakeMediaRecorder.supported = [...CANDIDATOS];
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);

    expect(pickRecorderMime()).toBe('audio/webm;codecs=opus');
  });

  it('cai para mp4/aac quando o navegador não grava webm (Safari/iOS antigo)', () => {
    FakeMediaRecorder.supported = ['audio/mp4;codecs=aac', 'audio/mp4'];
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);

    expect(pickRecorderMime()).toBe('audio/mp4;codecs=aac');
  });

  it('devolve undefined quando nenhum formato é suportado', () => {
    FakeMediaRecorder.supported = [];
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);

    expect(pickRecorderMime()).toBeUndefined();
    expect(FakeMediaRecorder.isTypeSupported.mock.calls.map((c) => c[0])).toEqual(CANDIDATOS);
  });

  it('devolve undefined em navegador sem isTypeSupported, sem lançar', () => {
    class SemIsTypeSupported {
      onstop: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn();
    }
    vi.stubGlobal('MediaRecorder', SemIsTypeSupported);

    expect(pickRecorderMime()).toBeUndefined();
  });
});

describe('describeRecorderError — mensagem condiz com a causa', () => {
  it('diz que a permissão foi negada em NotAllowedError', () => {
    expect(describeRecorderError(erroComNome('NotAllowedError'))).toMatch(/Permissão de microfone negada/);
  });

  it('diz que não há microfone em NotFoundError', () => {
    expect(describeRecorderError(erroComNome('NotFoundError'))).toMatch(/Nenhum microfone encontrado/);
  });

  it('diz que o formato não é suportado em NotSupportedError', () => {
    expect(describeRecorderError(erroComNome('NotSupportedError'))).toMatch(/não suporta a gravação de áudio/);
  });

  it('as três causas dão mensagens distintas', () => {
    const mensagens = new Set([
      describeRecorderError(erroComNome('NotAllowedError')),
      describeRecorderError(erroComNome('NotFoundError')),
      describeRecorderError(erroComNome('NotSupportedError')),
    ]);

    expect(mensagens.size).toBe(3);
  });
});

describe('useAudioRecorder — formato e mensagem de erro (Safari/iOS x Chrome)', () => {
  const getUserMedia = vi.fn();
  const toastMock = vi.mocked(toast);

  beforeEach(() => {
    vi.useFakeTimers();
    FakeMediaRecorder.instances = [];
    FakeMediaRecorder.supported = [...CANDIDATOS];
    FakeMediaRecorder.isTypeSupported.mockClear();
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:fake'),
      configurable: true,
    });
    uploadMock.mockResolvedValue({ data: { path: 'test' }, error: null });
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: 'https://example.com/test.mp3' } });
    convertAudioToMp3Mock.mockResolvedValue({
      ok: true,
      blob: new Blob(['mp3'], { type: 'audio/mpeg' }),
      fileName: 'gravacao.mp3',
      durationSeconds: 1,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('constrói o MediaRecorder com o formato que o navegador suporta', async () => {
    getUserMedia.mockResolvedValue(makeMediaStream().stream);

    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => {
      await result.current.startRecording();
    });

    expect(FakeMediaRecorder.instances[0].options?.mimeType).toBe('audio/webm;codecs=opus');
    expect(result.current.isRecording).toBe(true);
  });

  it('usa mp4/aac quando é o único formato suportado e marca o blob com o tipo real', async () => {
    FakeMediaRecorder.supported = ['audio/mp4;codecs=aac'];
    getUserMedia.mockResolvedValue(makeMediaStream().stream);
    const onRecordingComplete = vi.fn();

    const { result } = renderHook(() => useAudioRecorder({ onRecordingComplete }));
    await act(async () => {
      await result.current.startRecording();
    });
    const recorder = FakeMediaRecorder.instances[0];
    expect(recorder.options?.mimeType).toBe('audio/mp4;codecs=aac');

    act(() => {
      recorder.ondataavailable?.({ data: new Blob(['audio']) });
      result.current.stopRecording();
    });

    // Antes o blob era rotulado 'audio/webm' mesmo no Safari: o upload mentia o formato.
    expect(onRecordingComplete.mock.calls[0][0].type).toBe('audio/mp4;codecs=aac');
  });

  it('sem nenhum formato suportado, deixa o navegador escolher (sem opções) e grava', async () => {
    FakeMediaRecorder.supported = [];
    getUserMedia.mockResolvedValue(makeMediaStream().stream);

    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => {
      await result.current.startRecording();
    });

    expect(FakeMediaRecorder.instances[0].options).toBeUndefined();
    expect(result.current.isRecording).toBe(true);
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('avisa formato/compatibilidade quando o navegador não tem MediaRecorder', async () => {
    const { stream, track } = makeMediaStream();
    getUserMedia.mockResolvedValue(stream);
    vi.stubGlobal('MediaRecorder', undefined);

    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => {
      await result.current.startRecording();
    });

    expect(toastMock).toHaveBeenCalledTimes(1);
    const aviso = toastMock.mock.calls[0][0] as { description: string };
    expect(aviso.description).toMatch(/não suporta a gravação de áudio/);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(result.current.isRecording).toBe(false);
  });

  it('avisa permissão negada em NotAllowedError (não o texto genérico de microfone)', async () => {
    getUserMedia.mockRejectedValue(erroComNome('NotAllowedError'));

    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => {
      await result.current.startRecording();
    });

    const aviso = toastMock.mock.calls[0][0] as { description: string };
    expect(aviso.description).toMatch(/Permissão de microfone negada/);
    expect(aviso.description).not.toBe('Não foi possível acessar o microfone.');
  });

  it('avisa microfone ausente em NotFoundError', async () => {
    getUserMedia.mockRejectedValue(erroComNome('NotFoundError'));

    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => {
      await result.current.startRecording();
    });

    const aviso = toastMock.mock.calls[0][0] as { description: string };
    expect(aviso.description).toMatch(/Nenhum microfone encontrado/);
  });

  it('normaliza o áudio gravado para MP3 antes de subir', async () => {
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.uploadAudio(new Blob(['audio'], { type: 'audio/mp4' }), 'conversation-1');
    });

    expect(convertAudioToMp3Mock).toHaveBeenCalledTimes(1);
    const [fileName, uploadBlob, uploadOptions] = uploadMock.mock.calls[0];
    expect(fileName).toMatch(/^conversation-1\/\d+\.mp3$/);
    expect((uploadBlob as Blob).type).toBe('audio/mpeg');
    expect(uploadOptions).toEqual({ contentType: 'audio/mpeg' });
  });

  it('sobe o blob original com o tipo real quando a conversão não está disponível', async () => {
    convertAudioToMp3Mock.mockResolvedValue({ ok: false, reason: 'encoder-unavailable' });
    const original = new Blob(['audio'], { type: 'audio/mp4' });

    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => {
      await result.current.uploadAudio(original, 'conversation-1');
    });

    const [fileName, uploadBlob, uploadOptions] = uploadMock.mock.calls[0];
    expect(uploadBlob).toBe(original);
    expect(fileName).toMatch(/^conversation-1\/\d+\.m4a$/);
    expect(uploadOptions).toEqual({ contentType: 'audio/mp4' });
  });
});
