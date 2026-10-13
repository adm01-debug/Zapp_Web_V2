/**
 * UK-14 — contrato do primitivo `alert-dialog` (37 consumidores diretos).
 *
 * O Radix diferencia este diálogo do comum: o conteúdo tem papel `alertdialog`
 * e o Esc aciona o cancelamento (nunca uma ação destrutiva). Prova o papel,
 * o nome/descrição, o cancelar por Esc e o disparo real das ações.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

afterEach(cleanup);

function Confirmacao({ onConfirmar }: { onConfirmar: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger>Excluir conversa</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir conversa?</AlertDialogTitle>
          <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmar}>Excluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

describe('alert-dialog — contrato do primitivo (UK-14)', () => {
  it('abre com papel alertdialog, nome e descrição acessíveis', () => {
    render(<Confirmacao onConfirmar={() => {}} />);

    expect(screen.queryByRole('alertdialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir conversa' }));

    const caixa = screen.getByRole('alertdialog');
    expect(caixa).toBeInTheDocument();
    expect(caixa).toHaveAccessibleName('Excluir conversa?');
    expect(caixa).toHaveAccessibleDescription('Esta ação não pode ser desfeita.');
  });

  it('Esc cancela (não confirma) e fecha o diálogo', () => {
    const onConfirmar = vi.fn();
    render(<Confirmacao onConfirmar={onConfirmar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir conversa' }));

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' });

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('Cancelar fecha sem confirmar', () => {
    const onConfirmar = vi.fn();
    render(<Confirmacao onConfirmar={onConfirmar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir conversa' }));

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('a ação confirma uma vez e fecha', () => {
    const onConfirmar = vi.fn();
    render(<Confirmacao onConfirmar={onConfirmar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir conversa' }));

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
