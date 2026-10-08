import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilesLayoutPopover } from '../FilesLayoutPopover';
import type { ColumnOption } from '@/hooks/chat/useFilesContainerColumns';

const OPCOES: ColumnOption[] = ([3, 4, 5] as const).map((n) => ({ n, fits: true }));

function abrir(props: Partial<React.ComponentProps<typeof FilesLayoutPopover>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <FilesLayoutPopover
      viewMode="grid"
      onViewModeChange={vi.fn()}
      columns={4}
      columnOptions={OPCOES}
      onColumnsChange={onChange}
      {...props}
    />,
  );
  fireEvent.click(screen.getByTestId('files-layout-trigger'));
  return { ...utils, onChange };
}

describe('FilesLayoutPopover (etapa 12)', () => {
  it('o gatilho se anuncia e não usa Tooltip aninhado (só title)', () => {
    render(
      <FilesLayoutPopover viewMode="grid" onViewModeChange={vi.fn()} columns={4} columnOptions={OPCOES} onColumnsChange={vi.fn()} />,
    );
    const gatilho = screen.getByTestId('files-layout-trigger');
    expect(gatilho).toHaveAttribute('aria-label', 'Alterar layout');
    expect(gatilho).toHaveAttribute('title');
    expect(gatilho).toHaveTextContent('Layout');
  });

  it('mostra Visualização com os três modos e marca o ativo com aria-pressed', () => {
    abrir({ viewMode: 'table' });
    expect(screen.getByText('Visualização')).toBeInTheDocument();
    expect(screen.getByTestId('files-view-grid')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('files-view-table')).toHaveAttribute('aria-pressed', 'true');
  });

  it('só mostra Colunas no modo Grid', () => {
    const { unmount } = abrir({ viewMode: 'grid' });
    expect(screen.getByText('Colunas')).toBeInTheDocument();
    unmount();

    abrir({ viewMode: 'list' });
    expect(screen.queryByText('Colunas')).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('clicar em Lista avisa o hook e esconde Colunas quando o modo muda', () => {
    const onViewModeChange = vi.fn();
    const { rerender } = render(
      <FilesLayoutPopover viewMode="grid" onViewModeChange={onViewModeChange} columns={4} columnOptions={OPCOES} onColumnsChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId('files-layout-trigger'));
    fireEvent.click(screen.getByTestId('files-view-list'));
    expect(onViewModeChange).toHaveBeenCalledWith('list');

    rerender(
      <FilesLayoutPopover viewMode="list" onViewModeChange={onViewModeChange} columns={4} columnOptions={OPCOES} onColumnsChange={vi.fn()} />,
    );
    expect(screen.queryByText('Colunas')).not.toBeInTheDocument();
  });

  it('não guarda estado próprio: o valor das colunas vem das props', () => {
    const { onChange } = abrir({ columns: 5 });
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(screen.getByTestId('files-columns-5')).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByTestId('files-columns-3'));
    expect(onChange).toHaveBeenCalledWith(3);
    // segue marcando o valor das props (controlado), não o clicado
    expect(screen.getByTestId('files-columns-5')).toHaveAttribute('aria-checked', 'true');
  });
});
