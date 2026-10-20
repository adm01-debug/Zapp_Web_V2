import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContactsTable } from '../ContactsTable';
import { canDeleteSelectedContacts } from '../contactPermissions';
import type { Contact } from '../types';
import { baseContact, noop, openMenu, trigger } from './contactDeleteFixtures';

/**
 * Regressões encontradas pela auditoria adversarial da série de Contatos (29/09/2026):
 *
 * 1. A visão **Tabela** era o único ponto de exclusão SEM o gate de `can_delete`
 *    — o item "Excluir" aparecia para quem não tem vínculo com o contato e a
 *    recusa só surgia no clique (o mesmo débito que o #1187 fechou na lista e no card).
 * 2. O botão "Excluir" do lote era calculado sobre a **página visível**, então
 *    paginar com a seleção ativa (a seleção sobrevive à paginação) o desabilitava
 *    com a mensagem "nenhum dos contatos selecionados pode ser excluído" — falso:
 *    não havia informação sobre eles.
 */

function tableProps(contact: Contact, onDelete = noop) {
  return {
    contacts: [contact],
    selectedIds: [] as string[],
    onSelectIds: noop,
    onOpenChat: noop,
    onEdit: noop,
    onDelete,
    searchQuery: '',
  };
}

describe('ContactsTable · item Excluir (visão Tabela)', () => {
  it('não oferece Excluir quando can_delete é false (mas mantém Editar)', async () => {
    render(<ContactsTable {...tableProps(baseContact({ can_delete: false }))} />);

    openMenu(trigger());

    await waitFor(() => expect(screen.getByText('Editar')).toBeInTheDocument());
    expect(screen.queryByText('Excluir')).not.toBeInTheDocument();
  });

  it('oferece Excluir quando can_delete é true e chama onDelete no clique', async () => {
    const onDelete = vi.fn();
    render(<ContactsTable {...tableProps(baseContact({ can_delete: true }), onDelete)} />);

    openMenu(trigger());

    const item = await screen.findByText('Excluir');
    fireEvent.click(item);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('oferece Excluir quando a permissão ainda não foi respondida (undefined)', async () => {
    render(<ContactsTable {...tableProps(baseContact())} />);

    openMenu(trigger());

    await waitFor(() => expect(screen.getByText('Editar')).toBeInTheDocument());
    expect(screen.getByText('Excluir')).toBeInTheDocument();
  });
});

describe('canDeleteSelectedContacts · botão Excluir do lote', () => {
  const c = (id: string, can_delete?: boolean) => ({ id, can_delete });

  it('sem seleção não decide nada (undefined = comportamento anterior)', () => {
    expect(canDeleteSelectedContacts([], [c('a', false)])).toBeUndefined();
  });

  it('selecionado que não está na lista carregada NÃO bloqueia (undefined) — bug do paginar', () => {
    expect(canDeleteSelectedContacts(['fora-da-pagina'], [c('b', false)])).toBeUndefined();
  });

  it('bloqueia só quando todo selecionado conhecido está sem permissão', () => {
    expect(canDeleteSelectedContacts(['a', 'b'], [c('a', false), c('b', false)])).toBe(false);
  });

  it('habilita quando ao menos um selecionado conhecido pode ser excluído', () => {
    expect(canDeleteSelectedContacts(['a', 'b'], [c('a', false), c('b', true)])).toBe(true);
  });

  it('permissão ainda não respondida (undefined) mantém habilitado', () => {
    expect(canDeleteSelectedContacts(['a'], [c('a')])).toBe(true);
  });

  it('ignora o que está fora da seleção', () => {
    expect(canDeleteSelectedContacts(['a'], [c('a', false), c('b', true)])).toBe(false);
  });
});
