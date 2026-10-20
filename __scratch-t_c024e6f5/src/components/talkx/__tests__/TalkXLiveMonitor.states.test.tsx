import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * X047c — matriz de estados, linha da tela Monitor (TalkXLiveMonitor).
 *
 * A regra da etapa: consulta que falhou mostra o ERRO, nunca o vazio. Antes, o Monitor
 * decidia à mão (`if (!campaign) return <esqueleto/>`): com a consulta da campanha em
 * erro, `campaign` não existia e a tela ficava em esqueleto para sempre — sem dizer que
 * falhou e sem botão para tentar de novo.
 *
 * Casos que este teste protege:
 * 1. erro na consulta principal → "Não foi possível carregar" e NUNCA o vazio;
 * 2. "Tentar novamente" refaz a consulta que falhou mantendo a campanha aberta (mesmo id,
 *    sem voltar para a lista);
 * 3. durante a carga existe elemento com `aria-busy`;
 * 4. cada bloco assíncrono tem o próprio estado e o próprio retry: destinatários (consulta
 *    real do componente), ritmo de entrega e linha do tempo.
 */

const h = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; id: string | null }>,
  campaignError: null as Error | null,
  campaignPending: false,
  recipientsError: null as Error | null,
  recipientsPending: false,
  rateError: null as Error | null,
  eventsError: null as Error | null,
  refetchRate: vi.fn(),
  refetchEvents: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const CAMPAIGN = {
    id: 'camp-1',
    name: 'Campanha X047',
    status: 'sending',
    message_template: 'mensagem de teste',
    total_recipients: 10,
    sent_count: 3,
    delivered_count: 2,
    failed_count: 1,
    outcome_unknown_count: 0,
    started_at: null,
    completed_at: null,
    whatsapp_connection_id: null,
    created_at: '2026-10-05T10:00:00.000Z',
  };

  const resolveChain = (table: string, id: string | null) => {
    h.calls.push({ table, id });
    if (table === 'talkx_campaigns') {
      if (h.campaignPending) return new Promise(() => {});
      if (h.campaignError) return Promise.resolve({ data: null, error: h.campaignError });
      return Promise.resolve({ data: CAMPAIGN, error: null });
    }
    if (h.recipientsPending) return new Promise(() => {});
    if (h.recipientsError) return Promise.resolve({ data: null, error: h.recipientsError });
    return Promise.resolve({ data: [], error: null });
  };

  const makeChain = (table: string) => {
    let id: string | null = null;
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (col: string, value: unknown) => { if (col === 'id') id = String(value); return chain; };
    chain.order = () => chain;
    chain.limit = () => resolveChain(table, id);
    chain.single = () => resolveChain(table, id);
    return chain;
  };

  return {
    supabase: {
      from: (table: string) => makeChain(table),
      channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
      removeChannel: () => {},
    },
  };
});

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({ startCampaign: vi.fn(), pauseCampaign: vi.fn(), cancelCampaign: vi.fn() }),
}));

vi.mock('@/hooks/integrations/useTalkXEvents', () => ({
  useTalkXEvents: () => ({
    events: [],
    isLoading: false,
    isError: h.eventsError !== null,
    error: h.eventsError,
    refetch: h.refetchEvents,
    logEvent: vi.fn(),
  }),
}));

vi.mock('@/hooks/integrations/useTalkXConnectionStatus', () => ({
  useTalkXConnectionStatus: () => ({ status: null, label: null, loading: false }),
}));

vi.mock('@/hooks/integrations/useTalkXMonitor', () => ({
  useTalkXMonitor: () => ({
    rateByMinute: [],
    isLoading: false,
    isError: h.rateError !== null,
    refetch: h.refetchRate,
  }),
}));

import { TalkXLiveMonitor } from '../TalkXLiveMonitor';

const campaignCalls = () => h.calls.filter((c) => c.table === 'talkx_campaigns');
const recipientCalls = () => h.calls.filter((c) => c.table === 'talkx_recipients');
const sectionOf = (text: RegExp) => screen.getByText(text).closest('section') as HTMLElement;

function renderMonitor() {
  const onBack = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <TalkXLiveMonitor campaignId="camp-1" onBack={onBack} />
    </QueryClientProvider>,
  );
  return { ...utils, onBack };
}

const ERROR_TEXT = /Não foi possível carregar/;

beforeEach(() => {
  h.calls = [];
  h.campaignError = null;
  h.campaignPending = false;
  h.recipientsError = null;
  h.recipientsPending = false;
  h.rateError = null;
  h.eventsError = null;
  h.refetchRate = vi.fn();
  h.refetchEvents = vi.fn();
});

