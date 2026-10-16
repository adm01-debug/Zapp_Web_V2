import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

// Exigência de design do lote: com movimento reduzido nada se desloca — o aviso
// inline só pode mudar opacidade. Aqui o framer-motion é REAL; só o
// `useReducedMotion` é controlado pelo teste (mesma técnica do CT70).
// Sem redução o aviso entra com mola curta (deslocamento em Y).

const popoverState = vi.hoisted(() => ({
  onOpenChange: undefined as ((v: boolean) => void) | undefined,
}));

const motionState = vi.hoisted(() => ({ reduzido: false }));

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => motionState.reduzido };
});

vi.mock('@/components/ui/popover', () => ({
  Popover: ({
    children,
    onOpenChange,
  }: {
    children: ReactNode;
    onOpenChange?: (v: boolean) => void;
  }) => {
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

import { VoiceChanger } from '../VoiceChanger';

const CONVERTED_URL = 'blob:mock-voz-convertida';

class MockAudio {
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  currentTime = 0;
  constructor(public src: string) {}
  play = () => Promise.resolve();
  pause = vi.fn();
}

function botaoPorTexto(texto: string): HTMLButtonElement {
  const alvo = screen.getByText(texto);
  const btn = alvo.closest('button');
  if (!btn) throw new Error(`botão "${texto}" não encontrado`);
  return btn as HTMLButtonElement;
}

describe('VoiceChanger — aviso inline e movimento reduzido', () => {
  beforeEach(() => {
    popoverState.onOpenChange = undefined;
    motionState.reduzido = false;
    toastMock.error.mockReset();
    toastMock.success.mockReset();

    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => CONVERTED_URL) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/functions/v1/elevenlabs-sts')) {
        return { ok: true, status: 200, json: async () => ({}), blob: async () => new Blob(['convertida']) };
      }
      // O preparo falha de propósito: é o estado que queremos medir.
      return { ok: false, status: 500, json: async () => ({}), blob: async () => new Blob([]) };
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('Audio', MockAudio);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  async function abrirAvisoInline() {
    render(<VoiceChanger audioBlob={new Blob(['audio'])} onVoiceChanged={vi.fn()} />);
    act(() => {
      popoverState.onOpenChange?.(true);
    });
    await act(async () => {
      fireEvent.click(botaoPorTexto('Voz Principal'));
    });
    await act(async () => {
      fireEvent.click(botaoPorTexto('Usar esta voz'));
    });
    return screen.getByTestId('voz-erro-preparo');
  }

  it('sem movimento reduzido o aviso entra deslocando (transform em Y)', async () => {
    motionState.reduzido = false;
    const aviso = await abrirAvisoInline();

    // O transform do framer é o que produz o deslocamento na tela.
    expect(aviso.style.transform).toContain('translateY');
  });

  it('com movimento reduzido o aviso entra só por opacidade, sem deslocar', async () => {
    motionState.reduzido = true;
    const aviso = await abrirAvisoInline();

    expect(aviso.style.transform).not.toContain('translate');
    // Ainda entra com fade (opacidade), e continua recuperável na tela.
    expect(aviso.style.opacity).not.toBe('');
    expect(screen.getByText('Tentar de novo')).toBeInTheDocument();
  });
});
