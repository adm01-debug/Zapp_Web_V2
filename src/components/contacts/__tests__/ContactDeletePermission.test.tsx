import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContactListItem } from '../ContactListItem';
import { ContactCard } from '../ContactCard';
import { canDeleteContact } from '../contactPermissions';
import type { Contact } from '../types';

/**
 * O item "Excluir" só pode aparecer quando o banco confirma que o usuário pode
 * excluir aquele contato (`contact.can_delete`, vindo da RPC
 * `can_delete_contacts`). Antes aparecia sempre e a recusa só surgia no clique
 * (débito levantado no PR #1187).
 */

// DropdownMenuTrigger do Radix abre no pointerdown, não no click — mesmo helper
// de src/components/inbox/contact-details/__tests__/ContactActionButtons.test.tsx
function openMenu(element: Element) {
  fireEvent.pointerDown(element);
  fireEvent.pointerUp(element);
  fireEvent.click(element);
}

function trigger(): Element {
  const el = document.querySelector('button[aria-haspopup="menu"]');
  if (!el) throw new Error('botão de menu não encontrado');
  return el;
}

function baseContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: '30000000-0000-0000-0000-000000000001',
    name: 'Ana Souza',
    surname: null,
    nickname: null,
    phone: '5511999999999',
    email: null,
    avatar_url: null,
    company: null,
    job_title: null,
    tags: null,
    contact_type: 'cliente',
    created_at: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

const noop = () => {};

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
