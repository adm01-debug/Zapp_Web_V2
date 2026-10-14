/**
 * N-073 — acessibilidade do DataExplorerTable (CRM 360°).
 * Fonte: docs/audits/AUDITORIA_A11Y_MOBILE_CONTATOS_CRM_2026-10-07.md
 * A11Y-CONTATOS_CRM-03/-04/-05/-10 — nome acessível nos botões só de ícone e no
 * combobox "Itens por página", ordenação de coluna pelo teclado com aria-sort
 * e selo de contagem legível.
 *
 * O caminho exercitado é o real da tela: componente → useExternalTableBrowser →
 * useExternalSelect → ExternalCRMService.queryExternal. Só a fronteira (o
 * serviço do CRM e o portão da integração) é dublada — página, ordem e filtros
 * são o estado do hook verdadeiro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';

const queryExternal = vi.fn();
vi.mock('@/services/crm/external-crm.service', () => ({
  ExternalCRMService: {
    queryExternal: (...args: unknown[]) => queryExternal(...args),
    callRPC: vi.fn(),
  },
}));

vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({
  useCRMIntegrationEnabled: () => true,
}));

import { DataExplorerTable } from '../DataExplorerTable';
import type { TabConfig } from '../crm360TabsConfig';

const TAB: TabConfig = {
  id: 'empresas',
  label: 'Empresas',
  icon: Building2,
  description: 'empresas do CRM externo',
  searchColumn: 'nome',
  columns: [
    { key: 'nome', label: 'Nome' },
    { key: 'cidade', label: 'Cidade' },
  ],
};

let qc: QueryClient;

function renderTable() {
  return render(
    <QueryClientProvider client={qc}>
      <DataExplorerTable tabConfig={TAB} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  queryExternal.mockResolvedValue({
    data: [{ id: 'e-1', nome: 'ACME Brindes', cidade: 'São Paulo' }],
    meta: { record_count: 1234, duration_ms: 45, severity: 'ok' },
  });
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
});

describe('N-073 — nomes acessíveis nos controles do CRM 360°', () => {
  it('expõe Atualizar, paginação e o combobox Itens por página pelo nome', () => {
    renderTable();

    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próxima página' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Itens por página' })).toBeInTheDocument();
  });

  it('o botão de limpar busca tem nome quando há texto digitado', () => {
    renderTable();

    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/i), {
      target: { value: 'ana' },
    });

    expect(screen.getByRole('button', { name: 'Limpar busca' })).toBeInTheDocument();
  });
});

describe('N-073 — ordenação de coluna pelo teclado', () => {
  it('Enter no cabeçalho ordena a coluna e alterna o aria-sort', async () => {
    renderTable();

    const cabecalho = screen.getByRole('columnheader', { name: 'Nome' });
    expect(cabecalho).toHaveAttribute('aria-sort', 'none');

    fireEvent.keyDown(cabecalho, { key: 'Enter' });
    expect(cabecalho).toHaveAttribute('aria-sort', 'ascending');
    await waitFor(() =>
      expect(queryExternal).toHaveBeenLastCalledWith(
        expect.objectContaining({ order: { column: 'nome', ascending: true } }),
      ),
    );

    fireEvent.keyDown(cabecalho, { key: 'Enter' });
    expect(cabecalho).toHaveAttribute('aria-sort', 'descending');
    await waitFor(() =>
      expect(queryExternal).toHaveBeenLastCalledWith(
        expect.objectContaining({ order: { column: 'nome', ascending: false } }),
      ),
    );
  });

  it('o cabeçalho ordenável é alcançável por Tab', () => {
    renderTable();

    const cabecalho = screen.getByRole('columnheader', { name: 'Cidade' });
    expect(cabecalho).toHaveAttribute('tabindex', '0');
  });
});

describe('N-073 — selo de contagem legível', () => {
  it('mostra a contagem em tamanho legível, sem text-3xs', async () => {
    renderTable();

    const selo = await screen.findByText(/reg\./);
    expect(selo).toHaveTextContent('1.234 reg.');
    expect(selo).toHaveClass('text-xs');
    expect(selo).not.toHaveClass('text-3xs');
  });
});
