import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * X179 (TL-166) — "KPIs da supressão com janela e comparativo".
 *
 * Defeito: os quatro números do topo e o painel de proteção eram calculados no
 * navegador sobre o que a lista tinha carregado — "Opt-outs 30 dias" contava
 * `origin === 'optout'` (sem janela de 30 dias e ignorando `auto_optout`, que é
 * o único valor que o webhook grava), "Campanhas protegidas" mostrava "—" e o
 * rail mostrava o número de CONTATOS sob o rótulo "campanhas protegidas
 * automaticamente", com um '0' literal de LGPD.
 *
 * Agora os quatro leem `talkx_suppression_stats` (X176): valor, mini-barras da
 * série e variação contra o período anterior; a variação some quando o período
 * anterior é zero e "Campanhas protegidas" mostra o estado "Sem dados ainda" do
 * kit (A9) enquanto não houver campanha iniciada.
 *
 * Vermelho antes do fix (conferido revertendo a mudança de produção):
 * "Opt-outs 30 dias" mostrava 0 (a lista mockada tem 1 bloqueio manual), o card
 * "Campanhas protegidas" mostrava "—", os KPIs 2/3 não tinham mini-barras e o
 * rail não tinha medidor.
 */

const h = vi.hoisted(() => ({
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
  stats: null as unknown,
}));

/** Uma linha na lista de supressão: o defeito é justamente contar por ela. */
const blacklistRow = {
  id: 'bl-1',
  contact_id: 'c1',
  reason: 'Bloqueio manual',
  blocked_by: 'p1',
  created_at: '2026-09-01T10:00:00.000Z',
  origin: 'manual',
  campaign_id: null,
  removed_by: null,
  removed_at: null,
  contacts: { name: 'Ana Souza', phone: '+551****0001', company: null, avatar_url: null },
};

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.is = () => chain;
  chain.not = () => chain;
  chain.eq = () => chain;
  // thenable (a lista) + .limit (a busca do modal), como no cliente real
  chain.order = () => Object.assign(Promise.resolve({ data: [blacklistRow], error: null }), {
    limit: () => Promise.resolve({ data: [], error: null }),
  });
  chain.limit = () => Promise.resolve({ data: [], error: null });
  return {
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
      from: () => chain,
      rpc: (fn: string, args: Record<string, unknown>) => {
        h.rpcCalls.push({ fn, args });
        return Promise.resolve({ data: h.stats, error: null });
      },
    },
  };
});

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => ({
    insert: () => Promise.resolve({ error: null }),
    select: () => Promise.resolve({ data: [], error: null }),
  }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'auth-1' }, profile: { id: 'p1' }, session: null, loading: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { TalkXSuppression } from '../TalkXSuppression';

/** Resposta de `talkx_suppression_stats` com os números do mock da tela 06. */
function statsFixture(over: Record<string, Record<string, unknown>> = {}) {
  return {
    active: { value: 4892, previous: 4368, series: [120, 180, 140, 200, 160, 90, 110, 240] },
    optouts: { value: 3, previous: 0, series: [0, 1, 1, 1, 0, 0, 0, 0] },
    manual: { value: 892, previous: 850, series: [10, 12, 9, 14, 11, 8, 13, 15] },
    protected: { value: 126, previous: 107, series: [1, 2, 3, 4, 5, 6, 7, 8], total_started: 130 },
    ...over,
  };
}

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TalkXSuppression />
    </QueryClientProvider>,
  );
}

/** O card do KPI pelo rótulo — o <p> do rótulo é filho direto do card. */
async function kpiCard(label: string): Promise<HTMLElement> {
  const labelEl = await screen.findByText(label);
  return labelEl.closest('[data-testid="kpi-card"]') as HTMLElement;
}

function valueOf(card: HTMLElement): string {
  return within(card).getByTestId('kpi-value').textContent ?? '';
}

