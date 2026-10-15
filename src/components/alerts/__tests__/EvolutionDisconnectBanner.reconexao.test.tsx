import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';

// framer-motion lê matchMedia (ausente no jsdom): trava em "sem movimento".
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const { from, channel } = vi.hoisted(() => {
  const cadeia = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
  };
  const from = vi.fn((_tabela: string) => cadeia);
  const channel = vi.fn((_nome: string) => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  }));
  return { from, channel };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => from(...(args as [string])),
    channel: (...args: unknown[]) => channel(...(args as [string])),
    removeChannel: vi.fn(),
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
  },
}));

import { EvolutionDisconnectBanner } from '@/components/alerts/EvolutionDisconnectBanner';

describe('EvolutionDisconnectBanner — reconexão e canal exclusivo', () => {
  beforeEach(() => {
    from.mockClear();
    channel.mockClear();
  });

  it('usa tópico exclusivo por instância (não o nome fixo "disconnect-banner")', () => {
    render(<EvolutionDisconnectBanner />);

    expect(channel).toHaveBeenCalledTimes(1);
    const [topico] = channel.mock.calls[0] as [string];
    expect(topico).toMatch(/^disconnect-banner:.+/);
    expect(topico).not.toBe('disconnect-banner');
  });

  it('recarrega o status quando a rede volta, sem depender de um evento novo', async () => {
    render(<EvolutionDisconnectBanner />);

    // Carga inicial: fetchStatus.
    await waitFor(() => expect(from).toHaveBeenCalledTimes(1));

    act(() => { window.dispatchEvent(new Event('online')); });

    // useRealtimeReconnect(fetchStatus): o status é relido sem nenhum UPDATE
    // no canal — um "disconnected" gravado na queda volta a aparecer.
    await waitFor(() => expect(from).toHaveBeenCalledTimes(2));
  });
});
