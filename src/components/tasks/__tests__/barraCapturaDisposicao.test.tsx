/**
 * T16 (barra de captura) — etapas 040, 043 e 045 do plano do design.
 *
 * 040: ícone +, placeholder "Capturar uma tarefa…", dica "Enter para criar" à
 *      direita (some ao digitar) e altura 48 px.
 * 043: depois de criar, o foco volta ao campo (a criação em si não é reinventada
 *      aqui — ela é do hook; o realce de 1,2 s é da Lista, fora deste cartão).
 * 045: o vazio do filtro diz "Nenhum resultado", com microcopy e "Limpar filtros".
 *
 * O `ContactCombobox` é do passo paralelo do plano; aqui ele é substituído por um
 * stub com o mesmo `testId`, como em `QuickAdd.test.tsx`.
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
    // A dica fica à direita enquanto o campo está vazio...
    expect(screen.getByTestId('quick-add-hint').textContent).toBe('Enter para criar');
    // ...e some quando o usuário começa a digitar (aí entra o botão Criar).
    fireEvent.change(input, { target: { value: 'Algo' } });
    expect(screen.queryByTestId('quick-add-hint')).toBeNull();
    expect(screen.getByText('Criar')).toBeTruthy();

    // 48 px = `h-12` no contêiner do campo (antes `h-11`, 44 px).
    const caixa = input.parentElement as HTMLElement;
    expect(caixa.className).toContain('h-12');
  });

  it('Etapa 043: ao criar, o foco volta ao campo', async () => {
    const { onAdd, input } = montar();
    fireEvent.change(input, { target: { value: 'Capturar e seguir' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    // O foco volta depois do re-render que libera o campo (ele fica `disabled`
    // enquanto `loading`).
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
