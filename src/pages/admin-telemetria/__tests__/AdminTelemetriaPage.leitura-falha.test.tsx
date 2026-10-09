import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * R2-INF-040 (item 382, P2) — a falha de LEITURA da telemetria era apresentada como
 * "sistema com bom desempenho".
 *
 * O `queryFn` lança o erro do SDK, mas AdminTelemetriaPage não consumia `error/isError`:
 * o default `rows=[]` chegava à tabela com `isLoading=false` e a TelemetryTable anunciava
 * "Nenhuma query lenta registrada / Isso é bom! O sistema está performando bem.", com os
 * cards mostrando zero erros e média 0ms. Aqui a leitura é forçada a falhar e a tela tem
 * de dizer que NÃO conseguiu medir — nunca que o sistema está bom.
 *
 * Cobre os quatro estados separados que o aceite exige: carregando, falha (sem cache),
 * sucesso vazio, sucesso com registros — e a falha de refetch com dados de cache, que
 * precisa aparecer como defasagem, não como leitura boa.
 */

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import AdminTelemetriaPage from '@/pages/AdminTelemetriaPage';
import { TelemetryTable } from '@/pages/admin-telemetria/TelemetryTable';
import { telemetryViewState } from '@/pages/admin-telemetria/telemetryUtils';

const FALHA = { message: 'permission denied for table query_telemetry', code: '42501' };

const LINHA = {
  id: 'r-1',
  operation: 'select',
  table_name: 'contacts',
  rpc_name: null,
  duration_ms: 4200,
  record_count: 10,
  query_limit: 500,
  query_offset: 0,
  count_mode: 'exact',
  severity: 'slow',
  error_message: null,
  user_id: null,
  created_at: '2026-10-06T10:00:00.000Z',
};

/** Terminal de query do supabase-js: encadeia e resolve o payload informado. */
function noDaQuery(payload: unknown) {
  const self: Record<string, unknown> = {};
  for (const metodo of ['select', 'gte', 'lte', 'order', 'limit', 'eq']) self[metodo] = () => self;
  self.then = (resolver: (v: unknown) => unknown) => Promise.resolve(payload).then(resolver);
  return self;
}

/** Mesma chave montada pela página com os filtros padrão (all/24h, sem datas). */
const CHAVE = ['query-telemetry', 'all', '24h', undefined, undefined];

function novoCliente() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderizar(cliente: QueryClient) {
  return render(
    <QueryClientProvider client={cliente}>
      <AdminTelemetriaPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockFrom.mockReset();
});

describe('estado da leitura da telemetria (R2-INF-040)', () => {
  it('carregando, falha, falha de refetch, vazio e dados são estados distintos', () => {
    expect(telemetryViewState({ isLoading: true, isError: false, rowCount: 0 })).toBe('loading');
    expect(telemetryViewState({ isLoading: false, isError: true, rowCount: 0 })).toBe('error');
    expect(telemetryViewState({ isLoading: false, isError: true, rowCount: 3 })).toBe('stale');
    expect(telemetryViewState({ isLoading: false, isError: false, rowCount: 0 })).toBe('empty');
    expect(telemetryViewState({ isLoading: false, isError: false, rowCount: 3 })).toBe('data');
  });

  it('falha na leitura: mostra o erro e NUNCA "bom desempenho" nem cards zerados', async () => {
    mockFrom.mockReturnValue(noDaQuery({ data: null, error: FALHA }));

    const { container } = renderizar(novoCliente());

    expect(await screen.findByText('Não foi possível ler a telemetria')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain(FALHA.message);
    // O defeito antigo: a ausência de dados por FALHA era lida como bom desempenho.
    expect(screen.queryByText(/performando bem/)).toBeNull();
    expect(screen.queryByText('Nenhuma query lenta registrada')).toBeNull();
    // E os cards não podem anunciar zero erros / média 0ms como se fosse medição.
    expect(screen.queryByText(/Muito Lentas/)).toBeNull();
    expect(screen.queryByText('Média de duração')).toBeNull();
    expect(container.querySelector('[data-telemetria-leitura="falha"]')).toBeTruthy();
  });

  it('sucesso vazio: aí sim o recado de "nenhuma query lenta" é legítimo', async () => {
    mockFrom.mockReturnValue(noDaQuery({ data: [], error: null }));

    const { container } = renderizar(novoCliente());

    expect(await screen.findByText('Nenhuma query lenta registrada')).toBeTruthy();
    expect(screen.getByText(/performando bem/)).toBeTruthy();
    expect(screen.queryByText('Não foi possível ler a telemetria')).toBeNull();
    expect(container.querySelector('[data-telemetria-leitura="vazio"]')).toBeTruthy();
  });

  it('sucesso com registros: tabela aparece, sem erro e sem vazio', async () => {
    mockFrom.mockReturnValue(noDaQuery({ data: [LINHA], error: null }));

    const { container } = renderizar(novoCliente());

    const tabela = await waitFor(() => {
      const el = container.querySelector('[data-telemetria-leitura="dados"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(tabela.textContent).toContain('contacts');
    expect(tabela.textContent).toContain('4.2s');
    expect(screen.queryByText('Não foi possível ler a telemetria')).toBeNull();
    expect(screen.queryByText('Nenhuma query lenta registrada')).toBeNull();
  });

  it('refetch que falha com dados em cache: avisa defasagem e não finge bom desempenho', async () => {
    mockFrom.mockReturnValue(noDaQuery({ data: null, error: FALHA }));
    const cliente = novoCliente();
    // Leitura anterior boa, já velha o bastante para o refetch de montagem acontecer.
    cliente.setQueryData(CHAVE, [LINHA], { updatedAt: Date.now() - 60_000 });

    const { container } = renderizar(cliente);

    expect(await screen.findByText(/podem estar defasados/)).toBeTruthy();
    // Os números da última leitura boa continuam na tela — só que rotulados como defasados.
    expect(container.querySelector('[data-telemetria-leitura="stale"]')).toBeTruthy();
    expect(container.querySelector('[data-telemetria-leitura="dados"]')?.textContent).toContain('contacts');
    expect(screen.queryByText(/performando bem/)).toBeNull();
  });

  it('a tabela sozinha também não anuncia bom desempenho com leitura em erro', () => {
    // Prova a precedência erro > vazio no componente compartilhado: mesmo que um dia outra tela
    // monte a tabela sem o gate da página, a falha continua não sendo lida como sistema saudável.
    const { container } = render(
      <TelemetryTable rows={[]} isLoading={false} isError errorDetail={FALHA.message} />,
    );

    expect(container.querySelector('[data-telemetria-leitura="falha"]')).toBeTruthy();
    expect(container.querySelector('[data-telemetria-leitura="vazio"]')).toBeNull();
    expect(screen.queryByText(/performando bem/)).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain(FALHA.message);
  });
});
