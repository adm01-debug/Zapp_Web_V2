import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BulkActionsBar } from '../BulkActionsBar';
import { canChangeSelectedContactsType } from '../contactPermissions';
import { noop } from './contactDeleteFixtures';

/**
 * Gate do "Alterar tipo em massa" (etapa 68 do plano de 100 etapas).
 *
 * O UPDATE de `contacts` no banco é governado pela policy "Users can update
 * their assigned contacts" → `can_edit_contact`: admin/supervisor OU
 * responsável pelo contato. O front não recalcula a regra: reusa o mesmo
 * predicado por contato que a RPC `can_delete_contacts` já devolve
 * (`contact.can_delete`), via `canChangeSelectedContactsType`.
 *
 * Mutação verificada: remover `disabled={... || !canChangeTypeSelection}` do
 * botão Tipo deixa o primeiro caso deste arquivo vermelho.
 */

const SELECAO = ['30000000-0000-0000-0000-000000000001'];

function renderBar(canChangeTypeSelection: boolean) {
  return render(
    <BulkActionsBar
      selectedIds={SELECAO}
      onClearSelection={noop}
      onActionComplete={noop}
      canChangeTypeSelection={canChangeTypeSelection}
    />,
  );
}

function tipoButton(): HTMLElement {
  const button = screen.getByText('Tipo').closest('button');
  if (!button) throw new Error('botão Tipo não encontrado');
  return button;
}

describe('canChangeSelectedContactsType', () => {
  it('nega quando todos os selecionados conhecidos não podem editar', () => {
    expect(
      canChangeSelectedContactsType(SELECAO, [{ id: SELECAO[0], can_delete: false }]),
    ).toBe(false);
  });

  it('libera quando ao menos um selecionado conhecido pode editar', () => {
    expect(
      canChangeSelectedContactsType(SELECAO, [{ id: SELECAO[0], can_delete: true }]),
    ).toBe(true);
  });

  it('não bloqueia sem informação (seleção fora da página carregada)', () => {
    expect(canChangeSelectedContactsType(SELECAO, [])).toBeUndefined();
  });

  it('mantém disponível enquanto a RPC não respondeu (can_delete undefined)', () => {
    expect(canChangeSelectedContactsType(SELECAO, [{ id: SELECAO[0] }])).toBe(true);
  });
});

describe('BulkActionsBar · "Alterar tipo em massa" tem gate', () => {
  it('desabilita o dropdown Tipo sem permissão, com o motivo no title', () => {
    renderBar(false);

    const button = tipoButton();
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Você não pode alterar o tipo destes contatos');
  });

  it('habilita o dropdown Tipo quando o servidor confirma a permissão', () => {
    renderBar(true);

    expect(tipoButton()).toBeEnabled();
  });
});
