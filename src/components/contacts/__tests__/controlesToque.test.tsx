import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ContactCard } from '../ContactCard';
import { ContactListItem } from '../ContactListItem';
import { ContactsTable } from '../ContactsTable';
import { baseContact, noop } from './contactDeleteFixtures';

/**
 * t_0cba994c — controles que só apareciam no `:hover` (`opacity-0 group-hover:opacity-100`)
 * ficavam INACESSÍVEIS no toque: em mobile/tablet não existe `:hover`, então o checkbox
 * de seleção / a barra de ações / a coluna de ações nunca apareciam.
 *
 * O teste emula o toque pela mesma fonte que o componente usa em produção
 * (`usePointerCoarse`, que lê `window.matchMedia('(pointer: coarse)')` — o mock de
 * matchMedia é exatamente o que o DevTools altera ao emular touch). O que se prova:
 * no ponteiro grosso o controle NÃO nasce oculto e responde ao toque; no ponteiro fino
 * ele continua oculto até o hover/foco de teclado.
 */
function emularPonteiro(grosso: boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((q: string) => ({
    matches: grosso && q.includes('pointer: coarse'),
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return () => { window.matchMedia = original; };
}

/** Nasce oculto? Usa a mesma convenção de classe do componente (`opacity-0`). */
const nasceOculto = (el: Element) => /(^|\s)opacity-0(\s|$)/.test(el.className);

function itemProps() {
  return {
    contact: baseContact({ id: 'c-1' }),
    isSelected: false,
    onToggleSelect: vi.fn(),
    onOpenDetails: vi.fn(),
    onOpenChat: vi.fn(),
    onEdit: noop,
    onDelete: noop,
    index: 0,
  };
}

afterEach(() => cleanup());

describe('Contatos — checkbox de seleção do card alcançável no toque', () => {
  it('ponteiro grosso (toque): nasce visível e o toque seleciona', () => {
    const restaurar = emularPonteiro(true);
    const props = itemProps();
    render(<ContactCard {...props} />);

    const checkbox = screen.getByRole('checkbox', { name: /Selecionar/ });
    expect(nasceOculto(checkbox.parentElement!)).toBe(false);

    fireEvent.click(checkbox);
    expect(props.onToggleSelect).toHaveBeenCalledWith('c-1', true);
    restaurar();
  });

  it('ponteiro fino (desktop): segue oculto até hover/foco de teclado', () => {
    const restaurar = emularPonteiro(false);
    render(<ContactCard {...itemProps()} />);

    const wrapper = screen.getByRole('checkbox', { name: /Selecionar/ }).parentElement!;
    expect(nasceOculto(wrapper)).toBe(true);
    expect(wrapper.className).toContain('group-hover:opacity-100');
    expect(wrapper.className).toContain('focus-within:opacity-100');
    restaurar();
  });
});

describe('Contatos — barra de ações rápidas da lista alcançável no toque', () => {
  it('ponteiro grosso (toque): nasce visível e o toque abre o chat', () => {
    const restaurar = emularPonteiro(true);
    const props = itemProps();
    render(<ContactListItem {...props} />);

    const conversar = screen.getByTitle('Conversar');
    expect(nasceOculto(conversar.parentElement!)).toBe(false);

    fireEvent.click(conversar);
    expect(props.onOpenChat).toHaveBeenCalledWith('c-1');
    restaurar();
  });

  it('ponteiro fino (desktop): segue oculto até hover/foco de teclado', () => {
    const restaurar = emularPonteiro(false);
    render(<ContactListItem {...itemProps()} />);

    const wrapper = screen.getByTitle('Conversar').parentElement!;
    expect(nasceOculto(wrapper)).toBe(true);
    expect(wrapper.className).toContain('group-hover:opacity-100');
    expect(wrapper.className).toContain('focus-within:opacity-100');
    restaurar();
  });
});

describe('Contatos — coluna de ações da tabela alcançável no toque', () => {
  function renderTabela(onOpenChat = vi.fn()) {
    render(
      <ContactsTable
        contacts={[baseContact({ id: 'c-1' })]}
        selectedIds={[]}
        onSelectIds={noop}
        onOpenDetails={vi.fn()}
        onOpenChat={onOpenChat}
        onEdit={noop}
        onDelete={noop}
      />,
    );
    return onOpenChat;
  }

  it('ponteiro grosso (toque): nasce visível e o toque abre o chat', () => {
    const restaurar = emularPonteiro(true);
    const onOpenChat = renderTabela();

    const conversar = screen.getByTitle('Conversar');
    expect(nasceOculto(conversar.parentElement!)).toBe(false);

    fireEvent.click(conversar);
    expect(onOpenChat).toHaveBeenCalledWith('c-1');
    restaurar();
  });

  it('ponteiro fino (desktop): segue oculto até hover/foco de teclado', () => {
    const restaurar = emularPonteiro(false);
    renderTabela();

    const wrapper = screen.getByTitle('Conversar').parentElement!;
    expect(nasceOculto(wrapper)).toBe(true);
    expect(wrapper.className).toContain('group-hover:opacity-100');
    expect(wrapper.className).toContain('focus-within:opacity-100');
    restaurar();
  });
});
