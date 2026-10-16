import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, screen } from '@testing-library/react';
import React from 'react';
import type { ReactNode } from 'react';

// Regressão #350: o VoiceChangerPicker fechava o popover e limpava a prévia da
// voz transformada ANTES de saber o resultado do envio da mensagem. Quando o
// `onSendAudio` (síncrono ou assíncrono) rejeitava/lançava, o usuário perdia a
// prévia e não conseguia tentar enviar de novo.

const popoverState = vi.hoisted(() => ({
  onOpenChange: undefined as ((v: boolean) => void) | undefined,
  open: undefined as boolean | undefined,
}));

const storageState = vi.hoisted(() => ({
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('sonner', () => ({ toast: toastMock }));

// jsdom + framer-motion não concluem as animações do AnimatePresence, então os
// estados de gravação/prévia não montavam de forma determinística. Mesmo
// pass-through usado nos testes de controles de volume do repositório.
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
      return React.createElement('div', { ...rest, ref });
    }),
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
}));

// Pass-through do Radix Popover (não abre de forma confiável sob jsdom). Além de
// capturar o onOpenChange, guardamos a prop `open` para provar que o popover só
// fecha depois do sucesso do envio.
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
        upload: storageState.upload,
        getPublicUrl: storageState.getPublicUrl,
      })),
    },
  },
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_ANON_KEY: 'anon-test',
}));

import { VoiceChangerPicker } from '../VoiceChangerPicker';

const TRANSFORMED_URL = 'blob:mock-voz-transformada';
const PUBLIC_URL = 'https://cdn.test/voz-transformada.mp3';

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

const getUserMedia = vi.fn();
let fetchMock: ReturnType<typeof vi.fn>;

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

describe('VoiceChangerPicker — prévia preservada quando o envio falha (#350)', () => {
  beforeEach(() => {
    MockMediaRecorder.instances = [];
    popoverState.onOpenChange = undefined;
    popoverState.open = undefined;
    storageState.upload.mockReset().mockResolvedValue({ error: null });
    storageState.getPublicUrl.mockReset().mockReturnValue({ data: { publicUrl: PUBLIC_URL } });
    toastMock.error.mockReset();
    toastMock.success.mockReset();
    getUserMedia.mockReset();
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => TRANSFORMED_URL),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/functions/v1/voice-changer')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          blob: async () => new Blob(['transformada'], { type: 'audio/mpeg' }),
        };
      }
      return { ok: true, blob: async () => new Blob(['voz'], { type: 'audio/mpeg' }) };
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // Percorre o caminho REAL do componente: renderiza -> abre -> grava -> para ->
  // transforma a voz, parando com a prévia transformada na tela.
  async function prepararComPrevia(onSendAudio: (url: string) => void | Promise<void>) {
    render(<VoiceChangerPicker onSendAudio={onSendAudio} />);
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

    // Estado A: gravou, ainda sem prévia transformada.
    expect(screen.getByText('Transformar voz')).toBeInTheDocument();
    expect(screen.queryByText('Enviar')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(botaoPorTexto('Transformar voz'));
    });

    // Estado B: prévia transformada disponível.
    expect(screen.getByText('Enviar')).toBeInTheDocument();
    expect(screen.getByText('Ouvir')).toBeInTheDocument();
    return botaoPorTexto('Enviar');
  }

  it('mantém popover aberto, toast de erro e prévia para retry quando onSendAudio rejeita', async () => {
    const onSendAudio = vi.fn().mockRejectedValue(new Error('falha no envio da mensagem'));
    const enviar = await prepararComPrevia(onSendAudio);

    await act(async () => {
      fireEvent.click(enviar);
    });

    expect(onSendAudio).toHaveBeenCalledWith(PUBLIC_URL);
    // O popover continua aberto...
    expect(popoverState.open).toBe(true);
    // ...e a prévia transformada continua na tela, pronta para novo envio.
    expect(screen.getByText('Enviar')).toBeInTheDocument();
    expect(screen.getByText('Ouvir')).toBeInTheDocument();
    expect(toastMock.error).toHaveBeenCalled();
    // `isSending` volta a false: dá para tentar de novo.
    expect(botaoPorTexto('Enviar')).not.toBeDisabled();
  });

  it('trata onSendAudio que LANÇA erro síncrono como falha (não fecha nem limpa)', async () => {
    const onSendAudio = vi.fn(() => {
      throw new Error('lançou na hora');
    });
    const enviar = await prepararComPrevia(onSendAudio);

    await act(async () => {
      fireEvent.click(enviar);
    });

    expect(popoverState.open).toBe(true);
    expect(screen.getByText('Enviar')).toBeInTheDocument();
    expect(toastMock.error).toHaveBeenCalled();
    expect(botaoPorTexto('Enviar')).not.toBeDisabled();
  });

  it('só fecha o popover e limpa a prévia DEPOIS de o envio assíncrono resolver', async () => {
    let resolver: () => void = () => {};
    const onSendAudio = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolver = resolve;
        }),
    );
    const enviar = await prepararComPrevia(onSendAudio);

    await act(async () => {
      fireEvent.click(enviar);
    });

    // Envio pendente: nada foi fechado nem limpo ainda.
    expect(onSendAudio).toHaveBeenCalledWith(PUBLIC_URL);
    expect(popoverState.open).toBe(true);
    expect(screen.getByText('Enviar')).toBeInTheDocument();

    await act(async () => {
      resolver();
    });

    // Só agora, com sucesso confirmado, o popover fecha e a prévia some.
    expect(popoverState.open).toBe(false);
    expect(screen.queryByText('Enviar')).not.toBeInTheDocument();
    expect(toastMock.success).toHaveBeenCalled();
  });

  it('aceita onSendAudio síncrono (void) e fecha o popover no sucesso', async () => {
    const onSendAudio = vi.fn();
    const enviar = await prepararComPrevia(onSendAudio);

    await act(async () => {
      fireEvent.click(enviar);
    });

    expect(onSendAudio).toHaveBeenCalledWith(PUBLIC_URL);
    expect(popoverState.open).toBe(false);
    expect(screen.queryByText('Enviar')).not.toBeInTheDocument();
    expect(toastMock.error).not.toHaveBeenCalled();
  });
});
