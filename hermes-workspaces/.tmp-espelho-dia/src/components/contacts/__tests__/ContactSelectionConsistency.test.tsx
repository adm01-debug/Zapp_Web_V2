import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ContactCard } from '../ContactCard';
import { ContactListItem } from '../ContactListItem';
import { ContactsTable } from '../ContactsTable';
import { baseContact, noop } from './contactDeleteFixtures';

/**
 * O estado "selecionado" era diferente em cada view (lista só pintava o fundo,
 * tabela usava uma barra à esquerda e o card usava anel). Estes testes travam o
 * contrato visual: ao selecionar, as três views aplicam os MESMOS tokens
 * (anel + fundo + borda com a mesma cor/intensidade).
 */
const SELECTION_TOKENS = ['ring-1', 'ring-primary', 'bg-primary/5', 'border-primary/60'] as const;

function tokensOf(el: Element): Set<string> {
  return new Set((el.getAttribute('class') || '').split(/\s+/).filter(Boolean));
}

function expectUnifiedSelection(el: Element) {
  const tokens = tokensOf(el);
  for (const token of SELECTION_TOKENS) {
    expect(tokens.has(token), `token de seleção ausente: ${token} (classe: "${el.getAttribute('class')}")`).toBe(true);
  }
}

function itemProps(contact: ReturnType<typeof baseContact>, isSelected: boolean) {
  return {
    contact,
    isSelected,
    onToggleSelect: noop,
    onOpenDetails: vi.fn(),
    onOpenChat: vi.fn(),
    onEdit: noop,
    onDelete: noop,
    index: 0,
  };
}

describe('Contatos · estado selecionado unificado nas 3 views', () => {
  it('ContactCard aplica o mesmo anel/fundo/borda ao selecionar', () => {
    const contact = baseContact({ id: 'c-1' });
    const { unmount } = render(<ContactCard {...itemProps(contact, true)} />);
    expectUnifiedSelection(screen.getByTestId('contact-card'));
    unmount();

    render(<ContactCard {...itemProps(contact, false)} />);
    expect(tokensOf(screen.getByTestId('contact-card')).has('ring-primary')).toBe(false);
  });

  it('ContactListItem aplica o mesmo anel/fundo/borda ao selecionar', () => {
    const contact = baseContact({ id: 'c-1' });
    const { unmount } = render(<ContactListItem {...itemProps(contact, true)} />);
    expectUnifiedSelection(screen.getByTestId('contact-list-item'));
    unmount();

    render(<ContactListItem {...itemProps(contact, false)} />);
    expect(tokensOf(screen.getByTestId('contact-list-item')).has('ring-primary')).toBe(false);
  });

  it('ContactsTable aplica o mesmo anel/fundo/borda na linha selecionada', () => {
    const contact = baseContact({ id: 'c-1' });

    const { unmount } = render(
      <ContactsTable
        contacts={[contact]} selectedIds={['c-1']} onSelectIds={noop}
        onOpenDetails={noop} onOpenChat={noop} onEdit={noop} onDelete={noop}
      />,
    );
    const body = screen.getByTestId('contacts-table-body');
    expectUnifiedSelection(within(body).getByRole('row'));
    unmount();

    render(
      <ContactsTable
        contacts={[contact]} selectedIds={[]} onSelectIds={noop}
        onOpenDetails={noop} onOpenChat={noop} onEdit={noop} onDelete={noop}
      />,
    );
    const row = within(screen.getByTestId('contacts-table-body')).getByRole('row');
    expect(tokensOf(row).has('ring-primary')).toBe(false);
  });
});
