import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, screen } from '@testing-library/react';
import React from 'react';
import type { ReactNode } from 'react';

// Regressão (troca de voz): o preparo do áudio convertido usava
// `void fetch(...).then(...)` sem catch — a falha era silenciosa, o popover
// ficava travado e a rejeição não era tratada. E `audio.play()` era chamado sem
// catch: a recusa do navegador deixava o botão preso em "tocando".

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

// jsdom + framer-motion não concluem as animações do AnimatePresence. Mesmo
// pass-through usado nos testes de inbox (motion.button e motion.div viram
// elementos nativos, então os cliques exercitam o componente real).
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
      return React.createElement('div', { ...rest, ref });
    }),
    button: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
      return React.createElement('button', { ...rest, ref });
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
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_ANON_KEY: 'anon-test',
}));

vi.mock('@/lib/mediaVolumeElement', () => ({ attachMediaVolume: vi.fn(() => vi.fn()) }));

import { VoiceChanger } from '../VoiceChanger';

const CONVERTED_URL = 'blob:mock-voz-convertida';
const BLOQUEIO = 'O navegador bloqueou a reprodução. Toque no botão de novo.';

class MockAudio {
  static instances: MockAudio[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  currentTime = 0;
  src: string;
  constructor(src: string) {
    this.src = src;
    MockAudio.instances.push(this);
  }
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

let fetchMock: ReturnType<typeof vi.fn>;
// Controla a resposta do fetch do blob convertido (preparo do envio).
let preparoFalha = false;
// Preparo pendente: permite desmontar o componente no meio do fetch.
let preparoPendente = false;
let preparoResolver: null | (() => void) = null;
// Guarda o unmount do último render, para o teste de desmontagem.
let unmountFn: (() => void) | null = null;

function botaoPorTexto(texto: string): HTMLButtonElement {
  const alvo = screen.getByText(texto);
  const btn = alvo.closest('button');
  if (!btn) throw new Error(`botão "${texto}" não encontrado`);
  return btn as HTMLButtonElement;
}

describe('VoiceChanger — falhas de preparo e de reprodução', () => {
  beforeEach(() => {
    popoverState.onOpenChange = undefined;
    popoverState.open = undefined;
    preparoFalha = false;
    preparoPendente = false;
    preparoResolver = null;
    unmountFn = null;
    audioState.modo = 'ok';
    audioState.resolver = null;
    MockAudio.instances = [];
    toastMock.error.mockReset();
    toastMock.success.mockReset();

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => CONVERTED_URL),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/functions/v1/elevenlabs-sts')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          blob: async () => new Blob(['convertida'], { type: 'audio/webm' }),
        };
      }
      if (preparoPendente) {
        return new Promise((resolve) => {
          preparoResolver = () => resolve({ ok: true, status: 200, blob: async () => new Blob(['pronta'], { type: 'audio/webm' }) });
        });
      }
      if (preparoFalha) {
        return { ok: false, status: 500, json: async () => ({}), blob: async () => new Blob([]) };
      }
      return { ok: true, status: 200, blob: async () => new Blob(['pronta'], { type: 'audio/webm' }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('Audio', MockAudio);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // Caminho real: renderiza -> abre -> converte a voz, parando com a prévia
  // convertida na tela (footer com "Usar esta voz").
  async function prepararComPrevia(onVoiceChanged = vi.fn()) {
    const view = render(<VoiceChanger audioBlob={new Blob(['audio'], { type: 'audio/webm' })} onVoiceChanged={onVoiceChanged} />);
    unmountFn = view.unmount;
    act(() => {
      popoverState.onOpenChange?.(true);
    });

    await act(async () => {
      fireEvent.click(botaoPorTexto('Voz Principal'));
    });

    expect(screen.getByText('Usar esta voz')).toBeInTheDocument();
    return onVoiceChanged;
  }

  it('avisa inline, libera o botão e mantém o popover utilizável quando o preparo falha', async () => {
    preparoFalha = true;
    const onVoiceChanged = await prepararComPrevia();

    await act(async () => {
      fireEvent.click(botaoPorTexto('Usar esta voz'));
    });

    // Aviso inline com ícone + retry, e o motivo detalhado no tooltip.
    expect(screen.getByTestId('voz-erro-preparo')).toBeInTheDocument();
    expect(screen.getByText('Tentar de novo')).toBeInTheDocument();
    expect(screen.getByText('Erro 500')).toBeInTheDocument();
    expect(toastMock.error).toHaveBeenCalledWith('Erro ao preparar o áudio: Erro 500');
    // Nada foi enviado, o popover continua aberto e o botão voltou a funcionar.
    expect(onVoiceChanged).not.toHaveBeenCalled();
    expect(popoverState.open).toBe(true);
    expect(botaoPorTexto('Usar esta voz')).not.toBeDisabled();
  });

  it('recupera no Tentar de novo: o segundo preparo entrega o blob e fecha o popover', async () => {
    preparoFalha = true;
    const onVoiceChanged = await prepararComPrevia();

    await act(async () => {
      fireEvent.click(botaoPorTexto('Usar esta voz'));
    });
    expect(screen.getByTestId('voz-erro-preparo')).toBeInTheDocument();

    preparoFalha = false;
    await act(async () => {
      fireEvent.click(botaoPorTexto('Tentar de novo'));
    });

    expect(onVoiceChanged).toHaveBeenCalledTimes(1);
    expect(onVoiceChanged.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(popoverState.open).toBe(false);
    expect(screen.queryByTestId('voz-erro-preparo')).not.toBeInTheDocument();
  });

  it('não deixa o botão preso em "tocando" quando a reprodução automática é recusada', async () => {
    audioState.modo = 'rejeitar';
    await prepararComPrevia();

    expect(toastMock.error).toHaveBeenCalledWith(BLOQUEIO);
    // isPlaying desfeito: o botão continua oferecendo a prévia.
    expect(screen.getByLabelText('Ouvir prévia')).toBeInTheDocument();
    expect(screen.queryByLabelText('Pausar prévia')).not.toBeInTheDocument();
  });

  it('o retry da prévia também trata a recusa, sem ficar pausado', async () => {
    await prepararComPrevia();
    expect(screen.getByLabelText('Pausar prévia')).toBeInTheDocument();

    // Pausa e tenta de novo com o navegador recusando.
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Pausar prévia'));
    });
    audioState.modo = 'rejeitar';
    toastMock.error.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Ouvir prévia'));
    });

    expect(toastMock.error).toHaveBeenCalledWith(BLOQUEIO);
    expect(screen.getByLabelText('Ouvir prévia')).toBeInTheDocument();
  });

  it('recupera a prévia: depois da recusa na conversão, Ouvir prévia toca de novo', async () => {
    // Recusa só na reprodução automática que segue a conversão.
    audioState.modo = 'rejeitar';
    await prepararComPrevia();

    expect(toastMock.error).toHaveBeenCalledWith(BLOQUEIO);
    // A recusa não pode descartar o áudio: o aviso manda tocar de novo.
    expect(screen.getByLabelText('Ouvir prévia')).toBeInTheDocument();

    // O navegador agora aceita: o botão tem de funcionar de verdade.
    audioState.modo = 'ok';
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Ouvir prévia'));
    });

    expect(screen.getByLabelText('Pausar prévia')).toBeInTheDocument();
  });

  it('não anuncia conversão concluída quando a reprodução foi recusada', async () => {
    audioState.modo = 'rejeitar';
    await prepararComPrevia();

    expect(toastMock.error).toHaveBeenCalledWith(BLOQUEIO);
    // Sem "sucesso" contraditório depois do aviso de bloqueio.
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('anuncia a conversão quando a prévia toca normalmente', async () => {
    await prepararComPrevia();

    expect(toastMock.success).toHaveBeenCalledWith('Voz convertida para Voz Principal!');
  });

  it('não conclui o preparo nem atualiza estado depois de desmontar', async () => {
    preparoPendente = true;
    const onVoiceChanged = await prepararComPrevia();

    // O preparo fica pendente (fetch do blob não resolve ainda).
    act(() => {
      fireEvent.click(botaoPorTexto('Usar esta voz'));
    });
    expect(onVoiceChanged).not.toHaveBeenCalled();

    unmountFn?.();
    await act(async () => {
      preparoResolver?.();
    });

    // Regra 4: nada de entregar o blob / mexer em estado após o unmount.
    expect(onVoiceChanged).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
  });
});
