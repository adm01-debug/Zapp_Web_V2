import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilesSelectionBar } from '../FilesSelectionBar';

function renderBar(overrides: Partial<React.ComponentProps<typeof FilesSelectionBar>> = {}) {
  const props: React.ComponentProps<typeof FilesSelectionBar> = {
    selectedCount: 2,
    visibleCount: 5,
    outsideFilterCount: 0,
    allVisibleSelected: false,
    someVisibleSelected: true,
    onSelectAllVisible: vi.fn(),
    onClear: vi.fn(),
    onCancel: vi.fn(),
    onForward: vi.fn(),
    ...overrides,
  };
  return { ...render(<FilesSelectionBar {...props} />), props };
}

describe('FilesSelectionBar (etapas 32-33)', () => {
  it('etapa 32: mostra "N selecionados" com aria-live="polite" e M visíveis reais', () => {
    renderBar({ selectedCount: 3, visibleCount: 7 });
    const contagem = screen.getByText('3 selecionados');
    expect(contagem).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Selecionar todos (7 visíveis)')).toBeInTheDocument();
  });

  it('etapa 32: singular correto com 1 selecionado', () => {
    renderBar({ selectedCount: 1 });
    expect(screen.getByText('1 selecionado')).toBeInTheDocument();
  });

  it('etapa 38: "Encaminhar N" fica habilitado e chama o handler real; sem ZIP nem excluir em massa', () => {
    const { props } = renderBar({ selectedCount: 4 });
    const encaminhar = screen.getByRole('button', { name: /Encaminhar 4/ });
    expect(encaminhar).toBeEnabled();
    fireEvent.click(encaminhar);
    expect(props.onForward).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /ZIP/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Excluir/i })).not.toBeInTheDocument();
  });

  it('etapa 39: acima de 10 arquivos o encaminhamento fica desabilitado com o motivo visível', () => {
    renderBar({ selectedCount: 11, forwardLimitReason: 'Máximo de 10 arquivos por operação (você selecionou 11).' });
    const encaminhar = screen.getByRole('button', { name: /Encaminhar 11/ });
    expect(encaminhar).toBeDisabled();
    expect(encaminhar).toHaveAttribute('title', 'Máximo de 10 arquivos por operação (você selecionou 11).');
    expect(screen.getByText('Máximo de 10 arquivos por operação (você selecionou 11).')).toBeInTheDocument();
  });

  it('etapa 32: cada ação habilitada tem handler real (Selecionar todos, Limpar, Cancelar)', () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todos' }));
    expect(props.onSelectAllVisible).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(props.onClear).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('etapa 33: checkbox geral fica indeterminate com seleção parcial', () => {
    renderBar({ selectedCount: 2, visibleCount: 5, allVisibleSelected: false, someVisibleSelected: true });
    const checkbox = screen.getByRole('checkbox', { name: 'Selecionar todos' });
    expect(checkbox).toHaveAttribute('data-state', 'indeterminate');
    expect(checkbox).toHaveAttribute('aria-checked', 'mixed');
  });

  it('etapa 33: checkbox geral fica marcado quando todo o recorte está selecionado', () => {
    renderBar({ selectedCount: 5, visibleCount: 5, allVisibleSelected: true, someVisibleSelected: false });
    expect(screen.getByRole('checkbox', { name: 'Selecionar todos' })).toHaveAttribute('data-state', 'checked');
  });

  it('etapa 33: desmarcar o checkbox geral limpa a seleção', () => {
    const { props } = renderBar({ selectedCount: 5, visibleCount: 5, allVisibleSelected: true, someVisibleSelected: false });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todos' }));
    expect(props.onClear).toHaveBeenCalledTimes(1);
    expect(props.onSelectAllVisible).not.toHaveBeenCalled();
  });

  it('etapa 33: mostra k selecionados fora do filtro quando há seleção fora do recorte', () => {
    renderBar({ selectedCount: 56, visibleCount: 2, outsideFilterCount: 54 });
    expect(screen.getByText('54 selecionados fora do filtro')).toBeInTheDocument();
    expect(screen.getByText('Selecionar todos (2 visíveis)')).toBeInTheDocument();
  });

  it('etapa 33: sem seleção fora do filtro não mostra o aviso', () => {
    renderBar({ outsideFilterCount: 0 });
    expect(screen.queryByText(/fora do filtro/)).not.toBeInTheDocument();
  });
});
