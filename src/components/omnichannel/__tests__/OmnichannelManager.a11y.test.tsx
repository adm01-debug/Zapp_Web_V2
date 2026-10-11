import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * N-199 — o 3º combobox do aceite ("Tipo de canal") vive no diálogo
 * "Adicionar Canal" do OmnichannelManager (OmnichannelManager.tsx), não
 * no ChannelRoutingRules. Este teste prova que ele tem nome acessível.
 * (Os outros dois — Canal e Fila — estão em
 * ChannelRoutingRules.a11y.test.tsx.)
 */

const state: {
  channels: Array<{ id: string; channel_type: string; name: string; status: string }>;
  whatsapp: Array<{ id: string; status: string }>;
} = { channels: [], whatsapp: [] };

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'channel_connections_safe') {
        return {
          select: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({ data: state.channels, error: null }),
          })),
        };
      }
      if (table === 'whatsapp_connections_safe') {
        return {
          select: vi.fn().mockResolvedValue({ data: state.whatsapp, error: null }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    }),
  },
}));

vi.mock('../ChannelRoutingRules', () => ({ ChannelRoutingRules: () => null }));

import { OmnichannelManager } from '../OmnichannelManager';

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('OmnichannelManager — a11y: seletor Tipo de canal tem nome acessível', () => {
  beforeEach(() => {
    state.channels = [];
    state.whatsapp = [];
    vi.clearAllMocks();
  });

  it('combobox "Tipo de canal" tem aria-label no diálogo Adicionar Canal', async () => {
    wrap(<OmnichannelManager />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /adicionar canal/i }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /adicionar canal/i }));

    const combo = await screen.findByRole('combobox', { name: 'Tipo de canal' });
    expect(combo).toBeInTheDocument();
    expect(combo).toHaveAttribute('aria-label', 'Tipo de canal');
  });
});
