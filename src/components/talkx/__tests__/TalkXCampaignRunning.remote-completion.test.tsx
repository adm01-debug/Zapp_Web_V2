import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * R2-MOD-032 — Conclusão remota da campanha não limpa seleção e modais em andamento.
 *
 * Cenário real: a campanha selecionada (sending) é concluída ou cancelada por outra
 * fonte (servidor/realtime), enquanto o operador tem um modal de ação aberto
 * (Pausar / Cancelar / Editar Limites). A campanha sai de `sending`, o modal fica
 * preso e seus handlers viram no-op silencioso (`if (!campaign) return`).
 *
 * O efeito de limpeza existia, mas estava morto: o primeiro `useEffect` gravava
 * `campaign = null` em `prevCampaignRef` ANTES de o segundo efeito testar
 * `prevCampaignRef.current !== null`, que portanto já era `null`.
 *
 * O teste varia o resultado do hook ENTRE RENDERS (`rerender` na MESMA árvore e no
 * MESMO QueryClient): uma fixture `sending` fixa nunca exercita a transição.
 */

const { state, toastInfo } = vi.hoisted(() => ({
  toastInfo: vi.fn(),
  state: {
    // Fixture viva: muda entre renders para simular a conclusão remota.
    campaignList: [] as unknown[],
  },
}));

const CAMPAIGN_SENDING = {
  id: 'c1',
  name: 'Campanha Teste',
  message_template: 'Olá {{nome}}',
  variables_config: [],
  typing_delay_min: 1500,
  typing_delay_max: 4000,
  send_interval_min: 8000,
  send_interval_max: 20000,
  status: 'sending',
  total_recipients: 10,
  sent_count: 5,
  failed_count: 0,
  delivered_count: 5,
  read_count: 1,
  replied_count: 0,
  outcome_unknown_count: 0,
  whatsapp_connection_id: null,
  created_by: null,
  started_at: '2026-10-05T12:00:00.000Z',
  completed_at: null,
  created_at: '2026-10-05T10:00:00.000Z',
  updated_at: '2026-10-05T12:00:00.000Z',
  media_url: null,
  media_type: null,
  scheduled_at: null,
  speed_profile: 'moderate',
  send_window_start: null,
  send_window_end: null,
  business_hours_only: false,
  revision: 1,
};

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: state.campaignList,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetchCampaigns: vi.fn(),
    updateCampaign: { mutateAsync: vi.fn() },
    updateCampaignLimits: { mutateAsync: vi.fn() },
    pauseCampaign: vi.fn(),
    cancelCampaign: vi.fn(),
    startCampaign: vi.fn(),
  }),
}));

vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const SvgBox = ({ children }: { children?: React.ReactNode }) => <svg>{children}</svg>;
  return {
    AreaChart: SvgBox,
    Area: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    ResponsiveContainer: Box,
  };
});

vi.mock('@/components/dashboard/overview/DashboardKpiCard', () => ({
  DashboardKpiCard: () => <div data-testid="kpi-card" />,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: toastInfo, warning: vi.fn() },
}));

// Cadeia thenable genérica: o componente só lê listas via .select().eq().order().limit().not().
const chain = (): Record<string, unknown> => ({
  select: () => chain(),
  eq: () => chain(),
  order: () => chain(),
  not: () => chain(),
  limit: () => chain(),
  single: () => Promise.resolve({ data: null, error: null }),
  then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
});

vi.mock('@/lib/supabaseHelpers', () => {
  const realtimeChannel = () => {
    const channel = { on: () => channel, subscribe: () => channel };
    return channel;
  };
  return {
    fromTable: () => chain(),
    supabase: {
      from: () => chain(),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      channel: realtimeChannel,
      removeChannel: vi.fn(),
    },
    invokeEdge: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
});

import { TalkXCampaignRunning } from '@/components/talkx/TalkXCampaignRunning';

// QueryClient ÚNICO: `rerender` precisa reconciliar a MESMA árvore para a transição
// ser um re-render (e não uma nova montagem que zeraria os modais sozinha).
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const view = () => (
  <QueryClientProvider client={queryClient}>
    <TalkXCampaignRunning onBack={() => {}} onViewMonitor={() => {}} />
  </QueryClientProvider>
);

const completedCampaign = () => ({ ...CAMPAIGN_SENDING, status: 'completed' });

describe('TalkXCampaignRunning · conclusão remota limpa seleção e modais (R2-MOD-032)', () => {
  beforeEach(() => {
    state.campaignList = [{ ...CAMPAIGN_SENDING }];
    toastInfo.mockClear();
  });

  const cases = [
    { nome: 'Pausar', gatilho: /^Pausar$/, titulo: 'Pausar Campanha?' },
    { nome: 'Cancelar', gatilho: /^Cancelar campanha$/, titulo: 'Cancelar Campanha?' },
    { nome: 'Limites', gatilho: /^Editar Limites$/, titulo: 'Editar Limites de Envio' },
  ] as const;

  it.each(cases)(
    'com o modal $nome aberto, a campanha concluir remoto fecha o modal, limpa a seleção e informa',
    ({ gatilho, titulo }) => {
      const rendered = render(view());

      fireEvent.click(screen.getByRole('button', { name: gatilho }));
      expect(screen.getByText(titulo)).toBeTruthy();

      // A campanha muda de status FORA da tela: `completed` sai da lista sending/paused.
      state.campaignList = [completedCampaign()];
      rendered.rerender(view());

      // modal fechado
      expect(screen.queryByText(titulo)).toBeNull();
      // seleção limpa: o seletor volta ao vazio e a tela anuncia que não há campanha ativa
      const select = screen.getByLabelText('Selecionar campanha') as HTMLSelectElement;
      expect(select.value).toBe('');
      expect(screen.getByRole('option', { name: 'Nenhuma campanha ativa' })).toBeTruthy();
      // e o operador é informado
      expect(toastInfo).toHaveBeenCalledWith('Campanha concluída ou cancelada.');
    },
  );

  it('campanha cancelada remotamente também limpa seleção e modal', () => {
    const rendered = render(view());

    fireEvent.click(screen.getByRole('button', { name: /^Pausar$/ }));
    expect(screen.getByText('Pausar Campanha?')).toBeTruthy();

    state.campaignList = [{ ...CAMPAIGN_SENDING, status: 'cancelled' }];
    rendered.rerender(view());

    expect(screen.queryByText('Pausar Campanha?')).toBeNull();
    expect((screen.getByLabelText('Selecionar campanha') as HTMLSelectElement).value).toBe('');
    expect(toastInfo).toHaveBeenCalledWith('Campanha concluída ou cancelada.');
  });

  it('campanha que continua ativa NÃO fecha o modal nem limpa a seleção', () => {
    const rendered = render(view());

    fireEvent.click(screen.getByRole('button', { name: /^Pausar$/ }));
    expect(screen.getByText('Pausar Campanha?')).toBeTruthy();

    // Re-render com a mesma campanha ativa (a lista pode chegar nova do servidor).
    state.campaignList = [{ ...CAMPAIGN_SENDING }];
    rendered.rerender(view());

    expect(screen.getByText('Pausar Campanha?')).toBeTruthy();
    expect((screen.getByLabelText('Selecionar campanha') as HTMLSelectElement).value).toBe('c1');
    expect(toastInfo).not.toHaveBeenCalled();
  });
});
