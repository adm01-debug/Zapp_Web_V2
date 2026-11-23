import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ContactResultsSummary } from '../ContactResultsSummary';

const base = {
  totalCount: 8,
  filteredCount: 8,
  activeFiltersCount: 0,
  search: '',
  page: 0,
  pageSize: 20,
  loadMore: vi.fn(),
  loadPrevious: vi.fn(),
  hasMore: false,
  loading: false,
  onSelectAll: vi.fn(),
};

describe('ContactResultsSummary — seleção, comparar e limpar (ZD-086/ZD-087)', () => {
  it('sem seleção não mostra contador, comparar nem limpar', () => {
    render(<ContactResultsSummary {...base} selectedCount={0} allSelected={false} onCompare={vi.fn()} onClearSelection={vi.fn()} />);
    expect(screen.queryByTestId('contacts-selected-count')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Limpar seleção' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Comparar' })).toBeNull();
  });

  it('com 1 selecionado mostra o contador e "Limpar seleção", mas não "Comparar"', () => {
    render(<ContactResultsSummary {...base} selectedCount={1} allSelected={false} onCompare={vi.fn()} onClearSelection={vi.fn()} />);
    expect(screen.getByTestId('contacts-selected-count')).toHaveTextContent('1 selecionado');
    expect(screen.queryByRole('button', { name: 'Comparar' })).toBeNull();
  });

  it('com 2+ selecionados oferece "Comparar" e limpar, ambos acionáveis', () => {
    const onCompare = vi.fn();
    const onClear = vi.fn();
    render(<ContactResultsSummary {...base} selectedCount={3} allSelected={false} onCompare={onCompare} onClearSelection={onClear} />);
    expect(screen.getByTestId('contacts-selected-count')).toHaveTextContent('3 selecionados');
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }));
    expect(onCompare).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Limpar seleção' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('"Selecionar todos" continua acionável e reflete o estado', () => {
    const onSelectAll = vi.fn();
    render(<ContactResultsSummary {...base} selectedCount={8} allSelected onSelectAll={onSelectAll} />);
    expect(screen.getByTestId('contacts-selected-count')).toHaveTextContent('8 selecionados');
    fireEvent.click(screen.getByRole('button', { name: '8 contatos selecionados — clique para desselecionar' }));
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });
});