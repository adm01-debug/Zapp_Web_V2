import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { CommandPalette } from '@/components/ui/command-palette';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

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

describe('CommandPalette — devolução de foco sem DialogTrigger', () => {
  const fixtures: HTMLElement[] = [];
  let originalHref: string;

  beforeEach(() => {
    originalHref = window.location.href;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    try {
      cleanup();
      act(() => { vi.runOnlyPendingTimers(); });
    } finally {
      fixtures.splice(0).forEach((element) => element.remove());
      window.history.replaceState(null, '', originalHref);
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  const flushFocus = () => act(() => { vi.runOnlyPendingTimers(); });

  function originElement(kind: 'input' | 'button' | 'contenteditable' = 'input') {
    const element = document.createElement(kind === 'contenteditable' ? 'div' : kind);
    if (kind === 'contenteditable') {
      element.setAttribute('contenteditable', 'true');
      element.tabIndex = 0;
    }
    document.body.appendChild(element);
    fixtures.push(element);
    element.focus();
    expect(element).toHaveFocus();
    return element;
  }

  function controlledPalette(
    props: Omit<React.ComponentProps<typeof CommandPalette>, 'open' | 'onOpenChange'> = {},
    strict = false,
  ) {
    function setOpen(open: boolean) { view.rerender(tree(open)); }
    function tree(open: boolean) {
      const palette = <CommandPalette {...props} open={open} onOpenChange={setOpen} />;
      return strict ? <React.StrictMode>{palette}</React.StrictMode> : palette;
    }
    const view = render(tree(false));
    return {
      setOpen,
      open() {
        setOpen(true);
        flushFocus();
        const input = screen.getByRole('combobox', { name: 'Buscar comandos' });
        expect(input).toHaveFocus();
        return input;
      },
    };
  }

  for (const kind of ['input', 'button', 'contenteditable'] as const) {
    for (const close of ['Escape', 'Fechar', 'controle externo'] as const) {
      it(`devolve o foco ao ${kind} após ${close}`, () => {
        const origin = originElement(kind);
        const palette = controlledPalette();
        const input = palette.open();

        if (close === 'Escape') fireEvent.keyDown(input, { key: 'Escape' });
        else if (close === 'Fechar') fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
        else palette.setOpen(false); // mesmo contrato controlado usado pelo toggle do provider
        flushFocus();

        expect(screen.queryByRole('dialog', { name: 'Paleta de comandos' })).not.toBeInTheDocument();
        expect(origin).toHaveFocus();
      });
    }
  }

  const invalidOrigins: [string, (element: HTMLElement) => void][] = [
    ['removida', (element) => element.remove()],
    ['disabled', (element) => element.setAttribute('disabled', '')],
    ['inert', (element) => element.setAttribute('inert', '')],
    ['aria-disabled', (element) => element.setAttribute('aria-disabled', 'true')],
  ];
  for (const [reason, invalidate] of invalidOrigins) {
    it(`não tenta focar a origem ${reason}`, () => {
      const origin = originElement();
      const palette = controlledPalette();
      palette.open();
      const focus = vi.spyOn(origin, 'focus');
      invalidate(origin);

      palette.setOpen(false);
      flushFocus();

      expect(focus).not.toHaveBeenCalled();
      expect(origin).not.toHaveFocus();
    });
  }

  it('preserva o foco de outro diálogo aberto antes do callback de saída', () => {
    const origin = originElement();
    const palette = controlledPalette();
    palette.open();
    palette.setOpen(false);
    render(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Próximo diálogo</DialogTitle>
          <input aria-label="Destino do próximo diálogo" />
        </DialogContent>
      </Dialog>,
    );
    const destination = screen.getByRole('textbox', { name: 'Destino do próximo diálogo' });
    expect(destination).toHaveFocus();

    flushFocus();

    expect(destination).toHaveFocus();
    expect(origin).not.toHaveFocus();
  });

  for (const branch of ['action', 'navigation'] as const) {
    it(`não restaura após ${branch} enquanto o destino ainda vai receber foco`, () => {
      const origin = originElement();
      const callback = vi.fn();
      const palette = controlledPalette({
        navigationCommands: [{
          id: branch === 'navigation' ? 'nav-tasks' : 'action-local',
          title: 'Continuar operação', category: 'action',
          ...(branch === 'action' ? { action: callback } : {}),
        }],
        onNavigate: callback,
      });
      palette.open();

      fireEvent.click(screen.getByRole('option', { name: 'Continuar operação' }));
      flushFocus();

      expect(callback).toHaveBeenCalledTimes(1);
      if (branch === 'navigation') expect(callback).toHaveBeenCalledWith('tasks');
      expect(window.location.href).toBe(originalHref);
      expect(screen.queryByRole('dialog', { name: 'Paleta de comandos' })).not.toBeInTheDocument();
      expect(origin).not.toHaveFocus();
    });
  }

  it('não restaura o elemento da tela anterior quando a URL mudou', () => {
    const origin = originElement();
    const palette = controlledPalette();
    palette.open();
    const destination = new URL(window.location.href);
    destination.searchParams.set('view', 'tasks');
    window.history.replaceState(null, '', destination.href);

    palette.setOpen(false);
    flushFocus();

    expect(origin).not.toHaveFocus();
  });

  it('a limpeza do StrictMode não restaura enquanto a paleta continua aberta', () => {
    const origin = originElement();
    const palette = controlledPalette({}, true);
    const input = palette.open();
    expect(origin).not.toHaveFocus();
    expect(input).toHaveFocus();

    fireEvent.keyDown(input, { key: 'Escape' });
    flushFocus();

    expect(origin).toHaveFocus();
  });

  it('o callback da primeira abertura não consome a origem de uma reabertura rápida', () => {
    const firstOrigin = originElement();
    const palette = controlledPalette();
    palette.open();
    palette.setOpen(false);
    const nextOrigin = originElement('button');
    palette.setOpen(true);
    flushFocus();
    const input = screen.getByRole('combobox', { name: 'Buscar comandos' });
    expect(input).toHaveFocus();
    expect(firstOrigin).not.toHaveFocus();

    fireEvent.keyDown(input, { key: 'Escape' });
    flushFocus();

    expect(nextOrigin).toHaveFocus();
    expect(firstOrigin).not.toHaveFocus();
  });

  it('retorna à origem do diálogo subjacente que continua aberto', () => {
    render(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Diálogo de origem</DialogTitle>
          <input aria-label="Origem no diálogo" />
        </DialogContent>
      </Dialog>,
    );
    const origin = screen.getByRole('textbox', { name: 'Origem no diálogo' });
    expect(origin).toHaveFocus();
    const palette = controlledPalette();
    const input = palette.open();

    fireEvent.keyDown(input, { key: 'Escape' });
    flushFocus();

    expect(origin).toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'Diálogo de origem' })).toBeInTheDocument();
  });
});
