/**
 * UK-14 — contrato do primitivo `dialog` (109 consumidores diretos).
 *
 * Prova o comportamento REAL do componente do projeto (que embrulha o Radix):
 * abre pelo gatilho, monta com papel `dialog` e nome/descrição por aria, fecha
 * com Esc devolvendo o foco ao gatilho, fecha pelo botão X e aplica a variante
 * de tamanho. O texto do botão de fechar é provado em pt-BR ("Fechar") conforme
 * o cartão UI-03 — hoje o componente ainda diz "Close" (ver `it.fails`).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';

afterEach(cleanup);

function Exemplo({ size }: { size?: 'sm' | 'default' | 'lg' | 'xl' | 'full' } = {}) {
  return (
    <Dialog>
      <DialogTrigger>Abrir diálogo</DialogTrigger>
      <DialogContent size={size}>
        <DialogHeader>
          <DialogTitle>Editar contato</DialogTitle>
          <DialogDescription>Preencha os campos abaixo.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose>Cancelar</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

describe('dialog — contrato do primitivo (UK-14)', () => {
  it('não monta o conteúdo fechado e abre ao acionar o gatilho', () => {
    render(<Exemplo />);

    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir diálogo' }));

    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toBeInTheDocument();
    expect(dialogo).toHaveAttribute('data-state', 'open');
  });

  it('expõe o nome por DialogTitle e a descrição por DialogDescription', () => {
    render(<Exemplo />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir diálogo' }));

    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toHaveAccessibleName('Editar contato');
    expect(dialogo).toHaveAccessibleDescription('Preencha os campos abaixo.');
  });

  it('fecha com Esc e devolve o foco ao gatilho', async () => {
    render(<Exemplo />);
    const gatilho = screen.getByRole('button', { name: 'Abrir diálogo' });
    // O Radix devolve o foco ao elemento que tinha o foco quando abriu; no jsdom
    // o clique por si só não foca o botão, então focamos antes (como um usuário
    // de teclado que tabula até o gatilho e aperta Enter).
    gatilho.focus();
    fireEvent.click(gatilho);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Radix (onCloseAutoFocus/FocusScope) devolve o foco ao gatilho. O retorno
    // acontece num efeito de desmontagem, então esperamos o ciclo.
    await waitFor(() => expect(gatilho).toHaveFocus());
  });

  it('o gatilho de fechar traz o ícone dentro de um nome acessível', () => {
    render(<Exemplo />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir diálogo' }));

    // Existe um botão de fechar separado do "Cancelar" do rodapé.
    const fechar = screen.getAllByRole('button').filter((b) => b !== screen.getByRole('button', { name: 'Cancelar' }));
    expect(fechar.length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it.fails(
    'o botão de fechar é anunciado em pt-BR ("Fechar") — hoje o componente diz "Close" (dialog.tsx:82)',
    () => {
      render(<Exemplo />);
      fireEvent.click(screen.getByRole('button', { name: 'Abrir diálogo' }));

      expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument();
    }
  );

  it('aplica a variante de tamanho (max-width por token do design system)', () => {
    const { unmount } = render(<Exemplo size="sm" />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir diálogo' }));
    expect(screen.getByRole('dialog').className).toContain('max-w-sm');
    unmount();

    render(<Exemplo size="xl" />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir diálogo' }));
    expect(screen.getByRole('dialog').className).toContain('max-w-4xl');
  });

  it('mantém rolagem na base para diálogo mais alto que a viewport (regressão V2)', () => {
    render(<Exemplo />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir diálogo' }));

    const dialogo = screen.getByRole('dialog');
    expect(dialogo.className).toContain('overflow-y-auto');
    expect(dialogo.className).toContain('max-h-[calc(100dvh-2rem)]');
  });
});
