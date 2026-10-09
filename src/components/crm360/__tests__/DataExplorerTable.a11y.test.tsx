import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * N-073 — A11Y-CONTATOS_CRM-03, -04, -05 (selo) e -10: na tabela do CRM 360°
 * os botões só de ícone (atualizar, limpar busca, paginação) e o seletor
 * "itens por página" não tinham nome acessível, a ordenação por coluna só
 * respondia a mouse e o selo de contagem usava `text-3xs` (10 px).
 *
 * O dublê abaixo é uma implementação fiel do `useExternalTableBrowser` (mesma
 * interface, mesmo estado interno) para que a tela renderize de verdade e a
 * ordenação alterne `aria-sort` via re-render — não um objeto parado.
 */

vi.mock('@/hooks/integrations/useExternalDB', async () => {
  const React = await import('react');
  return {
    useExternalTableBrowser: () => {
      const [page, setPage] = React.useState(0);
      const [pageSize, setPageSize] = React.useState(25);
      const [filters, setFilters] = React.useState<unknown[]>([]);
      const [order, setOrder] = React.useState<{ column: string; ascending: boolean } | undefined>(undefined);
      return {
        data: [{ id: '1', nome_fantasia: 'ACME Brindes', status: 'ativo' }],
        totalRecords: 1234,
        duration: 42,
        isLoading: false,
        isFetching: false,
        error: null,
        page,
        pageSize,
        filters,
        order,
        searchTerm: '',
        setSearchTerm: vi.fn(),
        setPageSize: (size: number) => { setPageSize(size); setPage(0); },
        nextPage: () => setPage((p) => p + 1),
        prevPage: () => setPage((p) => Math.max(0, p - 1)),
        goToPage: (p: number) => setPage(p),
        addFilter: (f: unknown) => { setFilters((prev) => [...prev, f]); setPage(0); },
        removeFilter: vi.fn(),
        clearFilters: () => { setFilters([]); setPage(0); },
        setSort: (column: string, ascending = true) => { setOrder({ column, ascending }); setPage(0); },
        refetch: vi.fn(),
      };
    },
  };
});

import { DataExplorerTable } from '../DataExplorerTable';
import type { TabConfig } from '../crm360TabsConfig';

const TAB: TabConfig = {
  id: 'companies',
  label: 'Empresas',
  icon: () => null,
  description: 'empresas do CRM',
  searchColumn: 'nome_fantasia',
  columns: [
    { key: 'nome_fantasia', label: 'Nome Fantasia' },
    { key: 'status', label: 'Status' },
  ],
};

describe('DataExplorerTable — nomes acessíveis nos controles', () => {
  it('botões só de ícone e o seletor de itens por página têm nome acessível', () => {
    render(<DataExplorerTable tabConfig={TAB} />);

    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próxima página' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Itens por página' })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'acme' } });
    expect(screen.getByRole('button', { name: 'Limpar busca' })).toBeInTheDocument();
  });
});

describe('DataExplorerTable — ordenação por teclado', () => {
  it('Enter no cabeçalho ordena a coluna e alterna aria-sort', () => {
    render(<DataExplorerTable tabConfig={TAB} />);
    const head = screen.getByRole('columnheader', { name: 'Nome Fantasia' });

    expect(head).toHaveAttribute('aria-sort', 'none');

    fireEvent.keyDown(head, { key: 'Enter' });
    expect(head).toHaveAttribute('aria-sort', 'ascending');

    fireEvent.keyDown(head, { key: 'Enter' });
    expect(head).toHaveAttribute('aria-sort', 'descending');
  });

  it('clique no cabeçalho continua ordenando (sem regressão do mouse)', () => {
    render(<DataExplorerTable tabConfig={TAB} />);
    const head = screen.getByRole('columnheader', { name: 'Status' });

    fireEvent.click(head);
    expect(head).toHaveAttribute('aria-sort', 'ascending');
  });
});

describe('DataExplorerTable — selo de contagem legível', () => {
  it('os selos de contagem não usam o degrau text-3xs', () => {
    render(<DataExplorerTable tabConfig={TAB} />);

    const seloRegistros = screen.getByText(/reg\./);
    const seloDuracao = screen.getByText(/42\s*ms/);
    expect(seloRegistros).not.toHaveClass('text-3xs');
    expect(seloDuracao).not.toHaveClass('text-3xs');
    expect(seloRegistros).toHaveClass('text-xs');
  });
});
