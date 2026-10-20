import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, screen } from '@testing-library/react';
import React from 'react';
import type { ReactNode } from 'react';

// Regressão (troca de voz): falha da transformação só aparecia em toast — o
// usuário não tinha retry na própria tela. E `void audio.play()` sem catch
// deixava o botão preso em "Pausar" quando o navegador recusava a reprodução.

const popoverState = vi.hoisted(() => ({
  onOpenChange: undefined as ((v: boolean) => void) | undefined,
  open: undefined as boolean | undefined,
}));

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

const audioState = vi.hoisted(() => ({
  modo: 'ok' as 'ok' | 'rejeitar' | 'pendente',
  resolver: null as null | (() => void),
}));

vi.mock('sonner', () => ({ toast: toastMock }));

// Pass-through do framer-motion (jsdom não conclui AnimatePresence).
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
      return React.createElement('div', { ...rest, ref });
    }),
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  useReducedMotion: () => false,
}));

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
    storage: { from: vi.fn(() => ({ upload: vi.fn().mockResolvedValue({ error: null }), getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://cdn.test/x.mp3' } })) })) },
  },
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_ANON_KEY: 'anon-test',
}));

vi.mock('@/lib/mediaVolumeElement', () => ({ attachMediaVolume: vi.fn(() => vi.fn()) }));

import { VoiceChangerPicker } from '../VoiceChangerPicker';

const TRANSFORMED_URL = 'blob:mock-voz-transformada';
const BLOQUEIO = 'O navegador bloqueou a reprodução. Toque no botão de novo.';

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
    MockMediaRecorder.instances.push(this);
  }
}

class MockAudio {
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  currentTime = 0;
  constructor(public src: string) {}
  play = () => {
    if (audioState.modo === 'rejeitar') return Promise.reject(new Error('NotAllowedError'));
    if (audioState.modo === 'pendente') {
      return new Promise<void>((resolve) => {
        audioState.resolver = resolve;
      });
    }
    return Promise.resolve();
  };
  pause = vi.fn();
}

const getUserMedia = vi.fn();
let fetchMock: ReturnType<typeof vi.fn>;
let transformacaoFalha = false;

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

function botaoPrevia(nome: string): HTMLButtonElement {
  return screen.getByRole('button', { name: nome }) as HTMLButtonElement;
}

describe('VoiceChangerPicker — falhas de transformação e de reprodução', () => {
  beforeEach(() => {
    MockMediaRecorder.instances = [];
    popoverState.onOpenChange = undefined;
    popoverState.open = undefined;
    transformacaoFalha = false;
    audioState.modo = 'ok';
    audioState.resolver = null;
    toastMock.error.mockReset();
    toastMock.success.mockReset();
    getUserMedia.mockReset();
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.stubGlobal('Audio', MockAudio);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => TRANSFORMED_URL) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/functions/v1/voice-changer')) {
        if (transformacaoFalha) {
          return { ok: false, status: 500, json: async () => ({ error: 'motor fora do ar' }), blob: async () => new Blob([]) };
        }
        return { ok: true, status: 200, json: async () => ({}), blob: async () => new Blob(['transformada'], { type: 'audio/mpeg' }) };
      }
      return { ok: true, blob: async () => new Blob(['voz'], { type: 'audio/mpeg' }) };
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // Percorre o caminho real: abre -> grava -> para, parando no estado gravado.
  async function prepararGravacao() {
    render(<VoiceChangerPicker onSendAudio={vi.fn()} />);
    act(() => {
      popoverState.onOpenChange?.(true);
    });
    const { stream } = makeStream();
    getUserMedia.mockResolvedValue(stream);

    await act(async () => {
      fireEvent.click(botaoPorIcone('lucide-mic'));
    });
    await act(async () => {
      fireEvent.click(botaoPorIcone('lucide-mic-off'));
    });
    expect(screen.getByText('Transformar voz')).toBeInTheDocument();
  }

  it('mostra aviso inline com Tentar de novo quando a transformação falha e recupera no retry', async () => {
    transformacaoFalha = true;
    await prepararGravacao();

    await act(async () => {
      fireEvent.click(botaoPorTexto('Transformar voz'));
    });

    const aviso = screen.getByTestId('voz-erro-transformacao');
    expect(aviso).toBeInTheDocument();
    expect(screen.getByText('Tentar de novo')).toBeInTheDocument();
    // Motivo detalhado vem da Edge Function (toast + tooltip).
    expect(screen.getByText('motor fora do ar')).toBeInTheDocument();
    expect(toastMock.error).toHaveBeenCalledWith('Erro ao transformar voz: motor fora do ar');
    // A gravação continua ali: dá para tentar de novo sem regravar.
    expect(screen.queryByText('Enviar')).not.toBeInTheDocument();
    expect(botaoPorTexto('Tentar de novo')).not.toBeDisabled();

    transformacaoFalha = false;
    await act(async () => {
      fireEvent.click(botaoPorTexto('Tentar de novo'));
    });

    expect(screen.getByText('Enviar')).toBeInTheDocument();
    expect(screen.getByText('Ouvir')).toBeInTheDocument();
    expect(screen.queryByTestId('voz-erro-transformacao')).not.toBeInTheDocument();
  });

  it('não deixa o botão preso em Pausar quando o navegador recusa a reprodução', async () => {
    await prepararGravacao();
    await act(async () => {
      fireEvent.click(botaoPorTexto('Transformar voz'));
    });
    expect(screen.getByText('Ouvir')).toBeInTheDocument();

    audioState.modo = 'rejeitar';
    await act(async () => {
      fireEvent.click(botaoPorTexto('Ouvir'));
    });

    expect(toastMock.error).toHaveBeenCalledWith(BLOQUEIO);
    expect(screen.getByText('Ouvir')).toBeInTheDocument();
    expect(screen.queryByText('Pausar')).not.toBeInTheDocument();
  });

  it('alterna play, pausa e carregando sem mudar a largura do botão', async () => {
    await prepararGravacao();
    await act(async () => {
      fireEvent.click(botaoPorTexto('Transformar voz'));
    });

    // Estado play
    expect(botaoPrevia('Ouvir prévia').className).toContain('w-28');

    // Estado pausa (play aceito)
    await act(async () => {
      fireEvent.click(botaoPrevia('Ouvir prévia'));
    });
    expect(botaoPrevia('Pausar prévia').className).toContain('w-28');

    // Estado carregando (play pendente)
    await act(async () => {
      fireEvent.click(botaoPrevia('Pausar prévia'));
    });
    audioState.modo = 'pendente';
    await act(async () => {
      fireEvent.click(botaoPrevia('Ouvir prévia'));
    });
    expect(botaoPrevia('Carregando prévia').className).toContain('w-28');

    // Resolve o play pendente: volta para pausa, mesma largura.
    await act(async () => {
      audioState.resolver?.();
    });
    expect(botaoPrevia('Pausar prévia').className).toContain('w-28');
  });
});
