/**
 * HZ1-06 — tela "Insights de Busca" (admin/supervisor).
 *
 * O que esta prova cobre:
 *  - os KPIs vêm da RPC `search_insights` (janela de 30 dias por padrão) e a
 *    taxa exibida é computada (searches_with_click / total_searches → 42,0%),
 *    inclusive a parcela de buscas sem resultado, calculada sobre o total;
 *  - as duas tabelas de termos aparecem vazias (search_events não persiste texto);
 *  - a tela não oferece NENHUMA forma de exportar/baixar/imprimir (informação não sai);
 *  - o erro da RPC (a RPC nega não-admin/não-supervisor com 42501) aparece em
 *    `role=alert` com opção de tentar de novo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpcMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

import { SearchInsightsView } from '@/components/admin/SearchInsightsView';

const PAYLOAD = [
  {
    total_searches: 1234,
    searches_without_results: 308,
    searches_with_click: 518,
    average_term_length: 8.3,
    searches_by_kind: {},
  },
];

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SearchInsightsView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rpcMock.mockReset();
});

describe('SearchInsightsView — números da busca global (HZ1-06)', () => {
  it('mostra os KPIs a partir da RPC, na janela de 30 dias', async () => {
    rpcMock.mockResolvedValue({ data: PAYLOAD, error: null });
    renderView();

    expect(await screen.findByText('1.234')).toBeInTheDocument();
    expect(screen.getByText('42,0%')).toBeInTheDocument();          // taxa de clique (518/1234)
    expect(screen.getByText('25,0%')).toBeInTheDocument();          // 308/1234 sem resultado
    expect(screen.getByText('518 clique(s)')).toBeInTheDocument();

    expect(rpcMock).toHaveBeenCalledWith('search_insights', { p_days: 30 });
    // Mesmo com 308 buscas sem resultado, termos não são exibidos — privacidade por design.
    expect(screen.getAllByText('Textos de busca não são armazenados — privacidade por design.')).toHaveLength(2);
  });

  it('não oferece exportar, baixar, imprimir nem copiar (a informação não sai do sistema)', async () => {
    rpcMock.mockResolvedValue({ data: PAYLOAD, error: null });
    renderView();
    await screen.findByText('1.234');

    expect(screen.queryAllByRole('button', { name: /exportar|baixar|download|imprimir|copiar/i })).toHaveLength(0);
    expect(screen.queryAllByRole('link', { name: /exportar|baixar|download|imprimir|copiar/i })).toHaveLength(0);
  });

  it('mostra o erro da RPC em alert e refaz a consulta em "Tentar de novo"', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'permission denied for function (42501)' } });
    renderView();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar os insights de busca');
    expect(alert).toHaveTextContent('permission denied for function (42501)');

    rpcMock.mockResolvedValue({ data: PAYLOAD, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('1.234')).toBeInTheDocument();
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it('estado vazio: sem busca no período, mostra 0 e a mensagem própria (não "sem dados")', async () => {
    rpcMock.mockResolvedValue({
      data: [{ total_searches: 0, searches_without_results: 0, searches_with_click: 0, average_term_length: 0, searches_by_kind: {} }],
      error: null,
    });
    renderView();

    expect(await screen.findByText('Nenhuma busca registrada no período.')).toBeInTheDocument();
    expect(screen.getAllByText('0,0%')).toHaveLength(2); // taxa de clique e sem resultado
    expect(screen.getByText('Textos de busca não são armazenados — privacidade por design.')).toBeInTheDocument();
  });

  it('melhor caso: taxa de clique e sem resultado em 100% (fração 1) não viram NaN', async () => {
    rpcMock.mockResolvedValue({
      data: [{ total_searches: 10, searches_without_results: 10, searches_with_click: 10, average_term_length: 5.0, searches_by_kind: {} }],
      error: null,
    });
    renderView();

    expect(await screen.findAllByText('100,0%')).toHaveLength(2);
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it('abre na janela padrão de 30 dias (o seletor mostra o rótulo do período)', async () => {
    rpcMock.mockResolvedValue({ data: PAYLOAD, error: null });
    renderView();

    await screen.findByText('1.234');
    expect(screen.getByLabelText('Período')).toHaveTextContent('Últimos 30 dias');
  });
});
