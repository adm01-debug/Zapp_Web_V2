import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * X051 — ciclo de vida da tela de execução pelo diálogo único, SEM regressão de UX:
 * toast de sucesso, cancelar volta para a lista, erro em português e um só useTalkX.
 *
 * (Montagem copiada do teste R2-MOD-032.) R2-MOD-032 — Conclusão remota da campanha não limpa seleção e modais em andamento.
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

const { state, toastInfo, ops, toastFns } = vi.hoisted(() => ({
  toastInfo: vi.fn(),
  ops: { pause: vi.fn(), cancel: vi.fn(), start: vi.fn() },
  toastFns: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
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
    pauseCampaign: ops.pause,
    cancelCampaign: ops.cancel,
    startCampaign: ops.start,
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
  toast: { success: toastFns.success, error: toastFns.error, info: toastInfo, warning: toastFns.warning },
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

// O wrapper `useTalkXLifecycle()` chama `useTalkX()` de novo; a tela deve usar o
// `useTalkXLifecycleWith(...)` com as funções que já tem.
const lifecycleWrapper = vi.hoisted(() => vi.fn());
vi.mock('@/components/talkx/useTalkXLifecycle', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/talkx/useTalkXLifecycle')>();
  return {
    ...real,
    useTalkXLifecycle: (...args: unknown[]) => {
      lifecycleWrapper(...args);
      return (real.useTalkXLifecycle as () => unknown)();
    },
  };
});

import { TalkXCampaignRunning } from '@/components/talkx/TalkXCampaignRunning';

// QueryClient ÚNICO: `rerender` precisa reconciliar a MESMA árvore para a transição
// ser um re-render (e não uma nova montagem que zeraria os modais sozinha).
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const onBack = vi.fn();
const view = () => (
  <QueryClientProvider client={queryClient}>
    <TalkXCampaignRunning onBack={onBack} onViewMonitor={() => {}} />
  </QueryClientProvider>
);

const completedCampaign = () => ({ ...CAMPAIGN_SENDING, status: 'completed' });

describe('TalkXCampaignRunning · ciclo de vida pelo diálogo único (X051)', () => {
  beforeEach(() => {
    state.campaignList = [{ ...CAMPAIGN_SENDING }];
    vi.clearAllMocks();
    ops.pause.mockResolvedValue(undefined);
    ops.cancel.mockResolvedValue(undefined);
    ops.start.mockResolvedValue(true);
  });

  const confirmar = (rotulo: RegExp) => {
    const dialogo = screen.getByRole('alertdialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: rotulo }));
  };

  it('a tela usa as funções do PRÓPRIO useTalkX: o wrapper que instancia outro useTalkX (outro canal realtime) não é chamado', () => {
    render(view());
    expect(lifecycleWrapper).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^Pausar$/ })).toBeTruthy();
  });

  it('pausar: leva o motivo, fecha o diálogo e avisa "Campanha pausada."', async () => {
    render(view());
    fireEvent.click(screen.getByRole('button', { name: /^Pausar$/ }));
    fireEvent.change(screen.getByLabelText('Motivo da pausa (opcional)'), { target: { value: 'ajuste' } });
    confirmar(/^Pausar agora$/);
    await waitFor(() => expect(toastInfo).toHaveBeenCalledWith('Campanha pausada.'));
    expect(ops.pause).toHaveBeenCalledWith('c1', 'ajuste');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('cancelar: avisa "Campanha cancelada." e volta para a lista (onBack), como antes', async () => {
    render(view());
    fireEvent.click(screen.getByRole('button', { name: /^Cancelar campanha$/ }));
    confirmar(/^Cancelar$/);
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    expect(ops.cancel).toHaveBeenCalledWith('c1');
    expect(toastFns.warning).toHaveBeenCalledWith('Campanha cancelada.');
  });

  it('retomar: pede confirmação e chama startCampaign (o aviso de sucesso é o do próprio startCampaign)', async () => {
    state.campaignList = [{ ...CAMPAIGN_SENDING, status: 'paused' }];
    render(view());
    fireEvent.click(screen.getByRole('button', { name: /^Retomar$/ }));
    confirmar(/^Retomar$/);
    await waitFor(() => expect(ops.start).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it.each([
    ['pausar', /^Pausar$/, /^Pausar agora$/, 'pause', 'Erro ao pausar a campanha.'],
    ['cancelar', /^Cancelar campanha$/, /^Cancelar$/, 'cancel', 'Erro ao cancelar a campanha.'],
  ] as const)('erro ao %s aparece em português no diálogo (nunca o texto cru da Edge) e não sai da tela', async (_n, botao, confirma, op, esperado) => {
    ops[op].mockRejectedValue(new Error('Edge Function returned a non-2xx status code'));
    render(view());
    fireEvent.click(screen.getByRole('button', { name: botao }));
    confirmar(confirma);
    const alerta = await within(screen.getByRole('alertdialog')).findByRole('alert');
    expect(alerta.textContent).toBe(esperado);
    expect(document.body.textContent).not.toContain('non-2xx');
    expect(onBack).not.toHaveBeenCalled();
    expect(toastInfo).not.toHaveBeenCalledWith('Campanha pausada.');
  });

  it('erro ao retomar (startCampaign devolve false) mostra "Erro ao retomar a campanha." no diálogo', async () => {
    state.campaignList = [{ ...CAMPAIGN_SENDING, status: 'paused' }];
    ops.start.mockResolvedValue(false);
    render(view());
    fireEvent.click(screen.getByRole('button', { name: /^Retomar$/ }));
    confirmar(/^Retomar$/);
    const alerta = await within(screen.getByRole('alertdialog')).findByRole('alert');
    expect(alerta.textContent).toBe('Erro ao retomar a campanha.');
  });
});
