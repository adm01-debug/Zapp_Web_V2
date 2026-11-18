/** HZ1-06 — a tela consome somente os agregados que a migration realmente expõe. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpcMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

import { SearchInsightsView } from '@/components/admin/SearchInsightsView';

const PAYLOAD = [{
  total_searches: 1234,
  searches_without_results: 308,
  searches_with_click: 518,
  average_term_length: 10.4,
  searches_by_kind: { contact: 300, message: 218 },
}];

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SearchInsightsView />
    </QueryClientProvider>,
  );
}

beforeEach(() => rpcMock.mockReset());

describe('SearchInsightsView — agregados minimizados (HZ1-06)', () => {
  it('mostra métricas e tipos clicados usando a RPC e o shape do banco', async () => {
    rpcMock.mockResolvedValue({ data: PAYLOAD, error: null });
    renderView();

    expect(await screen.findByText('1.234')).toBeInTheDocument();
    expect(screen.getByText('42,0%')).toBeInTheDocument();
    expect(screen.getByText('25,0%')).toBeInTheDocument();
    expect(screen.getByText('518 clique(s)')).toBeInTheDocument();
    expect(screen.getByText('10,4')).toBeInTheDocument();
    expect(screen.getByText('Cliques por tipo de resultado')).toBeInTheDocument();
    expect(screen.getByText('contact')).toBeInTheDocument();
    expect(screen.getByText('message')).toBeInTheDocument();
    expect(rpcMock).toHaveBeenCalledWith('search_insights', { p_days: 30 });
  });

  it('não inventa nem expõe termos: o armazenamento só possui agregados sem texto livre', async () => {
    rpcMock.mockResolvedValue({ data: PAYLOAD, error: null });
    renderView();
    await screen.findByText('1.234');

    expect(screen.getByText(/texto digitado não é armazenado/i)).toBeInTheDocument();
    expect(screen.queryByText(/placa de obra|caneca personalizada|azulejo/i)).toBeNull();
    expect(screen.queryAllByRole('button', { name: /exportar|baixar|download|imprimir|copiar/i })).toHaveLength(0);
    expect(screen.queryAllByRole('link', { name: /exportar|baixar|download|imprimir|copiar/i })).toHaveLength(0);
  });

  it('mostra erro de permissão e permite repetir a consulta', async () => {
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

  it('estado vazio usa os agregados sem transformar null da média em NaN', async () => {
    rpcMock.mockResolvedValue({
      data: [{
        total_searches: 0,
        searches_without_results: 0,
        searches_with_click: 0,
        average_term_length: null,
        searches_by_kind: {},
      }],
      error: null,
    });
    renderView();

    expect(await screen.findByText('Nenhuma busca registrada no período.')).toBeInTheDocument();
    expect(screen.getAllByText('0,0%')).toHaveLength(2);
    expect(screen.getAllByText('0')).toHaveLength(2); // total e média do termo vazio
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it('deriva a taxa sem resultados no limite de 100% e permite escolher período', async () => {
    rpcMock.mockResolvedValue({
      data: [{ ...PAYLOAD[0], total_searches: 10, searches_without_results: 10, searches_with_click: 10 }],
      error: null,
    });
    renderView();

    expect(await screen.findAllByText('100,0%')).toHaveLength(2);
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.getByLabelText('Período')).toHaveTextContent('Últimos 30 dias');
  });
});
