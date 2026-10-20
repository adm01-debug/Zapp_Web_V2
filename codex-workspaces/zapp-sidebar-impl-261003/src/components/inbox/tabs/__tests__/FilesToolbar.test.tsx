import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilesToolbar } from '../FilesToolbar';
import type { ColumnOption } from '@/hooks/chat/useFilesContainerColumns';

const OPCOES: ColumnOption[] = ([3, 4, 5, 6, 8] as const).map((n) => ({ n, fits: true }));

function renderToolbar(overrides: Partial<React.ComponentProps<typeof FilesToolbar>> = {}) {
  const props: React.ComponentProps<typeof FilesToolbar> = {
    search: '',
    onSearchChange: vi.fn(),
    sort: 'recent',
    onSortChange: vi.fn(),
    viewMode: 'grid',
    onViewModeChange: vi.fn(),
    columns: 4,
    columnOptions: OPCOES,
    onColumnsChange: vi.fn(),
    selectionMode: false,
    selectedCount: 0,
    onToggleSelectionMode: vi.fn(),
    ...overrides,
  };
  return { ...render(<FilesToolbar {...props} />), props };
}

describe('FilesToolbar (etapa 11)', () => {
  it('expõe busca, ordenação, Selecionar e Layout na ordem do plano', () => {
    renderToolbar();
    const barra = screen.getByTestId('files-toolbar');
    expect(barra).toBeInTheDocument();
    expect(screen.getByLabelText('Buscar arquivos')).toBeInTheDocument();
    expect(screen.getByLabelText('Ordenar arquivos')).toBeInTheDocument();
    expect(screen.getByTestId('files-select-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('files-layout-trigger')).toBeInTheDocument();
  });

  it('quebra em segunda linha em vez de rolar (flex-wrap) e a busca tem mínimo de 220px', () => {
    renderToolbar();
    expect(screen.getByTestId('files-toolbar').className).toContain('flex-wrap');
    const campo = screen.getByLabelText('Buscar arquivos');
    expect(campo.parentElement?.className).toContain('min-w-[220px]');
  });

  it('digitar na busca avisa o hook', () => {
    const onSearchChange = vi.fn();
    renderToolbar({ onSearchChange });
    fireEvent.change(screen.getByLabelText('Buscar arquivos'), { target: { value: 'contrato' } });
    expect(onSearchChange).toHaveBeenCalledWith('contrato');
  });

  it('oferece os quatro modos de ordenação, incluindo Nome (A–Z)', () => {
    renderToolbar();
    fireEvent.click(screen.getByLabelText('Ordenar arquivos'));
    expect(screen.getByRole('option', { name: 'Mais recentes' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Mais antigos' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Maiores' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Nome (A–Z)' })).toBeInTheDocument();
  });

  it('Selecionar alterna para Cancelar com aria-pressed e mostra o contador', () => {
    const onToggleSelectionMode = vi.fn();
    const { rerender, props } = renderToolbar({ onToggleSelectionMode });
    const botao = screen.getByTestId('files-select-toggle');
    expect(botao).toHaveTextContent('Selecionar');
    expect(botao).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(botao);
    expect(onToggleSelectionMode).toHaveBeenCalled();

    rerender(<FilesToolbar {...props} selectionMode selectedCount={3} />);
    const ativo = screen.getByTestId('files-select-toggle');
    expect(ativo).toHaveTextContent('Cancelar');
    expect(ativo).toHaveAttribute('aria-pressed', 'true');
    expect(ativo).toHaveTextContent('3');
  });
});
