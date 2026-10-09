import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

// Regressão do R2-INB-057: o VoiceChangerPicker mantinha o MediaRecorder/tracks
// vivos depois de fechar o popover ou desmontar, e um getUserMedia pendente
// iniciava captura com o componente já fechado/desmontado.

const popoverState = vi.hoisted(() => ({
  onOpenChange: undefined as ((v: boolean) => void) | undefined,
}));

// Radix Popover não abre de forma confiável sob jsdom (padrão já usado nos
// testes de inbox). Pass-through que captura o onOpenChange para simular o
// fechamento pelo mesmo caminho de produção (`if (!v) cleanup()`).
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
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    storage: { from: vi.fn() },
  },
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_ANON_KEY: 'anon-test',
}));

import { VoiceChangerPicker } from '../VoiceChangerPicker';

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn(() => {
    this.state = 'recording';
  });
  // O navegador dispara `onstop` quando stop() é chamado — o mock reproduz isso
  // de forma síncrona para exercitar o handler real do componente.
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

function makeStream() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: vi.fn(() => [track]) };
  return { stream, track };
}

const getUserMedia = vi.fn();

function botaoGravar(): HTMLButtonElement {
  const mic = document.querySelector('.lucide-mic');
  const btn = mic?.closest('button');
  if (!btn) throw new Error('botão de gravar não encontrado');
  return btn;
}

describe('VoiceChangerPicker — ciclo de vida da captura (R2-INB-057)', () => {
  beforeEach(() => {
    MockMediaRecorder.instances = [];
    popoverState.onOpenChange = undefined;
    getUserMedia.mockReset();
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('para o MediaRecorder e os tracks ao DESMONTAR durante a gravação', async () => {
    const { stream, track } = makeStream();
    getUserMedia.mockResolvedValue(stream);
    const { unmount } = render(<VoiceChangerPicker onSendAudio={vi.fn()} />);
    act(() => {
      popoverState.onOpenChange?.(true);
    });

    await act(async () => {
      fireEvent.click(botaoGravar());
    });
    const recorder = MockMediaRecorder.instances[0];
    expect(recorder.start).toHaveBeenCalled();

    unmount();

    expect(recorder.stop).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
  });

  it('para o MediaRecorder e os tracks ao FECHAR o popover durante a gravação', async () => {
    const { stream, track } = makeStream();
    getUserMedia.mockResolvedValue(stream);
    render(<VoiceChangerPicker onSendAudio={vi.fn()} />);
    act(() => {
      popoverState.onOpenChange?.(true);
    });

    await act(async () => {
      fireEvent.click(botaoGravar());
    });
    const recorder = MockMediaRecorder.instances[0];
    expect(recorder.start).toHaveBeenCalled();

    act(() => {
      popoverState.onOpenChange?.(false);
    });

    expect(recorder.stop).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
  });

  it('desanexa o onstop do recorder ao fechar (onstop tardio não ressuscita o blob)', async () => {
    const { stream } = makeStream();
    getUserMedia.mockResolvedValue(stream);
    render(<VoiceChangerPicker onSendAudio={vi.fn()} />);
    act(() => {
      popoverState.onOpenChange?.(true);
    });

    await act(async () => {
      fireEvent.click(botaoGravar());
    });
    const recorder = MockMediaRecorder.instances[0];
    const onstopTardio = recorder.onstop;
    expect(onstopTardio).not.toBeNull();

    act(() => {
      popoverState.onOpenChange?.(false);
    });

    // O handler tem que sair do recorder: se o navegador entregar o evento
    // depois do cleanup, ele não pode repovoar `recordedBlob` (senão o popover
    // reabriria mostrando uma gravação fantasma).
    expect(recorder.onstop).toBeNull();
    expect(() =>
      act(() => {
        onstopTardio?.();
      }),
    ).not.toThrow();
  });

  it('NÃO inicia captura quando o popover fecha com o getUserMedia pendente', async () => {
    let resolveGum: (s: unknown) => void = () => {};
    getUserMedia.mockReturnValue(new Promise((r) => { resolveGum = r; }));
    render(<VoiceChangerPicker onSendAudio={vi.fn()} />);
    act(() => {
      popoverState.onOpenChange?.(true);
    });

    fireEvent.click(botaoGravar());
    act(() => {
      popoverState.onOpenChange?.(false);
    });

    const { stream, track } = makeStream();
    await act(async () => {
      resolveGum(stream);
    });

    expect(MockMediaRecorder.instances).toHaveLength(0);
    expect(track.stop).toHaveBeenCalled();
    expect(screen.queryByText('Gravando...')).not.toBeInTheDocument();
  });

  it('NÃO inicia captura quando o componente desmonta com o getUserMedia pendente', async () => {
    let resolveGum: (s: unknown) => void = () => {};
    getUserMedia.mockReturnValue(new Promise((r) => { resolveGum = r; }));
    const { unmount } = render(<VoiceChangerPicker onSendAudio={vi.fn()} />);
    act(() => {
      popoverState.onOpenChange?.(true);
    });

    fireEvent.click(botaoGravar());
    unmount();

    const { stream, track } = makeStream();
    await act(async () => {
      resolveGum(stream);
    });

    expect(MockMediaRecorder.instances).toHaveLength(0);
    expect(track.stop).toHaveBeenCalled();
  });
});
