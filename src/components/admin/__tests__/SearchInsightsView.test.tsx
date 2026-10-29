/**
 * HZ1-06 — tela "Insights de Busca" (admin/supervisor).
 *
 * O que esta prova cobre:
 *  - os KPIs vêm da RPC `get_search_insights` (janela de 30 dias por padrão) e a
 *    taxa exibida é a FRAÇÃO devolvida pela RPC virando porcentagem (0.42 → 42,0%),
 *    inclusive a parcela de buscas sem resultado, calculada sobre o total;
 *  - as duas tabelas (mais buscadas / sem resultado) mostram os termos normalizados;
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

const PAYLOAD = {
  days: 30,
  total: 1234,
  no_results: 308,
  clicks: 518,
  click_rate: 0.42,
  top_queries: [
    { term: 'placa de obra', count: 210 },
    { term: 'caneca personalizada', count: 140 },
  ],
  no_result_terms: [{ term: 'azulejo', count: 90 }],
};

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
  it('mostra os KPIs e as duas tabelas a partir da RPC, na janela de 30 dias', async () => {
    rpcMock.mockResolvedValue({ data: PAYLOAD, error: null });
    renderView();

    expect(await screen.findByText('1.234')).toBeInTheDocument();
    expect(screen.getByText('42,0%')).toBeInTheDocument();          // taxa de clique (0.42)
    expect(screen.getByText('25,0%')).toBeInTheDocument();          // 308/1234 sem resultado
    expect(screen.getByText('518 clique(s)')).toBeInTheDocument();
    expect(screen.getByText('placa de obra')).toBeInTheDocument();
    expect(screen.getByText('210')).toBeInTheDocument();
    expect(screen.getByText('azulejo')).toBeInTheDocument();

    expect(rpcMock).toHaveBeenCalledWith('get_search_insights', { p_days: 30 });
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
      data: { days: 30, total: 0, no_results: 0, clicks: 0, click_rate: 0, top_queries: [], no_result_terms: [] },
      error: null,
    });
    renderView();

    expect(await screen.findByText('Nenhuma busca registrada no período.')).toBeInTheDocument();
    expect(screen.getAllByText('0,0%')).toHaveLength(2); // taxa de clique e sem resultado
    expect(screen.getByText('Nenhum termo sem resultado no período.')).toBeInTheDocument();
  });

  it('melhor caso: taxa de clique e sem resultado em 100% (fração 1) não viram NaN', async () => {
    rpcMock.mockResolvedValue({
      data: {
        days: 7,
        total: 10,
        no_results: 10,
        clicks: 10,
        click_rate: 1,
        top_queries: [{ term: 'caneta', count: 10 }],
        no_result_terms: [{ term: 'caneta', count: 10 }],
      },
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
