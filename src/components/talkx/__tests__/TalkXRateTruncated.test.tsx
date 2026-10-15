/**
 * TL-156 [refazer 1] — prova do aviso "Série limitada…" nas telas 11 e 12.
 *
 * Recusa (5 pontos): (1) tela 12 lia o truncado de outra variável em vez do
 * mesmo retorno da consulta; (2) o mesmo na tela 11; (3) o aviso só aparece
 * quando a consulta volta CHEIA (2.000) — 1.999 não aciona; (4) a prova da
 * tela 12 renderiza a tela de verdade com leitura mockada nos dois estados;
 * (5) cobertura dos ramos mexidos. Este arquivo prova todos os pontos com
 * leitura REAL (sem mock de hook): o mock fica só na borda do banco.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isRateSeriesTruncated, TALKX_RATE_ROW_LIMIT } from '../tracking/talkxRatePanel';
import { useTalkXMonitor } from '@/hooks/integrations/useTalkXMonitor';
import { renderHook } from '@testing-library/react';
import { TalkXLiveMonitor } from '../TalkXLiveMonitor';
import { TalkXCampaignRunning } from '../TalkXCampaignRunning';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

const h = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
}));

function makeRows(n: number) {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => ({
    id: `r-${i}`,
    contact_id: null,
    status: 'queued',
    sent_at: new Date(now - (i % 20) * 60_000).toISOString(),
    delivered_at: null,
    replied_at: null,
    error_message: null,
    personalized_message: null,
  }));
}

function chainFor(table: string) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.not = () => chain;
  chain.is = () => chain;
  chain.order = () => chain;
  chain.limit = () => chain;
  chain.single = async () => ({ data: null, error: { message: 'sem linha (stub)' } });
  chain.then = (resolve: (value: unknown) => void) =>
    resolve({ data: table === 'talkx_recipients' ? h.rows : [], error: null });
  return chain;
}

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: (table: string) => chainFor(table),
  supabase: {
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
    from: (table: string) => chainFor(table),
  },
}));

const monitorCampaign = {
  id: 'camp-ritmo',
  name: 'Ritmo',
  status: 'sending',
  total_recipients: 2000,
  sent_count: 100,
  delivered_count: 80,
  failed_count: 5,
  replied_count: 10,
  outcome_unknown_count: 0,
  send_speed: 'moderate',
  started_at: new Date(Date.now() - 30 * 60_000).toISOString(),
  send_interval_max: 60,
  typing_delay_max: 5,
  whatsapp_connection_id: null,
  completed_at: null,
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const chain = chainFor(table);
      if (table === 'talkx_campaigns') {
        chain.single = async () => ({ data: monitorCampaign, error: null });
      }
      return chain;
    },
    channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/hooks/integrations/useTalkXEvents', () => ({
  useTalkXEvents: () => ({ events: [], isLoading: false, isError: false, error: null, refetch: vi.fn(), logEvent: vi.fn() }),
}));

vi.mock('@/hooks/integrations/useTalkXConnectionStatus', () => ({
  useTalkXConnectionStatus: () => ({ status: null, label: null, loading: false }),
}));

const screenCampaign = {
  ...monitorCampaign,
  progress: { sent: 100, total: 2000 },
  stats: { sent: 100, delivered: 80, failed: 5, pending: 1900 },
} as unknown as TalkXCampaign;

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: [screenCampaign],
    updateCampaign: vi.fn(),
    updateCampaignLimits: { mutateAsync: vi.fn() },
    pauseCampaign: vi.fn(),
    cancelCampaign: vi.fn(),
    startCampaign: vi.fn(),
    refetchCampaigns: vi.fn(),
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
  }),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  AreaChart: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ReferenceLine: () => null,
}));

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return Wrapper;
}

beforeEach(() => {
  h.rows = [];
});

/**
 * O gráfico carrega depois do resto da tela: espera a legenda ("Enviadas",
 * que só existe no estado carregado com dados) DENTRO da seção do card e
 * devolve os seletores com escopo — sem isso o teste lê a tela ainda
 * carregando (falso "some") ou esbarra em outro "Enviadas" da página.
 */
async function chartSection(titleText: string) {
  const title = await screen.findByText(titleText);
  const section = title.closest('section');
  expect(section).toBeTruthy();
  const view = within(section as HTMLElement);
  await view.findByText('Enviadas');
  return view;
}

describe('isRateSeriesTruncated — só a consulta cheia aciona o aviso (P3)', () => {
  it('o teto é 2.000', () => {
    expect(TALKX_RATE_ROW_LIMIT).toBe(2000);
  });

  it('0 e 1.999 linhas não acionam o aviso', () => {
    expect(isRateSeriesTruncated(0)).toBe(false);
    expect(isRateSeriesTruncated(1999)).toBe(false);
  });

  it('exatamente 2.000 (ou mais) acionam o aviso', () => {
    expect(isRateSeriesTruncated(2000)).toBe(true);
    expect(isRateSeriesTruncated(2500)).toBe(true);
  });
});

describe('useTalkXMonitor — truncado sai do mesmo retorno que alimenta o card (P2)', () => {
  it('truncated=true com 2.000 linhas e rateByMinute da mesma leitura', async () => {
    h.rows = makeRows(2000);
    const { result } = renderHook(() => useTalkXMonitor('camp-cheia'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.truncated).toBe(true));
    expect(result.current.recipients.length).toBe(2000);
    const total = result.current.rateByMinute.reduce((a, r) => a + r.Enviadas, 0);
    expect(total).toBe(2000);
  });

  it('truncated=false com 1.999 linhas', async () => {
    h.rows = makeRows(1999);
    const { result } = renderHook(() => useTalkXMonitor('camp-quase'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.recipients.length).toBe(1999));
    expect(result.current.truncated).toBe(false);
  });
});

describe('tela 11 — aviso sai do retorno do hook (P2+P5)', () => {
  it('mostra "Série limitada…" com 2.000 linhas', async () => {
    h.rows = makeRows(2000);
    render(createElement(TalkXLiveMonitor, { campaignId: 'camp-11-cheia' }), { wrapper: wrapper() });
    const view = await chartSection('Ritmo de Entrega');
    expect(view.getByText(/Série limitada/)).toBeTruthy();
  });

  it('some com 1.999 linhas', async () => {
    h.rows = makeRows(1999);
    render(createElement(TalkXLiveMonitor, { campaignId: 'camp-11-quase' }), { wrapper: wrapper() });
    const view = await chartSection('Ritmo de Entrega');
    expect(view.queryByText(/Série limitada/)).toBeNull();
  });
});

describe('tela 12 — tela de verdade com leitura mockada nos dois estados (P1+P4)', () => {
  it('mostra "Série limitada…" com 2.000 linhas', async () => {
    h.rows = makeRows(2000);
    render(
      createElement(TalkXCampaignRunning, { onBack: vi.fn(), onViewMonitor: vi.fn(), initialCampaignId: 'camp-ritmo' }),
      { wrapper: wrapper() },
    );
    const view = await chartSection('Ritmo de Envio');
    expect(view.getByText(/Série limitada/)).toBeTruthy();
  });

  it('some com 1.999 linhas', async () => {
    h.rows = makeRows(1999);
    render(
      createElement(TalkXCampaignRunning, { onBack: vi.fn(), onViewMonitor: vi.fn(), initialCampaignId: 'camp-ritmo' }),
      { wrapper: wrapper() },
    );
    const view = await chartSection('Ritmo de Envio');
    expect(view.queryByText(/Série limitada/)).toBeNull();
  });
});
