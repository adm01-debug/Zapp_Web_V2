import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, screen } from '@testing-library/react';
import React from 'react';
import type { ReactNode } from 'react';

// Regressões cobertas aqui:
// 1) a transformação em voo continuava viva depois de fechar o popover: ao
//    responder, pintava uma prévia que o usuário já tinha abandonado e deixava
//    uma URL de blob sem revogar;
// 2) a gravação não tinha teto: uma gravação esquecida só falhava no upload,
//    quando a Edge recusa acima de ~10 MB;
// 3) qualquer falha de microfone virava a mesma mensagem genérica, mesmo quando
//    o motivo (permissão negada, sem microfone, formato não suportado) pedia
//    uma ação diferente do usuário.

const popoverState = vi.hoisted(() => ({
  onOpenChange: undefined as ((v: boolean) => void) | undefined,
  open: undefined as boolean | undefined,
}));

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));

vi.mock('sonner', () => ({ toast: toastMock }));

// Pass-through do framer-motion (jsdom não conclui o AnimatePresence).
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    motion: {
        div: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
          const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
          return React.createElement('div', { ...rest, ref });
        }),
      },
      AnimatePresence: ({ children }: { children: ReactNode }) => children,
      useReducedMotion: () => false,
  };
});

vi.mock('@/components/ui/popover', () => ({
  Popover: ({
    children,
    open,
    onOpenChange,
  }: {
    children: ReactNode;
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
  }) => {
    popoverState.onOpenChange = onOpenChange;
    popoverState.open = open;
    return <>{children}</>;
  },
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://cdn.test/x.mp3' } })),
      })),
    },
  },
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_ANON_KEY: 'anon-test',
}));

vi.mock('@/lib/mediaVolumeElement', () => ({ attachMediaVolume: vi.fn(() => vi.fn()) }));

import { VoiceChangerPicker } from '../VoiceChangerPicker';

type FetchInitLike = { signal?: AbortSignal };

const getUserMedia = vi.fn();
let fetchMock: ReturnType<typeof vi.fn>;
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
/** 'ok' responde na hora; 'pendente' guarda o resolver para o teste controlar. */
let modoTransformacao: 'ok' | 'pendente' = 'ok';
let resolverTransform: (() => void) | null = null;
/** Motivo da falha do microfone: erro do getUserMedia ou do MediaRecorder. */
let falhaMic: 'nenhuma' | 'permissao' | 'ausente' | 'formato' = 'nenhuma';
const sinaisTransform: AbortSignal[] = [];

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn(() => {
    this.state = 'recording';
  });
  stop = vi.fn(() => {
    this.state = 'inactive';
    this.onstop?.();
  });
  constructor(
    public stream: unknown,
    public options?: unknown,
  ) {
    // NotSupportedError é exatamente o que o navegador lança quando o mimeType
    // pedido não é suportado — o usuário precisa de outra mensagem.
    if (falhaMic === 'formato') throw new DOMException('formato', 'NotSupportedError');
    MockMediaRecorder.instances.push(this);
  }
}

function makeStream() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: vi.fn(() => [track]) };
  return { stream, track };
}

function botaoPorIcone(classe: string): HTMLButtonElement {
  const icon = document.querySelector(`.${classe}`);
  const btn = icon?.closest('button');
  if (!btn) throw new Error(`botão ${classe} não encontrado`);
  return btn as HTMLButtonElement;
}

function botaoPorTexto(texto: string): HTMLButtonElement {
  const alvo = screen.getByText(texto);
  const btn = alvo.closest('button');
  if (!btn) throw new Error(`botão "${texto}" não encontrado`);
  return btn as HTMLButtonElement;
}

async function abrirEGravar() {
  render(<VoiceChangerPicker onSendAudioBlob={vi.fn()} />);
  act(() => {
    popoverState.onOpenChange?.(true);
  });
  const { stream } = makeStream();
  getUserMedia.mockResolvedValue(stream);
  await act(async () => {
    fireEvent.click(botaoPorIcone('lucide-mic'));
  });
}

async function prepararGravacao() {
  await abrirEGravar();
  await act(async () => {
    fireEvent.click(botaoPorIcone('lucide-mic-off'));
  });
  expect(screen.getByText('Transformar voz')).toBeInTheDocument();
}

