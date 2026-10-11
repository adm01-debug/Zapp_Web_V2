import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, screen } from '@testing-library/react';
import React from 'react';
import type { ReactNode } from 'react';

// Exigência de design do lote (regra b/e): com movimento reduzido o aviso inline
// de transformação só pode mudar opacidade — sem deslocamento (Y) e sem pulso de
// escala. O `useReducedMotion` é controlado pelo teste; o mock do framer-motion é
// pass-through e GRAVA os props recebidos por cada motion.div, então medimos o que
// o componente realmente calculou, não uma string do fonte.

const popoverState = vi.hoisted(() => ({
  onOpenChange: undefined as ((v: boolean) => void) | undefined,
}));

const motionState = vi.hoisted(() => ({ reduzido: false }));

const motionProps = vi.hoisted(() => [] as Array<Record<string, unknown>>);

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      motionProps.push(props);
      const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
      return React.createElement('div', { ...rest, ref });
    }),
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  useReducedMotion: () => motionState.reduzido,
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children, onOpenChange }: { children: ReactNode; onOpenChange?: (v: boolean) => void }) => {
    popoverState.onOpenChange = onOpenChange;
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

import { VoiceChangerPicker } from '../VoiceChangerPicker';

const TRANSFORMED_URL = 'blob:mock-voz-transformada';

class MockMediaRecorder {
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
  ) {}
}

class MockAudio {
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  currentTime = 0;
  constructor(public src: string) {}
  play = () => Promise.resolve();
  pause = vi.fn();
}

const getUserMedia = vi.fn();

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

function propsDoAviso(): Record<string, unknown> {
  return motionProps.filter(p => p['data-testid'] === 'voz-erro-transformacao').slice(-1)[0] ?? {};
}

describe('VoiceChangerPicker — aviso inline e movimento reduzido', () => {
  beforeEach(() => {
    motionProps.length = 0;
    popoverState.onOpenChange = undefined;
    motionState.reduzido = false;
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

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/functions/v1/voice-changer')) {
        // A transformação falha de propósito: é o estado que queremos medir.
        return { ok: false, status: 500, json: async () => ({ error: 'motor fora do ar' }), blob: async () => new Blob([]) };
      }
      return { ok: true, blob: async () => new Blob(['voz'], { type: 'audio/mpeg' }) };
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // Percorre o caminho real (abre -> grava -> para -> transforma) e devolve o
  // aviso inline já montado, para medir os props do motion.
  async function abrirAvisoInline() {
    render(<VoiceChangerPicker onSendAudio={vi.fn()} />);
    act(() => {
      popoverState.onOpenChange?.(true);
    });
    const track = { stop: vi.fn() };
    getUserMedia.mockResolvedValue({ getTracks: vi.fn(() => [track]) });

    await act(async () => {
      fireEvent.click(botaoPorIcone('lucide-mic'));
    });
    await act(async () => {
      fireEvent.click(botaoPorIcone('lucide-mic-off'));
    });
    await act(async () => {
      fireEvent.click(botaoPorTexto('Transformar voz'));
    });
    expect(screen.getByTestId('voz-erro-transformacao')).toBeInTheDocument();
    return propsDoAviso();
  }

  it('sem movimento reduzido o aviso entra deslocando (transform em Y)', async () => {
    motionState.reduzido = false;
    const aviso = await abrirAvisoInline();

    expect(aviso.initial).toMatchObject({ y: -6 });
    expect(aviso.animate).toMatchObject({ y: 0 });
  });

  it('com movimento reduzido o aviso entra só por opacidade, sem deslocar nem pulsar', async () => {
    motionState.reduzido = true;
    // O caminho passa pela gravação: o pulso de escala do botão de gravar
    // também é medido (motionProps guarda todos os motion.div renderizados).
    await abrirAvisoInline();

    const aviso = propsDoAviso();
    expect(aviso.initial).toMatchObject({ opacity: 0 });
    expect(aviso.animate).toMatchObject({ opacity: 1 });
    expect(aviso.animate).not.toHaveProperty('y');

    // Nenhum elemento do picker anima escala com movimento reduzido.
    for (const props of motionProps) {
      expect(props.animate ?? {}).not.toHaveProperty('scale');
      expect(props.initial ?? {}).not.toHaveProperty('scale');
    }

    // O aviso continua visível e recuperável na tela.
    expect(screen.getByText('Tentar de novo')).toBeInTheDocument();
  });
});
