/**
 * UK-14 — contrato do primitivo `sheet` (14 consumidores diretos).
 *
 * O `sheet` é o Radix Dialog com variantes de lado (`side`). Prova: monta com
 * papel `dialog`, escolhe a classe do lado, fecha com Esc e traz o botão X com
 * nome em pt-BR ("Fechar") conforme UI-03 — hoje ainda diz "Close".
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

afterEach(cleanup);

function Painel({ side }: { side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <Sheet>
      <SheetTrigger>Abrir painel</SheetTrigger>
      <SheetContent side={side}>
        <SheetHeader>
          <SheetTitle>Filtros</SheetTitle>
          <SheetDescription>Refine a lista de conversas.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  );
}

describe('sheet — contrato do primitivo (UK-14)', () => {
  it('não monta fechado e abre com papel dialog e nome acessível', () => {
    render(<Painel />);

    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir painel' }));

    const painel = screen.getByRole('dialog');
    expect(painel).toBeInTheDocument();
    expect(painel).toHaveAccessibleName('Filtros');
  });

  it('o lado padrão é "right" e a prop side troca a classe de posição', () => {
    const { unmount } = render(<Painel />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir painel' }));
    expect(screen.getByRole('dialog').className).toContain('right-0');
    unmount();

    render(<Painel side="left" />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir painel' }));
    const painel = screen.getByRole('dialog');
    expect(painel.className).toContain('left-0');
    expect(painel.className).not.toContain('right-0');
  });

  it('fecha com Esc devolvendo o foco ao gatilho', async () => {
    render(<Painel />);
    const gatilho = screen.getByRole('button', { name: 'Abrir painel' });
    // Ver comentário em dialog.test.tsx: no jsdom é preciso focar o gatilho
    // antes para o FocusScope do Radix lembrar para onde devolver o foco.
    gatilho.focus();
    fireEvent.click(gatilho);

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(gatilho).toHaveFocus());
  });

  it.fails(
    'o botão de fechar é anunciado em pt-BR ("Fechar") — hoje o componente diz "Close" (sheet.tsx:62)',
    () => {
      render(<Painel />);
      fireEvent.click(screen.getByRole('button', { name: 'Abrir painel' }));

      expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument();
    }
  );
});
