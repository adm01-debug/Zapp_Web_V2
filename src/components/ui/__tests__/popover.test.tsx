/**
 * UK-14 — contrato do primitivo `popover` (43 consumidores diretos).
 *
 * Prova o popover REAL do projeto: o gatilho anuncia `aria-expanded`, o painel
 * é montado em portal só quando aberto, fecha com Esc e fecha ao clicar fora.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

if (typeof Element.prototype.hasPointerCapture !== 'function') {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

afterEach(cleanup);

function Exemplo() {
  return (
    <div>
      <Popover>
        <PopoverTrigger>Abrir detalhes</PopoverTrigger>
        <PopoverContent>Conteúdo do popover</PopoverContent>
      </Popover>
      <button type="button">Fora</button>
    </div>
  );
}

function abrir() {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Abrir detalhes' }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Abrir detalhes' }));
}

describe('popover — contrato do primitivo (UK-14)', () => {
  it('o gatilho anuncia o estado fechado e o conteúdo não é montado', () => {
    render(<Exemplo />);

    expect(screen.getByRole('button', { name: 'Abrir detalhes' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Conteúdo do popover')).toBeNull();
  });

  it('abre montando o conteúdo e marcando aria-expanded', () => {
    render(<Exemplo />);
    abrir();

    expect(screen.getByText('Conteúdo do popover')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir detalhes' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('Esc fecha o popover', () => {
    render(<Exemplo />);
    abrir();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' });

    expect(screen.queryByText('Conteúdo do popover')).toBeNull();
  });

  it('clicar fora fecha o popover', async () => {
    render(<Exemplo />);
    abrir();

    const fora = screen.getByRole('button', { name: 'Fora' });
    // O Radix ouve `pointerdown` no documento e `focusin` fora do painel para
    // dispensar; no jsdom disparamos os dois para cobrir as duas vias.
    fireEvent.pointerDown(fora, { button: 0, pointerType: 'mouse' });
    fireEvent.mouseDown(fora);
    fora.focus();

    await waitFor(() => expect(screen.queryByText('Conteúdo do popover')).toBeNull());
  });
});
