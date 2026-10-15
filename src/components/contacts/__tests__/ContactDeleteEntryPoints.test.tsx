import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContactsTable } from '../ContactsTable';
import type { Contact } from '../types';
import { baseContact, noop, openMenu, trigger } from './contactDeleteFixtures';

/**
 * Regressões encontradas pela auditoria adversarial da série de Contatos (29/09/2026):
 *
 * 1. A visão **Tabela** era o único ponto de exclusão SEM o gate de `can_delete`
 *    — o item "Excluir" aparecia para quem não tem vínculo com o contato e a
 *    recusa só surgia no clique (o mesmo débito que o #1187 fechou na lista e no card).
 *
 * CT-088 (15/10/2026) retirou a exclusão em lote — `canDeleteSelectedContacts`
 * saiu junto com a barra de ações em massa (edição em massa de contatos é feita
 * no Singu). O item avulso da Tabela continua coberto aqui.
 */

function tableProps(contact: Contact, onDelete = noop) {
  return {
    contacts: [contact],
    selectedIds: [] as string[],
    onSelectIds: noop,
    onOpenDetails: noop,
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
