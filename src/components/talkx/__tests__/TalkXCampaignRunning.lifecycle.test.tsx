import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/**
 * TL-054/4 (X051) — a tela "Em andamento" (`TalkXCampaignRunning`) resolve
 * pausar / retomar / cancelar pelo controlador ÚNICO de ciclo de vida
 * (`useTalkXLifecycle`): saíram os `AlertDialog` locais e os estados
 * `pauseOpen`, `pauseReason` e `cancelOpen` (o Editar Limites continua local —
 * não é ciclo de vida).
 *
 * O teste renderiza o componente REAL com o hook REAL (só `useTalkX`, a porta
 * das operações, é espiado) e clica como o usuário clica. O que prova a troca é
 * o comportamento que só o diálogo do kit tem:
 *  - o título do kit ("Pausar campanha?" / "Cancelar campanha?"), com o motivo
 *    e o confirmar "Pausar agora" — o diálogo local tinha outro texto;
 *  - o confirmar fica PENDENTE ("Pausando…") e trava os dois botões;
 *  - erro da Edge não vira `toast` nem fecha o diálogo: o alerta fica DENTRO do
 *    diálogo aberto;
 *  - retomar passou a pedir confirmação ("Retomar campanha?") — antes o botão
 *    disparava `startCampaign` direto;
 *  - o cancelar confirma com "Cancelar" / "Voltar" (antes "Confirmar
 *    cancelamento") e, confirmado, a tela volta para a lista (`onBack`), como
 *    fazia o `handleCancel` antigo.
 */

const h = vi.hoisted(() => ({
  status: 'sending' as string,
  startCampaign: vi.fn(),
  pauseCampaign: vi.fn(),
  cancelCampaign: vi.fn(),
  updateCampaign: { mutateAsync: vi.fn() },
  toastError: vi.fn(),
}));

const onBack = vi.fn();

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: [
      {
        id: 'c1',
        name: 'Campanha Em Andamento X051',
        message_template: 'mensagem de teste',
        variables_config: [],
        typing_delay_min: 1500,
        typing_delay_max: 4000,
        send_interval_min: 8000,
        send_interval_max: 20000,
        status: h.status,
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
      },
    ],
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetchCampaigns: vi.fn(),
    updateCampaign: h.updateCampaign,
    updateCampaignLimits: { mutateAsync: vi.fn() },
    startCampaign: h.startCampaign,
    pauseCampaign: h.pauseCampaign,
    cancelCampaign: h.cancelCampaign,
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
  toast: { success: vi.fn(), error: h.toastError, info: vi.fn(), warning: vi.fn() },
}));

// Cadeia thenable genérica para `fromTable` (a tela só lê listas via
// .select().eq().order().limit()/.not(), todas terminando em `await`).
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

import { TalkXCampaignRunning } from '../TalkXCampaignRunning';

function renderTela(status: string) {
  h.status = status;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TalkXCampaignRunning onBack={onBack} onViewMonitor={vi.fn()} />
    </QueryClientProvider>,
  );
}

/** Abre a tela com a campanha carregada (o nome aparece no seletor). */
function abrirTela(status: string) {
  renderTela(status);
  expect(screen.getByLabelText('Selecionar campanha')).toBeTruthy();
}

const clicar = (nome: string | RegExp) =>
  fireEvent.click(screen.getByRole('button', { name: nome }));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Em andamento — ciclo de vida pelo controlador único (X051)', () => {
  it('pausar: diálogo do kit, motivo digitado em pauseCampaign e confirmar pendente travando os botões', async () => {
    let liberar: (v: unknown) => void = () => {};
    h.pauseCampaign.mockImplementation(
      () => new Promise((resolve) => { liberar = resolve; }),
    );
    abrirTela('sending');

    clicar('Pausar');
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo.textContent).toContain('Pausar campanha?');
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);

    fireEvent.change(within(dialogo).getByPlaceholderText('Motivo da pausa (opcional)'), {
      target: { value: 'pausa de ensaio X051' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Pausar agora' }));

    await waitFor(() => expect(h.pauseCampaign).toHaveBeenCalledWith('c1', 'pausa de ensaio X051'));
    const pendente = await within(dialogo).findByRole('button', { name: /Pausando/ });
    expect(pendente).toHaveProperty('disabled', true);
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toHaveProperty('disabled', true);

    liberar({ data: null, error: null });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('pausar com erro da Edge: o alerta fica DENTRO do diálogo aberto e não vira toast', async () => {
    h.pauseCampaign.mockRejectedValue(new Error('Edge talkx-send recusou a pausa'));
    abrirTela('sending');

    clicar('Pausar');
    const dialogo = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Pausar agora' }));

    await waitFor(() =>
      expect(within(dialogo).getByRole('alert').textContent).toContain('Edge talkx-send recusou a pausa'),
    );
    expect(screen.getByRole('alertdialog')).toBe(dialogo);
    expect(h.toastError).not.toHaveBeenCalled();
    expect(h.pauseCampaign).toHaveBeenCalledWith('c1', undefined);
  });

  it('retomar: agora pede confirmação e a recusa da Edge (false) aparece como erro no diálogo aberto', async () => {
    h.startCampaign.mockResolvedValue(false);
    abrirTela('paused');

    clicar('Retomar');
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo.textContent).toContain('Retomar campanha?');

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Retomar' }));

    await waitFor(() => expect(h.startCampaign).toHaveBeenCalledWith('c1'));
    await waitFor(() =>
      expect(within(dialogo).getByRole('alert').textContent).toContain('O envio não foi aceito'),
    );
    expect(screen.getByRole('alertdialog')).toBe(dialogo);
  });

  it('cancelar: confirma com "Cancelar" / "Voltar" e, confirmado, volta para a lista (onBack)', async () => {
    h.cancelCampaign.mockResolvedValue(undefined);
    abrirTela('sending');

    clicar('Cancelar campanha');
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo.textContent).toContain('Cancelar campanha?');
    expect(within(dialogo).queryByRole('button', { name: 'Confirmar cancelamento' })).toBeNull();
    expect(within(dialogo).getByRole('button', { name: 'Voltar' })).toBeTruthy();

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(h.cancelCampaign).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('a saída "Voltar" fecha o diálogo sem disparar ação nenhuma e sem voltar de tela', async () => {
    abrirTela('sending');

    clicar('Cancelar campanha');
    const dialogo = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Voltar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(h.cancelCampaign).not.toHaveBeenCalled();
    expect(h.pauseCampaign).not.toHaveBeenCalled();
    expect(h.startCampaign).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });
});
