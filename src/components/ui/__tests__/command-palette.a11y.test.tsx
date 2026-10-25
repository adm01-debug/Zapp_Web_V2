import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { CommandPalette } from '@/components/ui/command-palette';

// a11y do ⌘K: o campo de busca é um `combobox` nomeado que aponta para a lista
// (`listbox`) e anuncia o item realçado (`aria-activedescendant`); cada item é uma
// `option` com `aria-selected`. Monta-se o componente REAL e dispara-se o teclado do
// usuário (foco no input, que é como a paleta recebe as setas).
function renderPalette(props: Record<string, unknown> = {}) {
  const onNavigate = vi.fn();
  const onOpenChange = vi.fn();
  render(<CommandPalette open onOpenChange={onOpenChange} onNavigate={onNavigate} {...props} />);
  const input = screen.getByRole('combobox');
  input.focus();
  return { onNavigate, onOpenChange, input };
}

const digitar = (input: HTMLElement, texto: string) =>
  fireEvent.change(input, { target: { value: texto } });

describe('CommandPalette — campo e lista anunciados (combobox/listbox)', () => {
  it('o campo é combobox nomeado que aponta para a lista e para o item ativo', () => {
    const { input } = renderPalette();

    expect(input).toHaveAttribute('aria-label', 'Buscar comandos');
    expect(input).toHaveAttribute('aria-expanded', 'true');

    const listbox = screen.getByRole('listbox', { name: 'Acesso rápido' });
    expect(input).toHaveAttribute('aria-controls', listbox.id);

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(5);
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('as setas mudam o aria-activedescendant e o aria-selected para o item seguinte', () => {
    const { input } = renderPalette();
    const options = screen.getAllByRole('option');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1].id);
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('ao navegar com as setas, o item realçado é rolado para dentro da vista', () => {
    const scrollSpy = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true, writable: true, value: scrollSpy,
    });
    try {
      const { input } = renderPalette();
      const antes = scrollSpy.mock.calls.length;

      fireEvent.keyDown(input, { key: 'ArrowDown' });

      expect(scrollSpy.mock.calls.length).toBeGreaterThan(antes);
      expect(scrollSpy).toHaveBeenLastCalledWith({ block: 'nearest' });
    } finally {
      Object.defineProperty(Element.prototype, 'scrollIntoView', {
        configurable: true, writable: true, value: original,
      });
    }
  });

  it('o botão de limpar tem nome acessível e não submete formulário', () => {
    const { input } = renderPalette();

    digitar(input, 'inbox');

    const limpar = screen.getByRole('button', { name: 'Limpar busca' });
    expect(limpar).toHaveAttribute('type', 'button');
  });

  it('anuncia numa região viva quantos itens a consulta encontrou (dois resultados)', () => {
    const { input } = renderPalette({
      customCommands: [
        { id: 'qzx1', title: 'Item qzx alfa', category: 'action' },
        { id: 'qzx2', title: 'Item qzx beta', category: 'action' },
      ],
    });

    digitar(input, 'qzx');

    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent('2 resultados');
  });

  it('com um único resultado a contagem sai no singular', () => {
    const { input } = renderPalette({
      customCommands: [{ id: 'qzx1', title: 'Item qzx alfa', category: 'action' }],
    });

    digitar(input, 'qzx');

    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('1 resultado');
  });

  it('os itens da consulta também são options com o realçado marcado', () => {
    const { input } = renderPalette();

    digitar(input, 'relatórios');

    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
  });
});

describe('CommandPalette — sem violações de axe', () => {
  it('acesso rápido (busca vazia) sem violações', async () => {
    render(<CommandPalette open onOpenChange={vi.fn()} onNavigate={vi.fn()} />);
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('resultados de busca sem violações', async () => {
    render(
      <CommandPalette
        open
        onOpenChange={vi.fn()}
        onNavigate={vi.fn()}
        customCommands={[
          { id: 'axe1', title: 'Caneca Alfa', category: 'action' },
          { id: 'axe2', title: 'Caneca Beta', category: 'action' },
        ]}
      />
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'caneca' } });
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe('CommandPalette — ids únicos e estrutura do listbox', () => {
  it('comando em "Recentes" e em "Acesso rápido" não duplica o id da option', () => {
    localStorage.setItem('zapp-recent-modules', JSON.stringify(['chat']));
    try {
      renderPalette();
      const options = screen.getAllByRole('option');
      expect(options.filter((o) => o.textContent?.includes('Inbox'))).toHaveLength(2);
      const ids = options.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      localStorage.removeItem('zapp-recent-modules');
    }
  });

  it('buscas recentes ficam fora do listbox', () => {
    renderPalette({ recentSearches: ['caneca'] });
    const listbox = screen.getByRole('listbox', { name: 'Acesso rápido' });
    expect(listbox).not.toContainElement(screen.getByText('caneca'));
  });
});