describe('VoiceChangerPicker — cancelamento da transformação, teto de gravação e erro real do microfone', () => {
  beforeEach(() => {
    MockMediaRecorder.instances = [];
    popoverState.onOpenChange = undefined;
    popoverState.open = undefined;
    modoTransformacao = 'ok';
    resolverTransform = null;
    falhaMic = 'nenhuma';
    sinaisTransform.length = 0;
    toastMock.error.mockReset();
    toastMock.success.mockReset();
    toastMock.warning.mockReset();
    getUserMedia.mockReset();
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    createObjectURL = vi.fn(() => 'blob:previa-transformada');
    revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    fetchMock = vi.fn((input: RequestInfo | URL, init?: FetchInitLike) => {
      const url = String(input);
      if (url.includes('/functions/v1/voice-changer')) {
        if (init?.signal) sinaisTransform.push(init.signal);
        if (modoTransformacao === 'pendente') {
          return new Promise((resolve) => {
            resolverTransform = () =>
              resolve({
                ok: true,
                status: 200,
                json: async () => ({}),
                blob: async () => new Blob(['transformada'], { type: 'audio/mpeg' }),
              });
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({}),
          blob: async () => new Blob(['transformada'], { type: 'audio/mpeg' }),
        });
      }
      return Promise.resolve({ ok: true, blob: async () => new Blob(['voz'], { type: 'audio/mpeg' }) });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('ao fechar o popover, aborta a transformação em voo e não deixa prévia nem URL órfã', async () => {
    modoTransformacao = 'pendente';
    await prepararGravacao();

    await act(async () => {
      fireEvent.click(botaoPorTexto('Transformar voz'));
    });
    expect(screen.getByText('Transformando...')).toBeInTheDocument();
    expect(sinaisTransform).toHaveLength(1);
    expect(sinaisTransform[0].aborted).toBe(false);

    // O usuário sai da tela com a Edge ainda respondendo.
    act(() => {
      popoverState.onOpenChange?.(false);
    });
    expect(sinaisTransform[0].aborted).toBe(true);

    // A resposta chega tarde: não pode virar prévia nem criar URL nova.
    await act(async () => {
      resolverTransform?.();
    });

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(screen.queryByText('Enviar')).not.toBeInTheDocument();
  });

  it('encerra a gravação aos 60 s e avisa o usuário', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    await abrirEGravar();
    expect(screen.getByText('Gravando...')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(toastMock.warning).toHaveBeenCalledWith('Gravação limitada a 60 segundos');
    expect(MockMediaRecorder.instances[0].stop).toHaveBeenCalled();
    // A gravação não se perde: o áudio fica pronto para transformar.
    expect(screen.queryByText('Gravando...')).not.toBeInTheDocument();
    expect(screen.getByText('Transformar voz')).toBeInTheDocument();
  });

  it('mostra a mensagem de permissão negada em vez da genérica', async () => {
    render(<VoiceChangerPicker onSendAudioBlob={vi.fn()} />);
    act(() => {
      popoverState.onOpenChange?.(true);
    });
    getUserMedia.mockRejectedValue(new DOMException('negado', 'NotAllowedError'));

    await act(async () => {
      fireEvent.click(botaoPorIcone('lucide-mic'));
    });

    expect(toastMock.error).toHaveBeenCalledWith('Permissão de microfone negada. Libere o acesso no navegador.');
    expect(toastMock.error).not.toHaveBeenCalledWith('Não foi possível acessar o microfone');
  });

  it('mostra a mensagem de microfone ausente quando não há dispositivo', async () => {
    render(<VoiceChangerPicker onSendAudioBlob={vi.fn()} />);
    act(() => {
      popoverState.onOpenChange?.(true);
    });
    getUserMedia.mockRejectedValue(new DOMException('sem microfone', 'NotFoundError'));

    await act(async () => {
      fireEvent.click(botaoPorIcone('lucide-mic'));
    });

    expect(toastMock.error).toHaveBeenCalledWith('Nenhum microfone encontrado neste dispositivo.');
    expect(toastMock.error).not.toHaveBeenCalledWith('Não foi possível acessar o microfone');
  });

  it('mostra a mensagem de formato não suportado quando o MediaRecorder recusa o mimeType', async () => {
    falhaMic = 'formato';
    render(<VoiceChangerPicker onSendAudioBlob={vi.fn()} />);
    act(() => {
      popoverState.onOpenChange?.(true);
    });
    const { stream } = makeStream();
    getUserMedia.mockResolvedValue(stream);

    await act(async () => {
      fireEvent.click(botaoPorIcone('lucide-mic'));
    });

    expect(toastMock.error).toHaveBeenCalledWith('Este navegador não grava áudio neste formato.');
    expect(toastMock.error).not.toHaveBeenCalledWith('Não foi possível acessar o microfone');
  });
});
