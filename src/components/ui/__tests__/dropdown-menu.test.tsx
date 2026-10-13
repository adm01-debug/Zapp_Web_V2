/**
 * UK-14 — contrato do primitivo `dropdown-menu` (40 consumidores diretos).
 *
 * Prova o menu REAL do projeto: o gatilho anuncia `aria-haspopup="menu"` e
 * `aria-expanded`, abre por ponteiro, os itens têm papel `menuitem`, o item de
 * seleção marca `aria-checked`, o Esc fecha e um item dispara `onSelect`.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

// Pointer capture não existe no jsdom; o Radix usa ao abrir o menu.
if (typeof Element.prototype.hasPointerCapture !== 'function') {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

afterEach(cleanup);

function abrir(nome: string) {
  fireEvent.pointerDown(screen.getByRole('button', { name: nome }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  });
}

function Exemplo({ onArquivar }: { onArquivar: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Ações</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onArquivar}>Arquivar</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={true}>Fixar</DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe('dropdown-menu — contrato do primitivo (UK-14)', () => {
  it('o gatilho anuncia o menu e o estado fechado', () => {
    render(<Exemplo onArquivar={() => {}} />);

    const gatilho = screen.getByRole('button', { name: 'Ações' });
    expect(gatilho).toHaveAttribute('aria-haspopup', 'menu');
    expect(gatilho).toHaveAttribute('aria-expanded', 'false');
  });

  it('abre por ponteiro com papel menu e itens menuitem', () => {
    render(<Exemplo onArquivar={() => {}} />);
    const gatilho = screen.getByRole('button', { name: 'Ações' });
    abrir('Ações');

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Arquivar' })).toBeInTheDocument();
    // Referência guardada antes de abrir: o menu é modal e o Radix marca o
    // restante da página como `aria-hidden`, escondendo o gatilho do a11y.
    expect(gatilho).toHaveAttribute('aria-expanded', 'true');
  });

  it('o item de seleção expõe aria-checked', () => {
    render(<Exemplo onArquivar={() => {}} />);
    abrir('Ações');

    const fixar = screen.getByRole('menuitemcheckbox', { name: 'Fixar' });
    expect(fixar).toHaveAttribute('aria-checked', 'true');
  });

  it('acionar um item dispara onSelect e fecha o menu', () => {
    const onArquivar = vi.fn();
    render(<Exemplo onArquivar={onArquivar} />);
    abrir('Ações');

    fireEvent.click(screen.getByRole('menuitem', { name: 'Arquivar' }));

    expect(onArquivar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Esc fecha o menu', () => {
    render(<Exemplo onArquivar={() => {}} />);
    abrir('Ações');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
  });
});
