import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * Tela 13 — "Campanha Pausada" (X156 · F11 Acompanhar campanha).
 *
 * O que este teste trava:
 *  - cabeçalho de pausa com o NOME da campanha (antes `paused` abria a tela
 *    "Campanha em Andamento", que nunca dizia de qual campanha se tratava);
 *  - banner âmbar de pausa com a data em que a campanha foi pausada;
 *  - "Retomar campanha" passa pelo servidor (`startCampaign`) e o modal de
 *    confirmação NÃO fecha antes de a resposta voltar — numa recusa
 *    (janela de envio, por exemplo) o operador continua no modal, com o motivo
 *    à vista, e nada navega;
 *  - "Encerrar campanha" chama `cancelCampaign` e só volta para a lista depois
 *    que o servidor aceitou;
 *  - painéis X160 montados nos dados do painel + benchmarks (nunca estáticos);
 *  - consulta com erro mostra o erro (e não o conteúdo nem o vazio);
 *  - campanha que saiu de "pausada" por fora avisa o contêiner pai.
 */

vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const SvgBox = ({ children }: { children?: React.ReactNode }) => <svg>{children}</svg>;
  return {
    ResponsiveContainer: Box,
    LineChart: SvgBox,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
    ReferenceLine: () => null,
  };
});

const panelState = vi.hoisted(() => ({
  report: null as unknown,
  replies: [] as Array<{ replied_at: string | null }>,
  benchmarks: null as unknown,
}));

vi.mock('@/lib/supabaseHelpers', () => {
  // Cadeia thenable: os painéis da pausada só leem recipients via
  // .select().eq().not().order().limit(n).
  const chain = (): Record<string, unknown> => ({
    select: () => chain(),
    eq: () => chain(),
    not: () => chain(),
    order: () => chain(),
    limit: () => chain(),
    then: (resolve: (value: unknown) => void) =>
      resolve({ data: panelState.replies, error: null }),
  });
  return {
    fromTable: () => chain(),
    supabase: {
      rpc: (fn: string) => {
        if (fn === 'talkx_campaign_report') {
          return Promise.resolve({ data: panelState.report, error: null });
        }
        return Promise.resolve({ data: panelState.benchmarks, error: null });
      },
    },
  };
});

type QueryState = {
  campaigns: Array<Record<string, unknown>>;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
};

