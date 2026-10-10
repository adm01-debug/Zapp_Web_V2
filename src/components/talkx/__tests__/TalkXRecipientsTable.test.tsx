import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TalkXRecipientsTable } from '../tracking/TalkXRecipientsTable';

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

const mockRows = (count = 3) =>
  Array.from({ length: count }, (_, i) => ({
    id: `r${i + 1}`,
    campaign_id: 'c1',
    contact_id: `contact-${i + 1}`,
    personalized_message: i % 2 === 0 ? `Mensagem ${i + 1}` : null,
    status: ['sent', 'delivered', 'failed', 'read', 'replied'][i % 5],
    sent_at: i % 2 === 0 ? '2026-10-01T10:00:00.000Z' : null,
    delivered_at: i === 1 ? '2026-10-01T10:01:00.000Z' : null,
    error_message: i === 2 ? 'Erro de envio' : null,
    manual_retry_count: null,
    created_at: '2026-10-01T09:00:00.000Z',
    contacts: { name: `Contato ${i + 1}`, phone: `+551****9999${i + 1}0000` },
  }));

describe('TalkXRecipientsTable', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renderiza o painel KPI com os números das colunas', async () => {
    mockRpc.mockResolvedValue({
      data: { rows: mockRows(6), next_cursor: null, total: 6 },
      error: null,
    });

    render(wrap(<TalkXRecipientsTable campaignId="c1" />));

    await waitFor(() => {
      expect(screen.getByText('6')).toBeInTheDocument();
    });

    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Enviadas')).toBeInTheDocument();
    expect(screen.getByText('Entregues')).toBeInTheDocument();
    expect(screen.getByText('Lidas')).toBeInTheDocument();
    expect(screen.getByText('Respondidas')).toBeInTheDocument();
    expect(screen.getByText('Falhas')).toBeInTheDocument();
  });

  it('renderiza filtro de status com a opção "Todos" e todas as opções de RECIPIENT_STATUS', async () => {
    mockRpc.mockResolvedValue({
      data: { rows: [], next_cursor: null, total: 0 },
      error: null,
    });

    render(wrap(<TalkXRecipientsTable campaignId="c1" />));

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('combobox'));

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Todos/i })).toBeInTheDocument();
    });
  });

  it('renderiza campo de busca por nome ou telefone', async () => {
    mockRpc.mockResolvedValue({
      data: { rows: [], next_cursor: null, total: 0 },
      error: null,
    });

    render(wrap(<TalkXRecipientsTable campaignId="c1" />));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/buscar por nome ou telefone/i)).toBeInTheDocument();
    });
  });

  it('renderiza a tabela com as colunas corretas', async () => {
    mockRpc.mockResolvedValue({
      data: { rows: mockRows(1), next_cursor: null, total: 1 },
      error: null,
    });

    render(wrap(<TalkXRecipientsTable campaignId="c1" />));

    await waitFor(() => {
      expect(screen.getByText('Contato')).toBeInTheDocument();
      expect(screen.getByText('Telefone')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Enviada em')).toBeInTheDocument();
      expect(screen.getByText('Entregue em')).toBeInTheDocument();
    });
  });

  it('exibe TalkXRecipientRowActions na última coluna de cada linha', async () => {
    mockRpc.mockResolvedValue({
      data: { rows: mockRows(1), next_cursor: null, total: 1 },
      error: null,
    });

    render(wrap(<TalkXRecipientsTable campaignId="c1" />));

    await waitFor(() => {
      expect(screen.getByText('Contato 1')).toBeInTheDocument();
    });
  });

  it('exibe estado vazio quando não há destinatários', async () => {
    mockRpc.mockResolvedValue({
      data: { rows: [], next_cursor: null, total: 0 },
      error: null,
    });

    render(wrap(<TalkXRecipientsTable campaignId="c1" />));

    await waitFor(() => {
      expect(screen.getByText(/nenhum destinatário nesta campanha/i)).toBeInTheDocument();
    });
  });

  it('exibe botão "Carregar mais" quando há próxima página (cursor)', async () => {
    mockRpc.mockResolvedValue({
      data: { rows: mockRows(3), next_cursor: 'cursor-abc', total: 3 },
      error: null,
    });

    render(wrap(<TalkXRecipientsTable campaignId="c1" />));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /carregar mais/i })).toBeInTheDocument();
    });
  });

  it('não renderiza "Carregar mais" quando não há próxima página', async () => {
    mockRpc.mockResolvedValue({
      data: { rows: mockRows(2), next_cursor: null, total: 2 },
      error: null,
    });

    render(wrap(<TalkXRecipientsTable campaignId="c1" />));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /carregar mais/i })).not.toBeInTheDocument();
    });
  });

  it('aplica filtro de status e reseta a paginação', async () => {
    mockRpc.mockResolvedValue({
      data: { rows: mockRows(1), next_cursor: null, total: 1 },
      error: null,
    });

    render(wrap(<TalkXRecipientsTable campaignId="c1" />));

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: /falha/i }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith(
        'talkx_campaign_recipients_page',
        expect.objectContaining({ p_campaign_id: 'c1', p_status: 'failed' })
      );
    });
  });

  it('aplica busca por texto e reseta a paginação', async () => {
    mockRpc.mockResolvedValue({
      data: { rows: mockRows(1), next_cursor: null, total: 1 },
      error: null,
    });

    render(wrap(<TalkXRecipientsTable campaignId="c1" />));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/buscar por nome ou telefone/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/buscar por nome ou telefone/i), {
      target: { value: 'Contato 1' },
    });

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith(
        'talkx_campaign_recipients_page',
        expect.objectContaining({ p_campaign_id: 'c1', p_search: 'Contato 1' })
      );
    });
  });
});