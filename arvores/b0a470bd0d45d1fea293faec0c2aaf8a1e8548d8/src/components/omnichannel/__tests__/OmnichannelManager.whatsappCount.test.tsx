import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * R2-API-063 — "Painéis Omnichannel ... fixam WhatsApp em um".
 *
 * Defeito provado aqui: o cartão de estatísticas do OmnichannelManager mostrava
 * a constante `1` para WhatsApp (independente de haver zero, uma ou várias
 * conexões reais) e a tela vazia declarava "Seus canais WhatsApp já estão
 * ativos" sem consultar nada.
 *
 * Aceite coberto: derivar a contagem WhatsApp da fonte autorizada
 * (`whatsapp_connections_safe`) com estado de erro/ausência explícito; testar
 * zero e duas conexões sem substituir ausência por uma constante.
 */

type WaRow = { id: string; status: string };

const state: {
  channels: Array<{ id: string; channel_type: string; name: string; status: string }>;
  channelsError: { message: string } | null;
  whatsapp: WaRow[];
  whatsappError: { message: string } | null;
} = { channels: [], channelsError: null, whatsapp: [], whatsappError: null };

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'channel_connections_safe') {
        return {
          select: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({ data: state.channels, error: state.channelsError }),
          })),
        };
      }
      if (table === 'whatsapp_connections_safe') {
        return {
          select: vi.fn().mockResolvedValue({ data: state.whatsapp, error: state.whatsappError }),
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

const waCount = () => screen.getByTestId('channel-count-whatsapp').textContent;

describe('OmnichannelManager — contagem WhatsApp real (R2-API-063)', () => {
  beforeEach(() => {
    state.channels = [];
    state.channelsError = null;
    state.whatsapp = [];
    state.whatsappError = null;
  });

  it('duas conexões conectadas → 2 (nunca a constante 1)', async () => {
    state.whatsapp = [
      { id: 'w1', status: 'connected' },
      { id: 'w2', status: 'connected' },
      { id: 'w3', status: 'pending_setup' },
    ];
    wrap(<OmnichannelManager />);
    await waitFor(() => expect(waCount()).toBe('2'));
  });

  it('zero conexões WhatsApp → 0, ausência explícita', async () => {
    state.whatsapp = [];
    wrap(<OmnichannelManager />);
    await waitFor(() => expect(waCount()).toBe('0'));
  });

  it('falha na consulta WhatsApp → indisponível explícito, não um número inventado', async () => {
    state.whatsappError = { message: 'boom' };
    wrap(<OmnichannelManager />);
    await waitFor(() => expect(waCount()).toBe('—'));
  });

  it('a tela vazia não afirma que os canais WhatsApp já estão ativos', async () => {
    state.channels = [];
    wrap(<OmnichannelManager />);
    await waitFor(() => expect(screen.getByText(/Nenhum canal adicional configurado/)).toBeInTheDocument());
    expect(screen.queryByText(/já estão ativos/i)).toBeNull();
  });
});
