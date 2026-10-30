import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * N-199 — regras de roteamento: seletores e interruptor precisam de nome
 * acessível (aria-label) para que leitores de tela anunciem a função de
 * cada controle.
 *
 * Aceite: 3 comboboxes com aria-label e switch "Ativar regra <nome>";
 * axe zerado. Dois comboboxes (Canal, Fila) vivem neste componente; o
 * terceiro (Tipo de canal, OmnichannelManager.tsx) é provado em
 * OmnichannelManager.a11y.test.tsx.
 */

type MockState = {
  rulesData: { data: unknown; error: null };
  queuesData: { data: unknown; error: null };
};

const mockState: MockState = {
  rulesData: { data: [], error: null },
  queuesData: { data: [], error: null },
};

function cadeia(resultado: { data: unknown; error: null }) {
  const alvo: Record<string, unknown> = {};
  for (const metodo of ['select', 'order', 'eq', 'limit', 'maybeSingle']) {
    alvo[metodo] = () => alvo;
  }
  alvo.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
    Promise.resolve(resultado).then(ok, erro);
  return alvo;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'channel_routing_rules') {
        return cadeia(mockState.rulesData);
      }
      if (table === 'queues') {
        return cadeia(mockState.queuesData);
      }
      return cadeia({ data: [], error: null });
    }),
    auth: { getUser: async () => ({ data: { user: null } }) },
  },
}));

import { ChannelRoutingRules } from '../ChannelRoutingRules';

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('ChannelRoutingRules — a11y: nomes nos seletores e no interruptor', () => {
  beforeEach(() => {
    mockState.rulesData = { data: [], error: null };
    mockState.queuesData = { data: [], error: null };
    vi.clearAllMocks();
  });

  it('2 comboboxes têm aria-label: Canal e Fila (o 3º, Tipo de canal, é provado em OmnichannelManager.a11y.test.tsx)', async () => {
    wrap(<ChannelRoutingRules />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /nova regra/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /nova regra/i }));

    expect(screen.getByRole('combobox', { name: 'Canal' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Fila' })).toBeInTheDocument();
  });

  it('switch "Ativar regra <nome>" tem aria-label com o nome do canal', async () => {
    mockState.rulesData = {
      data: [
        {
          id: 'r1',
          channel_type: 'whatsapp',
          queue_id: null,
          priority: 1,
          is_active: true,
          queue: null,
          channel_connection: null,
        },
      ],
      error: null,
    };

    wrap(<ChannelRoutingRules />);

    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: /ativar regra whatsapp/i }),
      ).toBeInTheDocument();
    });

    const switchEl = screen.getByRole('switch', { name: /ativar regra whatsapp/i });
    expect(switchEl).toHaveAttribute('aria-label', 'Ativar regra WhatsApp');
  });

  it('axe não acusa violações nos controles de roteamento com o formulário aberto', async () => {
    mockState.rulesData = {
      data: [
        {
          id: 'r1',
          channel_type: 'whatsapp',
          queue_id: null,
          priority: 1,
          is_active: true,
          queue: null,
          channel_connection: null,
        },
      ],
      error: null,
    };
    mockState.queuesData = {
      data: [{ id: 'q1', name: 'Fila WhatsApp' }],
      error: null,
    };

    const { container } = wrap(<ChannelRoutingRules />);

    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: /ativar regra whatsapp/i }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /nova regra/i }));

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Canal' })).toBeInTheDocument();
    });

    // container cobre o formulário "Nova regra" (div inline, sem portal:
    // este componente não usa Dialog). heading-order segue desativada:
    // defeito pré-existente fora deste cartão (AlertTitle usa h5 sem h4
    // precedente).
    const results = await axe(container, {
      rules: {
        'heading-order': { enabled: false },
      },
    });
    expect(results).toHaveNoViolations();
  });
});