describe('TalkXSuppression · KPIs da supressão (X179)', () => {
  beforeEach(() => {
    h.rpcCalls.length = 0;
    h.stats = statsFixture();
  });

  it('lê os quatro números de talkx_suppression_stats, não da lista carregada', async () => {
    renderView();

    await waitFor(() => {
      expect(valueOf(document.querySelector('[data-testid="kpi-card"]') as HTMLElement)).toBe('4.892');
    });
    const optoutsCard = await kpiCard('Opt-outs 30 dias');
    await waitFor(() => expect(valueOf(optoutsCard)).toBe('3'));
    const manualCard = await kpiCard('Bloqueios manuais');
    await waitFor(() => expect(valueOf(manualCard)).toBe('892'));
    const protegidasCard = await kpiCard('Campanhas protegidas');
    await waitFor(() => expect(valueOf(protegidasCard)).toBe('126'));

    // A janela é parâmetro da RPC (30 dias é o padrão da etapa).
    expect(h.rpcCalls[0]).toEqual({ fn: 'talkx_suppression_stats', args: { p_days: 30 } });
  });

  it('período anterior zerado esconde a variação e período anterior com base mostra "+50%"', async () => {
    renderView();

    // optouts {value:3, previous:0} → sem variação, mesmo com a base já carregada
    const optouts = await kpiCard('Opt-outs 30 dias');
    await waitFor(() => expect(valueOf(optouts)).toBe('3'));
    expect(within(optouts).queryByText('vs. período anterior')).toBeNull();
    // o card inteiro não tem variação nenhuma (nem o rótulo, nem o "+N%")
    expect(optouts.textContent).not.toContain('%');

    // o mecanismo continua vivo no card vizinho (4892 contra 4368 = +12%)
    const suprimidos = await kpiCard('Contatos suprimidos');
    await waitFor(() => expect(within(suprimidos).getByText(/\+12%/)).toBeTruthy());
  });

  it('período anterior 2 contra 3 mostra a variação de "+50%"', async () => {
    h.stats = statsFixture({ optouts: { value: 3, previous: 2, series: [0, 0, 0, 0, 1, 1, 1, 0] } });
    renderView();

    const optouts = await kpiCard('Opt-outs 30 dias');
    await waitFor(() => expect(within(optouts).getByText(/^\+50%$/)).toBeTruthy());
    expect(within(optouts).getByText('vs. período anterior')).toBeTruthy();
  });

  it('"Campanhas protegidas" mostra "Sem dados ainda" do kit enquanto não houver campanha iniciada', async () => {
    h.stats = statsFixture({
      protected: { value: 0, previous: 0, series: [], total_started: 0 },
    });
    renderView();

    await waitFor(() => expect(screen.getByText('Sem dados ainda')).toBeTruthy());
    // os outros três continuam com os números do servidor
    const optouts = await kpiCard('Opt-outs 30 dias');
    await waitFor(() => expect(valueOf(optouts)).toBe('3'));
  });

  it('as mini-barras do KPI vêm da série do servidor', async () => {
    renderView();

    const card = await kpiCard('Contatos suprimidos');
    const bars = await waitFor(() => within(card).getByTestId('kpi-bars'));

    // série de 8 pontos → 8 barras; a última (240) é o máximo da série
    expect(bars.children).toHaveLength(8);
    expect((bars.children[7] as HTMLElement).style.height).toBe('100%');
    expect((bars.children[0] as HTMLElement).style.height).toBe('50%');
  });

  it('o Centro de proteção recebe o medidor e os quatro números com ícone', async () => {
    renderView();

    const gauge = await waitFor(() => {
      const el = screen.getByTestId('protection-gauge');
      expect(el).toHaveAttribute('aria-label', '126 de 130 campanhas iniciadas protegidas pela lista');
      return el;
    });
    // o rótulo antigo mostrava o total de CONTATOS sob "campanhas protegidas"
    expect(screen.queryByText('campanhas protegidas automaticamente')).toBeNull();
    expect(screen.getByText('campanhas protegidas')).toBeTruthy();
    expect(screen.getByText('Protegidas')).toBeTruthy();
    expect(screen.queryByText('LGPD')).toBeNull();
  });
});
