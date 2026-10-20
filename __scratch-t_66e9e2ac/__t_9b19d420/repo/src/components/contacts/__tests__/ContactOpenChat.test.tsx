import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContactCard } from '../ContactCard';
import { ContactListItem } from '../ContactListItem';
import { ContactsTable } from '../ContactsTable';
import { baseContact, noop } from './contactDeleteFixtures';

function itemProps() {
  return {
    contact: baseContact({ id: 'c-1' }),
    isSelected: false,
    onToggleSelect: noop,
    onOpenDetails: vi.fn(),
    onOpenChat: vi.fn(),
    onEdit: noop,
    onDelete: noop,
    index: 0,
  };
}

describe('Contatos · "Conversar" abre o chat, corpo abre o detalhe', () => {
  it.each([
    ['ContactCard', ContactCard],
    ['ContactListItem', ContactListItem],
  ])('%s', (_name, Component) => {
    const props = itemProps();
    render(<Component {...props} />);

    fireEvent.click(screen.getByTitle('Conversar'));
    expect(props.onOpenChat).toHaveBeenCalledWith('c-1');
    expect(props.onOpenDetails).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText(props.contact.name, { exact: false }));
    expect(props.onOpenDetails).toHaveBeenCalledWith('c-1');
    expect(props.onOpenChat).toHaveBeenCalledTimes(1);
  });

  it('ContactsTable', () => {
    const onOpenDetails = vi.fn();
    const onOpenChat = vi.fn();
    const contact = baseContact({ id: 'c-1' });
    render(
      <ContactsTable
        contacts={[contact]} selectedIds={[]} onSelectIds={noop}
        onOpenDetails={onOpenDetails} onOpenChat={onOpenChat}
        onEdit={noop} onDelete={noop}
      />,
    );

    fireEvent.click(screen.getByTitle('Conversar'));
    expect(onOpenChat).toHaveBeenCalledWith('c-1');
    expect(onOpenDetails).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText(contact.name, { exact: false }));
    expect(onOpenDetails).toHaveBeenCalledWith('c-1');
  });
});
