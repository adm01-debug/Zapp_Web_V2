/**
 * X150 — tela 12 (`TalkXLiveMonitor`) na tabela ÚNICA de destinatários.
 *
 * Prova o que o cartão pede para a tela 12: o card "Entregas em Tempo Real" na
 * Visão Geral com o selo "Enviando agora" enquanto a campanha está enviando, e a
 * mesma tabela da tela 11 na aba Destinatários — com as colunas da tela 12
 * (Destinatário, Segmento, Status, tiques, Horário, Mensagem e menu), busca,
 * filtro e "Carregar mais" com contagem total. Antes esta tela tinha uma lista de
 * cartões sem telefone, sem busca, sem filtro e sem contagem, com um select de
 * status que recortava a consulta no banco.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

const HORA = '2026-10-08T12:05:00.000Z';

function destinatario(i: number) {
  return {
    id: `r${i}`,
    status: i === 1 ? 'delivered' : i === 2 ? 'pending' : 'sent',
    sent_at: i === 2 ? null : HORA,
    delivered_at: i === 1 ? HORA : null,
    read_at: i === 1 ? HORA : null,
    replied_at: null,
    updated_at: HORA,
    personalized_message: `Mensagem do destinatário ${i}`,
    error_message: null,
    segment_id: 'seg-1',
    segments: { name: `Segmento ${i % 2 === 0 ? 'B' : 'A'}` },
    contacts: { name: `Contato ${i}`, nickname: null, phone: `+551197777000${i % 10}`, company: 'Loja', avatar_url: null, lead_origin: 'Singu' },
  };
}

const h = vi.hoisted(() => ({
  status: 'sending' as string,
  recipients: [] as unknown[],
  eqs: [] as [string, unknown][],
}));

vi.mock('@/integrations/supabase/client', () => {
  const CAMPAIGN = () => ({
    id: 'camp-1', name: 'Campanha X150', status: h.status, message_template: 'mensagem de teste',
    total_recipients: 25, sent_count: 3, delivered_count: 2, failed_count: 1, outcome_unknown_count: 0,
    started_at: null, completed_at: null, whatsapp_connection_id: null, created_at: '2026-10-08T10:00:00.000Z',
  });

  const resolveChain = (table: string) => {
    if (table === 'talkx_campaigns') return Promise.resolve({ data: CAMPAIGN(), error: null });
    return Promise.resolve({ data: h.recipients, error: null });
  };

  const makeChain = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (column: string, value: unknown) => {
      if (table === 'talkx_recipients') h.eqs.push([column, value]);
      return chain;
    };
    chain.order = () => chain;
    chain.limit = () => resolveChain(table);
    chain.single = () => resolveChain(table);
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
  useTalkXEvents: () => ({ events: [], isLoading: false, isError: false, error: null, refetch: vi.fn(), logEvent: vi.fn() }),
}));
vi.mock('@/hooks/integrations/useTalkXConnectionStatus', () => ({ useTalkXConnectionStatus: () => ({ status: null, label: null, loading: false }) }));
vi.mock('@/hooks/integrations/useTalkXMonitor', () => ({
  useTalkXMonitor: () => ({ rateByMinute: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));

import { TalkXLiveMonitor } from '@/components/talkx/TalkXLiveMonitor';

function renderMonitor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TalkXLiveMonitor campaignId="camp-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.status = 'sending';
  h.recipients = Array.from({ length: 25 }, (_, i) => destinatario(i + 1));
  h.eqs = [];
});

describe('X150 — Deliveries em Tempo Real na tabela unificada (tela 12)', () => {
  it('a Visão Geral traz o card "Entregas em Tempo Real" com o selo enquanto envia', async () => {
    renderMonitor();

    await waitFor(() => expect(screen.getByText('Campanha X150')).toBeTruthy());
    expect(screen.getByText('Entregas em Tempo Real')).toBeTruthy();
    expect(screen.getByText('Enviando agora')).toBeTruthy();

    // A tabela do card é a MESMA (colunas da tela 12: tiques e mensagem).
    for (const header of ['Contato', 'Segmento', 'Status', 'Tiques', 'Horário', 'Mensagem']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeTruthy();
    }
    expect(screen.getByText('Contato 1')).toBeTruthy();
    expect(screen.getAllByText('Segmento A').length).toBeGreaterThan(0);
    expect(screen.getByText('Mostrando 5 de 25 destinatários')).toBeTruthy();
  });

  it('campanha pausada: o card continua e o selo "Enviando agora" some', async () => {
    h.status = 'paused';
    renderMonitor();

    await waitFor(() => expect(screen.getByText('Campanha X150')).toBeTruthy());
    expect(screen.getByText('Entregas em Tempo Real')).toBeTruthy();
    expect(screen.queryByText('Enviando agora')).toBeNull();
  });


  it('filtrar um estado real recorta a consulta no banco e entra na queryKey', async () => {
    h.recipients = [
      { ...destinatario(1), status: 'failed', read_at: null, delivered_at: null },
      { ...destinatario(2), status: 'sent' },
    ];
    renderMonitor();
    await waitFor(() => expect(screen.getByText('Campanha X150')).toBeTruthy());

    const trigger = screen.getByRole('combobox', { name: 'Filtrar por estado' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: 'Falha' }));

    await waitFor(() => expect(h.eqs).toContainEqual(['status', 'failed']));
  });

  it('avisa o corte de leitura nas duas instâncias quando a consulta chega ao teto de 200 linhas', async () => {
    h.recipients = Array.from({ length: 200 }, (_, i) => destinatario(i + 1));
    renderMonitor();
    await waitFor(() => expect(screen.getByText('Campanha X150')).toBeTruthy());

    const aviso = 'Mostrando os 200 destinatários mais recentes. Pode haver mais registros; use o filtro de status para recortar a consulta.';
    expect(screen.getByText(aviso)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Destinatários' }));
    expect(screen.getByText(aviso)).toBeTruthy();
  });

  it('a aba Destinatários usa a tabela unificada: busca, estados do kit e "Carregar mais"', async () => {
    renderMonitor();
    await waitFor(() => expect(screen.getByText('Campanha X150')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Destinatários' }));
    const secao = screen.getByPlaceholderText('Buscar destinatário…').closest('section') as HTMLElement;

    // Lote de 20 com contagem total (a leitura atual é a de cada tela, 200 linhas).
    expect(within(secao).getByText('Mostrando 20 de 25 destinatários')).toBeTruthy();
    fireEvent.click(within(secao).getByRole('button', { name: 'Carregar mais' }));
    expect(within(secao).getByText('Mostrando 25 de 25 destinatários')).toBeTruthy();

    // Estado derivado do tique de leitura continua valendo aqui.
    expect(within(secao).getByText('Lida')).toBeTruthy();

    // Busca com espera de 300 ms, dentro da própria tabela.
    fireEvent.change(within(secao).getByPlaceholderText('Buscar destinatário…'), { target: { value: 'Contato 21' } });
    await waitFor(() => expect(within(secao).queryByText('Contato 1')).toBeNull());
    expect(within(secao).getByText('Contato 21')).toBeTruthy();
    expect(within(secao).getByText('Mostrando 1 de 1 destinatários')).toBeTruthy();
  });
});