describe('matriz de estados — TalkXLiveMonitor (X047c)', () => {
  it('erro na consulta principal: mostra o erro e NUNCA o vazio', async () => {
    h.campaignError = new Error('falha exclusiva X047c');
    const { container } = renderMonitor();

    await waitFor(() => expect(screen.getByText(ERROR_TEXT)).toBeTruthy());
    expect(container.querySelector('[data-talkx-query="empty"]')).toBeNull();
    expect(container.querySelector('[data-talkx-query="loading"]')).toBeNull();
    expect(screen.queryByText('Campanha não encontrada')).toBeNull();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('Tentar novamente refaz a consulta da campanha aberta, sem trocar a campanha', async () => {
    h.campaignError = new Error('falha exclusiva X047c');
    const { onBack } = renderMonitor();

    await waitFor(() => expect(screen.getByText(ERROR_TEXT)).toBeTruthy());
    const before = campaignCalls().length;

    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }));

    await waitFor(() => expect(campaignCalls().length).toBeGreaterThan(before));
    expect(campaignCalls().every((c) => c.id === 'camp-1')).toBe(true);
    expect(onBack).not.toHaveBeenCalled();
    // a consulta refeita é a mesma que falhou: enquanto ela falhar, o erro continua na tela
    expect(screen.getByText(ERROR_TEXT)).toBeTruthy();
  });

  it('durante a carga: esqueleto com aria-busy, sem erro e sem vazio', async () => {
    h.campaignPending = true;
    const { container } = renderMonitor();

    await waitFor(() => expect(container.querySelector('[data-talkx-query="loading"]')).toBeTruthy());
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(container.querySelector('[data-talkx-query="empty"]')).toBeNull();
    expect(screen.queryByText(ERROR_TEXT)).toBeNull();
    expect(screen.queryByText('Campanha não encontrada')).toBeNull();
  });

  it('destinatários com erro: o erro é do bloco e o retry refaz SÓ a consulta de destinatários', async () => {
    h.recipientsError = new Error('falha exclusiva X047c destinatarios');
    const { container } = renderMonitor();

    await waitFor(() => expect(screen.getByText('Campanha X047')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Destinatários/ }));

    const section = container.querySelector('section') as HTMLElement;
    await waitFor(() => expect(within(section).getByText(ERROR_TEXT)).toBeTruthy());
    expect(within(section).queryByText('Nenhum destinatário encontrado')).toBeNull();

    const campaignBefore = campaignCalls().length;
    const recipientsBefore = recipientCalls().length;
    fireEvent.click(within(section).getByRole('button', { name: /Tentar novamente/ }));

    await waitFor(() => expect(recipientCalls().length).toBeGreaterThan(recipientsBefore));
    expect(campaignCalls().length).toBe(campaignBefore);
    expect(screen.getByText('Campanha X047')).toBeTruthy();
  });

  it('carregando destinatários: esqueleto com aria-busy no bloco, com a campanha ainda aberta', async () => {
    h.recipientsPending = true;
    const { container } = renderMonitor();

    await waitFor(() => expect(screen.getByText('Campanha X047')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Destinatários/ }));

    const section = container.querySelector('section') as HTMLElement;
    await waitFor(() => expect(section.querySelector('[aria-busy="true"]')).toBeTruthy());
    expect(within(section).queryByText('Nenhum destinatário encontrado')).toBeNull();
    expect(within(section).queryByText(ERROR_TEXT)).toBeNull();
    expect(screen.getByText('Campanha X047')).toBeTruthy();
  });

  it('ritmo de entrega com erro: erro no bloco, retry do bloco e sem o texto de vazio', async () => {
    h.rateError = new Error('falha exclusiva X047c ritmo');
    renderMonitor();

    await waitFor(() => expect(screen.getByText('Campanha X047')).toBeTruthy());
    const section = sectionOf(/Ritmo de Entrega/);
    await waitFor(() => expect(within(section).getByText(ERROR_TEXT)).toBeTruthy());
    expect(within(section).queryByText(/Sem envios nos últimos 60 minutos/)).toBeNull();

    fireEvent.click(within(section).getByRole('button', { name: /Tentar novamente/ }));
    expect(h.refetchRate).toHaveBeenCalled();
  });

  it('linha do tempo com erro: erro no bloco, retry do bloco e sem "nenhum evento"', async () => {
    h.eventsError = new Error('falha exclusiva X047c linha do tempo');
    renderMonitor();

    await waitFor(() => expect(screen.getByText('Campanha X047')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Linha do Tempo/ }));

    const section = sectionOf(/Linha do Tempo Operacional/);
    await waitFor(() => expect(within(section).getByText(ERROR_TEXT)).toBeTruthy());
    expect(screen.queryByText('Nenhum evento registrado ainda.')).toBeNull();

    fireEvent.click(within(section).getByRole('button', { name: /Tentar novamente/ }));
    expect(h.refetchEvents).toHaveBeenCalled();
  });
});
