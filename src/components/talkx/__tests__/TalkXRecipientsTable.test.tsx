import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TalkXRecipientsTable, type RecipientsPage } from '../tracking/TalkXRecipientsTable';

const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabaseHelpers', () => ({
  supabase: { rpc: mockRpc },
  fromTable: vi.fn(),
}));

const makeQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const wrap = (ui: React.ReactElement) => {
  const qc = makeQueryClient();
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
};

const row = (i: number, status = 'sent') => ({
  id: `r${i}`,
  campaign_id: 'c1',
  contact_id: `contact-${i}`,
  status,
  sent_at: '2026-10-01T10:00:00.000Z',
  delivered_at: null,
  error_message: null,
  contacts: { name: `Contato ${i}`, phone: `+551199999${i}000` },
});

const page = (over: Partial<RecipientsPage> = {}): RecipientsPage => ({
  rows: [],
  next_cursor: null,
  total: 0,
  kpis: { total: 0, sent: 0, delivered: 0, failed: 0, pending: 0, outcome_unknown: 0 },
  ...over,
});

const ok = (data: RecipientsPage) => Promise.resolve({ data, error: null });

describe('TalkXRecipientsTable', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
    (Element.prototype as unknown as { hasPointerCapture: () => boolean }).hasPointerCapture = () => false;
    (Element.prototype as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => {};
  });

  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('mostra os KPIs devolvidos pelo servidor (nao contados sobre a pagina carregada)', async () => {
    mockRpc.mockReturnValue(ok(page({
      rows: [row(1, 'sent')],
      total: 42,
      kpis: { total: 42, sent: 30, delivered: 21, failed: 7, pending: 5, outcome_unknown: 2 },
    })));

    render(wrap(<TalkXRecipientsTable campaignId="c1" />));

    await waitFor(() => expect(screen.getByText('Enviadas')).toBeInTheDocument());
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('21')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('42 destinatários')).toBeInTheDocument();
  });

  it('acumula as paginas: carregar mais mantem a pagina anterior e usa o cursor no pedido seguinte', async () => {
    mockRpc.mockImplementation((_fn: string, args: { p_cursor: string | null }) =>
      args.p_cursor === null
        ? ok(page({ rows: [row(1), row(2)], next_cursor: 'cursor-2', total: 3 }))
        : ok(page({ rows: [row(3)], next_cursor: null, total: 3 })),
    );

    render(wrap(<TalkXRecipientsTable campaignId="c1" />));

    await waitFor(() => expect(screen.getByText('Contato 1')).toBeInTheDocument());
    expect(screen.getByText('Contato 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /carregar mais/i }));

    await waitFor(() => expect(screen.getByText('Contato 3')).toBeInTheDocument());
    // A primeira pagina nao pode desaparecer ao carregar a segunda.
    expect(screen.getByText('Contato 1')).toBeInTheDocument();
    expect(screen.getByText('Contato 2')).toBeInTheDocument();
    expect(mockRpc).toHaveBeenLastCalledWith(
      'talkx_campaign_recipients_page',
      expect.objectContaining({ p_cursor: 'cursor-2', p_page_size: 50 }),
    );
    expect(screen.queryByRole('button', { name: /carregar mais/i })).not.toBeInTheDocument();
  });

  it('renderiza todos os status do dominio, nao so os cinco antigos', async () => {
    mockRpc.mockReturnValue(ok(page({
      rows: [row(1, 'skipped'), row(2, 'sending'), row(3, 'outcome_unknown')],
      total: 3,
    })));

    render(wrap(<TalkXRecipientsTable campaignId="c1" />));

    await waitFor(() => expect(screen.getByText('Suprimido')).toBeInTheDocument());
    expect(screen.getByText('Enviando')).toBeInTheDocument();
    expect(screen.getByText('Confirmação pendente')).toBeInTheDocument();
  });

  it('nao exibe selo de origem nem de canal', async () => {
    mockRpc.mockReturnValue(ok(page({ rows: [row(1)], total: 1 })));

    render(wrap(<TalkXRecipientsTable campaignId="c1" />));

    await waitFor(() => expect(screen.getByText('Contato 1')).toBeInTheDocument());
    expect(screen.queryByText(/whatsapp|origem|canal/i)).toBeNull();
  });

  it('filtra por status e volta para a primeira pagina', async () => {
    mockRpc.mockReturnValue(ok(page({ rows: [row(1, 'failed')], total: 1 })));

    render(wrap(<TalkXRecipientsTable campaignId="c1" />));
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: /falha/i }));

    await waitFor(() => expect(mockRpc).toHaveBeenLastCalledWith(
      'talkx_campaign_recipients_page',
      expect.objectContaining({ p_campaign_id: 'c1', p_status: 'failed', p_cursor: null }),
    ));
  });

  it('busca por nome ou telefone e volta para a primeira pagina', async () => {
    mockRpc.mockReturnValue(ok(page({ rows: [row(1)], total: 1 })));

    render(wrap(<TalkXRecipientsTable campaignId="c1" />));
    const input = await screen.findByPlaceholderText(/buscar por nome ou telefone/i);
    fireEvent.change(input, { target: { value: 'Contato 1' } });

    await waitFor(() => expect(mockRpc).toHaveBeenLastCalledWith(
      'talkx_campaign_recipients_page',
      expect.objectContaining({ p_search: 'Contato 1', p_cursor: null }),
    ));
  });

  it('mostra estado vazio quando nao ha destinatarios', async () => {
    mockRpc.mockReturnValue(ok(page()));

    render(wrap(<TalkXRecipientsTable campaignId="c1" />));

    await waitFor(() => expect(screen.getByText(/nenhum destinatário nesta campanha/i)).toBeInTheDocument());
  });

  it('mostra erro (nunca vazio) quando a RPC falha', async () => {
    mockRpc.mockReturnValue(Promise.resolve({ data: null, error: { message: 'boom' } }));

    render(wrap(<TalkXRecipientsTable campaignId="c1" />));

    await waitFor(() => expect(screen.getByText(/não foi possível carregar as informações dos destinatários/i)).toBeInTheDocument());
    expect(screen.queryByText(/nenhum destinatário nesta campanha/i)).toBeNull();
  });
});