const h = vi.hoisted(() => ({
  state: {
    campaigns: [] as Array<Record<string, unknown>>,
    isLoading: false,
    isError: false,
    error: null as Error | null,
    isFetching: false,
  } as QueryState,
  refetchCampaigns: vi.fn(),
  startCampaign: vi.fn(),
  cancelCampaign: vi.fn(),
  onBack: vi.fn(),
  onStatusChange: vi.fn(),
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: h.state.campaigns,
    isLoading: h.state.isLoading,
    isError: h.state.isError,
    error: h.state.error,
    isFetching: h.state.isFetching,
    refetchCampaigns: h.refetchCampaigns,
    startCampaign: h.startCampaign,
    cancelCampaign: h.cancelCampaign,
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { toast } from 'sonner';
import { TalkXCampaignPaused } from '../TalkXCampaignPaused';

const PAUSED_CAMPAIGN = {
  id: 'camp-pausada-1',
  name: 'Reativação de Leads',
  message_template: 'Olá {{nome}}, sentimos sua falta!',
  variables_config: [],
  typing_delay_min: 1500,
  typing_delay_max: 4000,
  send_interval_min: 8000,
  send_interval_max: 20000,
  status: 'paused',
  total_recipients: 2500,
  sent_count: 1640,
  failed_count: 40,
  delivered_count: 1520,
  whatsapp_connection_id: 'conn-1',
  created_by: 'user-1',
  started_at: '2026-09-06T13:15:00.000Z',
  completed_at: null,
  paused_at: '2026-09-06T14:32:00.000Z',
  created_at: '2026-09-06T12:30:00.000Z',
  updated_at: '2026-09-06T14:32:00.000Z',
  media_url: null,
  media_type: null,
  scheduled_at: null,
  speed_profile: 'moderate',
  revision: 3,
};

function setQueryState(over: Partial<QueryState>) {
  h.state = {
    campaigns: [],
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    ...over,
  };
}

function view({ pausedByName }: { pausedByName?: string | null } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <TalkXCampaignPaused
        campaignId="camp-pausada-1"
        pausedByName={pausedByName}
        onBack={h.onBack}
        onStatusChange={h.onStatusChange}
      />
    </QueryClientProvider>
  );
}

describe('TalkXCampaignPaused — cabeçalho, banner e ações (Tela 13)', () => {
  beforeEach(() => {
    h.refetchCampaigns.mockClear();
    h.startCampaign.mockReset();
    h.cancelCampaign.mockReset();
    h.onBack.mockClear();
    h.onStatusChange.mockClear();
    panelState.report = null;
    panelState.replies = [];
    panelState.benchmarks = null;
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.warning).mockClear();
  });

  it('cabeçalho nomeia a campanha pausada e o banner mostra a data da pausa', () => {
    setQueryState({ campaigns: [PAUSED_CAMPAIGN] });
    render(view());

    expect(screen.getByText('Campanha Pausada • Reativação de Leads')).toBeTruthy();
    expect(screen.getByText(/Nenhum novo contato será processado/)).toBeTruthy();
    expect(screen.getByText(/Pausada em 06 set 2026/)).toBeTruthy();
    // a campanha está pausada: nada de avisar o pai para navegar
    expect(h.onStatusChange).not.toHaveBeenCalled();
  });

  it('quem pausou é nomeado quando o contêiner resolve paused_by', () => {
    setQueryState({ campaigns: [PAUSED_CAMPAIGN] });
    render(view({ pausedByName: 'Ana Souza' }));

    expect(screen.getByText(/Pausada por Ana Souza em 06 set 2026/)).toBeTruthy();
  });

  it('retomar: o modal não fecha antes de o servidor confirmar', async () => {
    setQueryState({ campaigns: [PAUSED_CAMPAIGN] });
    let resolveStart: (v: boolean) => void = () => undefined;
    h.startCampaign.mockImplementation(() => new Promise<boolean>((resolve) => { resolveStart = resolve; }));

    render(view());

    fireEvent.click(screen.getByRole('button', { name: 'Retomar campanha' }));
    expect(screen.getByText('Retomar campanha?')).toBeTruthy();
    // o modal nomeia a campanha (o cabeçalho também traz o nome: escopo no modal)
    expect(within(screen.getByRole('alertdialog')).getByText(/Reativação de Leads/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Retomar' }));
    expect(h.startCampaign).toHaveBeenCalledWith('camp-pausada-1');
    // resposta ainda pendente: o modal continua aberto (nada de sucesso antecipado)
    expect(screen.getByText('Retomar campanha?')).toBeTruthy();

    await act(async () => { resolveStart(true); });
    await waitFor(() => expect(screen.queryByText('Retomar campanha?')).toBeNull());
  });

  it('retomar recusado pelo servidor: mostra o motivo, sem toast duplicado e sem navegar', async () => {
    setQueryState({ campaigns: [PAUSED_CAMPAIGN] });
    h.startCampaign.mockResolvedValue(false);

    render(view());
    fireEvent.click(screen.getByRole('button', { name: 'Retomar campanha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retomar' }));

    await waitFor(() => expect(h.startCampaign).toHaveBeenCalledTimes(1));
    // o operador continua no modal, com o motivo à vista
    expect(screen.getByText('Retomar campanha?')).toBeTruthy();
    expect(screen.getByText(/O servidor não aceitou a retomada/)).toBeTruthy();
    // o toast da recusa é o do próprio startCampaign — a tela não duplica
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
    expect(h.onStatusChange).not.toHaveBeenCalled();
  });

  it('painéis X160: série do painel + respostas + benchmarks, nunca estáticos', async () => {
    setQueryState({ campaigns: [PAUSED_CAMPAIGN] });
    const duasHorasAtras = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const umaHoraAtras = new Date(Date.now() - 3_600_000).toISOString();
    panelState.report = {
      hourly_series: [{ hour: duasHorasAtras, sent: 10, delivered: 8 }],
      kpis: { avg_reply_secs: 161 },
    };
    panelState.replies = [{ replied_at: umaHoraAtras }];
    panelState.benchmarks = {
      global: { campaign_count: 4, avg_delivery_rate_pct: 80, avg_reply_rate_pct: 10 },
    };

    render(view());

    // Resumo de Enviados: chips somam a série exibida (10 enviados, 8 entregues, 1 resposta).
    // O título aparece já no loading — espera-se pelos DADOS, não pelo título.
    await waitFor(() => expect(screen.getByText('Enviados 10')).toBeTruthy(), { timeout: 8000 });
    expect(screen.getByText('Entregues 8')).toBeTruthy();
    expect(screen.getByText('Respostas 1')).toBeTruthy();
    // Principais Métricas: totais da linha + média de resposta do painel + comparativo com base
    expect(screen.getByText('Principais Métricas')).toBeTruthy();
    expect(screen.getByText('2m 41s')).toBeTruthy();
    expect(screen.getAllByText(/vs\. média/).length).toBeGreaterThanOrEqual(1);
  });

  it('painéis indisponíveis: zeros sem comparativo, sem quebrar a tela', async () => {
    setQueryState({ campaigns: [PAUSED_CAMPAIGN] });
    panelState.report = null;
    panelState.replies = [];
    panelState.benchmarks = null;

    render(view());

    // Sem painel: série vazia → mensagem de vazio; métricas da linha, sem comparativo.
    // (Espera-se pelo DADO — o título e os chips zerados aparecem já no loading.)
    await waitFor(() => expect(screen.getByText('Nenhum envio registrado nesta campanha ainda.')).toBeTruthy(), { timeout: 8000 });
    expect(screen.getByText('Nenhum envio registrado nesta campanha ainda.')).toBeTruthy();
    expect(screen.getByText('Principais Métricas')).toBeTruthy();
    expect(screen.getByText('93%')).toBeTruthy();
    expect(screen.queryByText(/vs\. média/)).toBeNull();
  });

  it('retomar com a chamada estourando: avisa o operador e mantém o modal aberto', async () => {
    setQueryState({ campaigns: [PAUSED_CAMPAIGN] });
    h.startCampaign.mockRejectedValue(new Error('falha de rede T13'));

    render(view());
    fireEvent.click(screen.getByRole('button', { name: 'Retomar campanha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retomar' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro ao retomar a campanha.'));
    expect(screen.getByText('Retomar campanha?')).toBeTruthy();
  });

  it('encerrar: chama o servidor e só volta para a lista depois do aceite', async () => {
    setQueryState({ campaigns: [PAUSED_CAMPAIGN] });
    let resolveCancel: () => void = () => undefined;
    h.cancelCampaign.mockImplementation(() => new Promise<void>((resolve) => { resolveCancel = resolve; }));

    render(view());

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar campanha' }));
    expect(screen.getByText('Encerrar campanha?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar' }));
    expect(h.cancelCampaign).toHaveBeenCalledWith('camp-pausada-1');
    // o operador não é jogado para a lista antes de o servidor confirmar
    expect(h.onBack).not.toHaveBeenCalled();

    await act(async () => { resolveCancel(); });
    await waitFor(() => expect(h.onBack).toHaveBeenCalledTimes(1));
  });

  it('encerrar com a chamada estourando: avisa o operador, não navega e mantém o modal', async () => {
    setQueryState({ campaigns: [PAUSED_CAMPAIGN] });
    h.cancelCampaign.mockRejectedValue(new Error('falha de rede T13'));

    render(view());
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar campanha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro ao encerrar a campanha.'));
    expect(h.onBack).not.toHaveBeenCalled();
    expect(screen.getByText('Encerrar campanha?')).toBeTruthy();
  });

  it('consulta com erro: mostra o erro e não o conteúdo', () => {
    setQueryState({ isError: true, error: new Error('falha exclusiva T13') });
    const { container } = render(view());

    expect(screen.getByText(/Não foi possível carregar/)).toBeTruthy();
    expect(screen.queryByText(/Campanha Pausada/)).toBeNull();
    expect(container.querySelector('[data-talkx-query="content"]')).toBeNull();
  });

  it('sem a campanha na lista: mostra o vazio, não o conteúdo', () => {
    setQueryState({ campaigns: [] });
    const { container } = render(view());

    expect(screen.getByText(/Campanha pausada não encontrada/)).toBeTruthy();
    expect(container.querySelector('[data-talkx-query="content"]')).toBeNull();
  });

  it('campanha retomada por fora: avisa o contêiner pai para navegar', async () => {
    setQueryState({ campaigns: [{ ...PAUSED_CAMPAIGN, status: 'sending', paused_at: null }] });
    render(view());

    await waitFor(() => expect(h.onStatusChange).toHaveBeenCalledTimes(1));
    expect(h.onStatusChange.mock.calls[0][0].status).toBe('sending');
  });
});
