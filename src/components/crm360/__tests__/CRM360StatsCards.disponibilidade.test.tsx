import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * CRM360StatsCards — cartões de contagem (paridade V3, cartão t_c4169ef4).
 *
 * Contrato provado aqui:
 *  - consulta com erro NÃO vira '0' solto: mostra '—' com o tooltip de indisponível;
 *  - contagem real (inclusive 0) continua sendo exibida como número;
 *  - caminho real: componente → useExternalSelect → ExternalCRMService → callCRMIntegration
 *    → supabase.functions.invoke. Só o cliente Supabase e o gate da integração são dublados.
 */

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({
  useCRMIntegrationEnabled: () => true,
}));

import { CRM360StatsCards } from '../CRM360StatsCards';

const TOOLTIP = 'Métrica indisponível neste ambiente';

function renderCards() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CRM360StatsCards />
    </QueryClientProvider>,
  );
}

function gatewayCount(recordCount: number) {
  mocks.invoke.mockResolvedValue({
    data: { data: [{ id: '1' }], meta: { record_count: recordCount, duration_ms: 1, severity: 'ok' } },
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CRM360StatsCards — contagem indisponível', () => {
  it('mostra a contagem real do banco quando a consulta responde', async () => {
    gatewayCount(42);
    renderCards();

    await waitFor(() => expect(screen.getAllByText('42').length).toBe(6));
    expect(screen.queryByText(TOOLTIP)).toBeNull();
  });

  it('mostra 0 quando a tabela responde com contagem zero (zero real, não falso)', async () => {
    gatewayCount(0);
    renderCards();

    await waitFor(() => expect(screen.getAllByText('0').length).toBe(6));
    expect(screen.queryByTitle(TOOLTIP)).toBeNull();
  });

  it('erro na consulta mostra "—" com tooltip em vez de 0', async () => {
    mocks.invoke.mockRejectedValue(new Error('crm-integration falhou'));
    renderCards();

    await waitFor(() => expect(screen.getAllByText('—').length).toBe(6));
    expect(screen.getAllByTitle(TOOLTIP).length).toBe(6);
    expect(screen.queryByText('0')).toBeNull();
  });
});
