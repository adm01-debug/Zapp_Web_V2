import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// ═══════════════════════════════════════════════════════════
// Mock Setup
// ═══════════════════════════════════════════════════════════

const mockInvoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { AIGenerateDialog } from '../AIGenerateDialog';

// ═══════════════════════════════════════════════════════════
// `new Audio()` falso: o jsdom não implementa a reprodução, então o
// jogador criado pelo componente é a única prova de que o áudio começou.
// ═══════════════════════════════════════════════════════════

class FakeAudio {
  src: string;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  constructor(src: string) {
    this.src = src;
    audios.push(this);
  }
}

let audios: FakeAudio[] = [];

/** Reprodução iniciada por qualquer jogador criado durante o teste. */
const tocou = () => audios.filter((a) => a.play.mock.calls.length > 0).length;

// O diálogo real é controlado pelo pai (`open`/`onOpenChange`), como em
// MediaLibraryAdmin — o fechar do teste é o fechar do usuário.
function Harness() {
  const [open, setOpen] = useState(true);
  return <AIGenerateDialog open={open} onOpenChange={setOpen} onSaved={() => {}} />;
}

function escreverPrompt() {
  fireEvent.change(screen.getByPlaceholderText(/Risada de vilão/), {
    target: { value: 'Trovão distante com chuva' },
  });
}

describe('AIGenerateDialog — resposta tardia depois de fechar o diálogo (#409)', () => {
  beforeEach(() => {
    audios = [];
    mockInvoke.mockReset();
    vi.stubGlobal('Audio', FakeAudio);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('não inicia reprodução quando a resposta da geração chega depois de o diálogo fechar', async () => {
    let resolver: ((value: unknown) => void) | undefined;
    mockInvoke.mockImplementation(
      () => new Promise((resolve) => { resolver = resolve; }),
    );

    render(<Harness />);
    escreverPrompt();
    fireEvent.click(screen.getByRole('button', { name: /gerar preview/i }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));

    // O usuário fecha o diálogo antes de a geração responder.
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /gerar preview/i })).toBeNull(),
    );

    await act(async () => {
      resolver?.({ data: { audioContent: 'QUJD' }, error: null });
    });

    expect(audios).toHaveLength(0);
    expect(tocou()).toBe(0);
  });

  it('inicia a prévia normalmente quando o diálogo continua aberto', async () => {
    mockInvoke.mockResolvedValue({ data: { audioContent: 'QUJD' }, error: null });

    render(<Harness />);
    escreverPrompt();
    fireEvent.click(screen.getByRole('button', { name: /gerar preview/i }));

    await waitFor(() => expect(audios).toHaveLength(1));
    expect(tocou()).toBe(1);
    expect(audios[0].src).toBe('data:audio/mpeg;base64,QUJD');
    expect(screen.getByText('Pronto')).toBeTruthy();
  });
});
