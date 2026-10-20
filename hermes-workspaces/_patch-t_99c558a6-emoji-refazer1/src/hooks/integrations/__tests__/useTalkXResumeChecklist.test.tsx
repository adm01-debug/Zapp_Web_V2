/**
 * TL-162 (X159) — defeitos de lógica do "Checklist para retomar" (refazer 1).
 *
 * Prova, pelo hook REAL (só o Supabase é mock), os cinco pontos da recusa:
 *  1. campanha pausada JÁ INICIADA não vira falso "Agendamento vencido";
 *  2. dois toggles rápidos preservam as duas marcações no payload persistido;
 *  4. fora da pausa (`status: 'sending'`) não há leitura, RPC nem evento;
 *  5. falha ao salvar avisa o operador com toast.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const state = {
    rows: {} as Record<string, { data?: unknown; count?: number | null; error?: unknown }>,
    fromTableCalls: [] as string[],
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    rpcResults: {} as Record<string, { data?: unknown; error?: unknown }>,
  };
  const chainFor = (table: string): Record<string, unknown> => {
    const q: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'gte', 'not', 'order', 'limit', 'single', 'maybeSingle']) {
      q[method] = () => q;
    }
    q.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(state.rows[table] ?? { data: null, count: null, error: null }).then(onFulfilled, onRejected);
    return q;
  };
  return { state, chainFor };
});

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: (table: string) => {
    h.state.fromTableCalls.push(table);
    return h.chainFor(table);
  },
  supabase: {
    from: (table: string) => h.chainFor(table),
    rpc: (name: string, args: Record<string, unknown>) => {
      h.state.rpcCalls.push({ name, args });
      return Promise.resolve(h.state.rpcResults[name] ?? { data: null, error: null });
    },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { toast } from 'sonner';
import {
  useTalkXResumeChecklist,
  type TalkXResumeChecklistCampaign,
  type TalkXResumeChecklistItemKey,
} from '@/hooks/integrations/useTalkXResumeChecklist';
import { TalkXResumeChecklist } from '@/components/talkx/tracking/TalkXResumeChecklist';

const PAST = '2026-10-08T00:00:00.000Z';
const STARTED = '2026-10-09T01:00:00.000Z';

const CAMPAIGN: TalkXResumeChecklistCampaign = {
  id: 'camp-1',
  status: 'paused',
  template_id: 'tpl-1',
  whatsapp_connection_id: 'conn-1',
  scheduled_at: null,
  started_at: null,
  paused_at: STARTED,
};

function precheckRows(): void {
  h.state.rows = {
    talkx_campaign_segments: { data: [{ status: 'pending' }, { status: 'pending' }], error: null },
    talkx_templates: { data: { status: 'approved' }, error: null },
    whatsapp_connections: { data: { status: 'connected' }, error: null },
    talkx_settings: { data: { value: '"Pare para sair"' }, error: null },
    talkx_optout_keywords: { data: null, count: 3, error: null },
    talkx_campaign_events: { data: [], error: null },
  };
  h.state.rpcResults = { talkx_engine_window_open: { data: true, error: null } };
}

function renderWith(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return { queryClient, ...result };
}

function ChecklistHarness({ campaign }: { campaign: TalkXResumeChecklistCampaign }) {
  const { items, toggle } = useTalkXResumeChecklist(campaign);
  return <TalkXResumeChecklist items={items} onToggle={toggle} />;
}

function ToggleHarness({ campaign }: { campaign: TalkXResumeChecklistCampaign }) {
  const { items, toggle } = useTalkXResumeChecklist(campaign);
  return (
    <div>
      {items.map((item) => (
        <button key={item.key} data-testid={`toggle-${item.key}`} onClick={() => toggle(item.key, true)}>
          {item.key}
        </button>
      ))}
    </div>
  );
}

function savedPayloads(): Array<{ key: TalkXResumeChecklistItemKey; checked: boolean }[]> {
  return h.state.rpcCalls
    .filter((call) => call.name === 'log_talkx_campaign_checklist')
    .map((call) => call.args.p_items as { key: TalkXResumeChecklistItemKey; checked: boolean }[]);
}

beforeEach(() => {
  h.state.rows = {};
  h.state.fromTableCalls = [];
  h.state.rpcCalls = [];
  h.state.rpcResults = {};
  vi.mocked(toast.error).mockClear();
});

describe('useTalkXResumeChecklist — refazer 1 (TL-162)', () => {
  it('campanha pausada já iniciada mostra "Sem agendamento — envio único", não "Agendamento vencido"', async () => {
    precheckRows();
    // `scheduled_at` no passado + `started_at` preenchido: o horário agendado já
    // disparou, então o item não pode acusar atraso.
    const campanha: TalkXResumeChecklistCampaign = { ...CAMPAIGN, scheduled_at: PAST, started_at: STARTED };
    renderWith(<ChecklistHarness campaign={campanha} />);

    await waitFor(() => expect(screen.getByText('2 segmentos pendentes')).toBeInTheDocument());

    const agendamentos = screen.getByText('Validar agendamentos').closest('li') as HTMLElement;
    expect(within(agendamentos).getByText('Sem agendamento — envio único')).toBeInTheDocument();
    expect(within(agendamentos).queryByText('Agendamento vencido')).toBeNull();
  });

  it('campanha pausada que NÃO iniciou ainda respeita o agendamento futuro', async () => {
    precheckRows();
    const futuro = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
    const campanha: TalkXResumeChecklistCampaign = { ...CAMPAIGN, scheduled_at: futuro, started_at: null };
    renderWith(<ChecklistHarness campaign={campanha} />);

    await waitFor(() => expect(screen.getByText('2 segmentos pendentes')).toBeInTheDocument());

    const agendamentos = screen.getByText('Validar agendamentos').closest('li') as HTMLElement;
    expect(within(agendamentos).getByText(/^Próximo envio em /)).toBeInTheDocument();
    expect(within(agendamentos).queryByText('Agendamento vencido')).toBeNull();
  });

  it('dois toggles rápidos antes do refetch preservam as duas marcações no payload', async () => {
    precheckRows();
    renderWith(<ToggleHarness campaign={CAMPAIGN} />);

    await waitFor(() => expect(h.state.fromTableCalls).toContain('talkx_campaign_segments'));

    fireEvent.click(screen.getByTestId('toggle-segments'));
    fireEvent.click(screen.getByTestId('toggle-autoresponse'));

    await waitFor(() => expect(savedPayloads().length).toBeGreaterThanOrEqual(2));

    const payloads = savedPayloads();
    expect(payloads[payloads.length - 1]).toEqual([
      { key: 'segments', checked: true },
      { key: 'templates', checked: false },
      { key: 'limits', checked: false },
      { key: 'schedule', checked: false },
      { key: 'autoresponse', checked: true },
    ]);
  });

  it('campanha fora da pausa não dispara leitura, RPC nem evento', async () => {
    precheckRows();
    renderWith(<ToggleHarness campaign={{ ...CAMPAIGN, status: 'sending' }} />);

    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(h.state.fromTableCalls).toEqual([]);
    expect(h.state.rpcCalls).toEqual([]);
  });

  it('falha ao salvar avisa o operador com toast de erro', async () => {
    precheckRows();
    h.state.rpcResults.log_talkx_campaign_checklist = { data: null, error: { message: 'gravação recusada' } };
    renderWith(<ToggleHarness campaign={CAMPAIGN} />);

    await waitFor(() => expect(h.state.fromTableCalls).toContain('talkx_campaign_segments'));
    fireEvent.click(screen.getByTestId('toggle-segments'));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it('mudar o agendamento refaz o precheck (a queryKey carrega scheduled_at)', async () => {
    precheckRows();
    const segmentos = () => h.state.fromTableCalls.filter((table) => table === 'talkx_campaign_segments').length;
    const { queryClient, rerender } = renderWith(<ChecklistHarness campaign={CAMPAIGN} />);

    await waitFor(() => expect(segmentos()).toBe(1));

    rerender(
      <QueryClientProvider client={queryClient}>
        <ChecklistHarness campaign={{ ...CAMPAIGN, scheduled_at: new Date(Date.now() + 3_600_000).toISOString() }} />
      </QueryClientProvider>,
    );

    // Com a chave antiga o precheck voltava do cache; agora é uma leitura nova.
    await waitFor(() => expect(segmentos()).toBe(2));
  });
});
