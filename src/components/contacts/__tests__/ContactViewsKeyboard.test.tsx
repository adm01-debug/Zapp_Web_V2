import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ContactContentArea } from '../ContactContentArea';
import { ContactsTable } from '../ContactsTable';
import { baseContact, noop } from './contactDeleteFixtures';
import type { Contact } from '../types';

/**
 * ZD-068 — as três visões (grade, lista e tabela) respondem ao mesmo teclado:
 * Tab entra no bloco, setas movem entre os itens, Home/End vão às pontas e
 * Enter abre a ficha. Antes disso só o card era alcançável — a lista e a
 * tabela ficavam fora da ordem de tabulação (WCAG 2.1.1).
 */

const contatos: Contact[] = [
  baseContact({ id: 'c-1', name: 'Ana Souza' }),
  baseContact({ id: 'c-2', name: 'Bruno Lima' }),
  baseContact({ id: 'c-3', name: 'Carla Dias' }),
];

function areaProps(viewMode: 'grid' | 'list' | 'table', extra: Record<string, unknown> = {}) {
  return {
    loading: false,
    contacts: contatos,
    viewMode,
    gridColumns: 4,
    groupByCompany: false,
    selectedIds: [] as string[],
    search: '',
    activeFiltersCount: 0,
    onToggleSelect: noop,
    onContactClick: vi.fn(),
    onOpenChat: noop,
    onEdit: noop,
    onDelete: noop,
    onSelectIds: noop,
    onAddContact: noop,
    getCRMData: () => null,
    ...extra,
  } as React.ComponentProps<typeof ContactContentArea>;
}

function itensNavegaveis(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-contact-nav="item"]'));
}

describe('Contatos · teclado nas três visões (ZD-068)', () => {
  it('lista: cada linha é focável e as setas movem o foco entre elas', () => {
    const onContactClick = vi.fn();
    const { container } = render(
      <ContactContentArea {...areaProps('list', { onContactClick })} />,
    );

    const itens = itensNavegaveis(container);
    expect(itens).toHaveLength(3);
    for (const item of itens) expect(item.getAttribute('tabindex')).toBe('0');

    itens[0].focus();
    const bloco = itens[0].closest('[data-contact-nav="lista"]') as HTMLElement;
    fireEvent.keyDown(bloco, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(itens[1]);

    fireEvent.keyDown(bloco, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(itens[0]);

    fireEvent.keyDown(bloco, { key: 'End' });
    expect(document.activeElement).toBe(itens[2]);

    fireEvent.keyDown(bloco, { key: 'Home' });
    expect(document.activeElement).toBe(itens[0]);
  });

  it('lista: Enter abre a ficha do contato focado', () => {
    const onContactClick = vi.fn();
    const { container } = render(
      <ContactContentArea {...areaProps('list', { onContactClick })} />,
    );

    const itens = itensNavegaveis(container);
    fireEvent.keyDown(itens[1], { key: 'Enter' });
    expect(onContactClick).toHaveBeenCalledWith('c-2');
  });

  it('grade: as setas também navegam entre os cards', () => {
    const { container } = render(<ContactContentArea {...areaProps('grid')} />);
    const itens = itensNavegaveis(container);
    expect(itens).toHaveLength(3);

    itens[0].focus();
    fireEvent.keyDown(itens[0].closest('[data-contact-nav="grade"]') as HTMLElement, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(itens[1]);
  });

  it('tabela: cada linha é focável e as setas andam na ordem das linhas', () => {
    const onContactClick = vi.fn();
    render(<ContactContentArea {...areaProps('table', { onContactClick })} />);

    const corpo = screen.getByTestId('contacts-table-body');
    const linhas = within(corpo).getAllByRole('row');
    for (const linha of linhas) expect(linha.getAttribute('tabindex')).toBe('0');

    linhas[0].focus();
    fireEvent.keyDown(corpo.closest('[data-contact-nav="tabela"]') as HTMLElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(linhas[1]);

    fireEvent.keyDown(linhas[1], { key: 'Enter' });
    expect(onContactClick).toHaveBeenCalledWith('c-2');
  });

  it('seta não rouba o teclado de controles internos (checkbox da linha)', () => {
    render(
      <ContactsTable
        contacts={contatos}
        selectedIds={[]}
        onSelectIds={noop}
        onOpenDetails={noop}
        onOpenChat={noop}
        onEdit={noop}
        onDelete={noop}
      />,
    );

    const corpo = screen.getByTestId('contacts-table-body');
    const checkbox = within(corpo).getByLabelText('Selecionar Ana Souza');
    checkbox.focus();
    fireEvent.keyDown(checkbox, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(checkbox);
  });
});