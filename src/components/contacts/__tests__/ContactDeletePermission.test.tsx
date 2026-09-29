import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContactListItem } from '../ContactListItem';
import { ContactCard } from '../ContactCard';
import { canDeleteContact } from '../contactPermissions';
import type { Contact } from '../types';
import { baseContact, noop, openMenu, trigger } from './contactDeleteFixtures';

/**
 * O item "Excluir" só pode aparecer quando o banco confirma que o usuário pode
 * excluir aquele contato (`contact.can_delete`, vindo da RPC
 * `can_delete_contacts`). Antes aparecia sempre e a recusa só surgia no clique
 * (débito levantado no PR #1187).
 */

// Helpers de menu/contato em ./contactDeleteFixtures (compartilhados com
// ContactDeleteEntryPoints.test.tsx).

function itemProps(contact: Contact, onDelete = noop) {
  return {
    contact,
    isSelected: false,
    onToggleSelect: noop,
    onOpenChat: noop,
    onEdit: noop,
    onDelete,
    index: 0,
  };
}

describe('canDeleteContact', () => {
  it('esconde só quando o servidor diz que não pode (false)', () => {
    expect(canDeleteContact({ can_delete: false })).toBe(false);
  });

  it('mantém visível quando o servidor confirma (true)', () => {
    expect(canDeleteContact({ can_delete: true })).toBe(true);
  });

  it('mantém visível enquanto a resposta não chegou (undefined) — comportamento anterior', () => {
    expect(canDeleteContact({})).toBe(true);
    expect(canDeleteContact({ can_delete: undefined })).toBe(true);
  });
});

describe('ContactListItem · item Excluir', () => {
  it('não oferece Excluir quando can_delete é false (mas mantém Editar)', async () => {
    render(<ContactListItem {...itemProps(baseContact({ can_delete: false }))} />);

    openMenu(trigger());

    await waitFor(() => expect(screen.getByText('Editar')).toBeInTheDocument());
    expect(screen.queryByText('Excluir')).not.toBeInTheDocument();
  });

  it('oferece Excluir quando can_delete é true e chama onDelete no clique', async () => {
    const onDelete = vi.fn();
    render(<ContactListItem {...itemProps(baseContact({ can_delete: true }), onDelete)} />);

    openMenu(trigger());

    const item = await screen.findByText('Excluir');
    fireEvent.click(item);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('oferece Excluir quando a permissão ainda não foi respondida (undefined)', async () => {
    render(<ContactListItem {...itemProps(baseContact())} />);

    openMenu(trigger());

    await waitFor(() => expect(screen.getByText('Editar')).toBeInTheDocument());
    expect(screen.getByText('Excluir')).toBeInTheDocument();
  });
});

describe('ContactCard · item Excluir', () => {
  it('não oferece Excluir quando can_delete é false', async () => {
    render(<ContactCard {...itemProps(baseContact({ can_delete: false }))} />);

    openMenu(trigger());

    await waitFor(() => expect(screen.getByText('Editar')).toBeInTheDocument());
    expect(screen.queryByText('Excluir')).not.toBeInTheDocument();
  });

  it('oferece Excluir quando can_delete é true', async () => {
    render(<ContactCard {...itemProps(baseContact({ can_delete: true }))} />);

    openMenu(trigger());

    await waitFor(() => expect(screen.getByText('Editar')).toBeInTheDocument());
    expect(screen.getByText('Excluir')).toBeInTheDocument();
  });
});
