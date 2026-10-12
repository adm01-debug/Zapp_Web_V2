/**
 * T16 (barra de captura) — etapas 040, 042, 043 e 045 do plano do design.
 *
 * 040: placeholder "Capturar uma tarefa…", dica "Enter para criar" à direita
 *      e altura de 48 px.
 * 042: chips rápidos aparecem quando o campo recebe foco.
 * 043: depois de criar, o foco volta ao campo.
 * 045: vazio de filtro usa "Nenhum resultado" e oferece saída em um clique.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.mock('../shared/ContactCombobox', () => ({
  ContactCombobox: ({ testId }: { testId?: string }) => <button type="button" data-testid={testId} />,
}));

import { QuickAdd } from '../shared/QuickAdd';
import { TasksEmptyState } from '../TasksEmptyState';

function montar(props: Partial<Parameters<typeof QuickAdd>[0]> = {}) {
  const onAdd = vi.fn().mockResolvedValue(undefined);
  render(<QuickAdd onAdd={onAdd} {...props} />);
  return { onAdd, input: screen.getByTestId('quick-add-input') as HTMLInputElement };
}

describe('barra de captura (etapas 040/042/043)', () => {
  beforeEach(() => cleanup());

  it('Etapa 040: placeholder, dica "Enter para criar" e altura de 48 px', () => {
    const { input } = montar();

    expect(input.placeholder).toBe('Capturar uma tarefa…');
    expect(screen.getByTestId('quick-add-hint').textContent).toBe('Enter para criar');

    fireEvent.change(input, { target: { value: 'Algo' } });

    expect(screen.queryByTestId('quick-add-hint')).toBeNull();
    expect(screen.getByText('Criar')).toBeTruthy();
    expect((input.parentElement as HTMLElement).className).toContain('h-12');
  });

  it('Etapa 042: os chips rápidos aparecem ao focar o campo', () => {
    const { input } = montar();
    const chips = screen.getByTestId('quick-add-chips');

    expect(chips.hasAttribute('hidden')).toBe(true);

    fireEvent.focus(input);

    expect(chips.hasAttribute('hidden')).toBe(false);
    expect(screen.getByTestId('quick-add-chip-today')).toBeTruthy();
    expect(screen.getByTestId('quick-add-chip-priority')).toBeTruthy();
  });

  it('Etapa 043: ao criar, o foco volta ao campo', async () => {
    const { onAdd, input } = montar();
    fireEvent.change(input, { target: { value: 'Capturar e seguir' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(input.value).toBe('');
  });
});

describe('vazio do filtro (etapa 045)', () => {
  beforeEach(() => cleanup());

  it('mostra "Nenhum resultado", a microcopy e a saída em um clique', () => {
    const onClearFilter = vi.fn();
    render(<TasksEmptyState variant="filter" onClearFilter={onClearFilter} />);

    expect(screen.getByText('Nenhum resultado')).toBeTruthy();
    expect(screen.getByText('Ajuste a busca ou os filtros para ver tarefas.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(onClearFilter).toHaveBeenCalledTimes(1);
  });

  it('o vazio geral ("all") não vira "Nenhum resultado"', () => {
    render(<TasksEmptyState variant="all" />);
    expect(screen.getByText('Nada por aqui')).toBeTruthy();
    expect(screen.queryByText('Nenhum resultado')).toBeNull();
  });
});
