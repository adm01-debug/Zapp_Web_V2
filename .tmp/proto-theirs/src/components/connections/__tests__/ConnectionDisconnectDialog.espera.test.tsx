/**
 * t_53fc1ddb — estados de espera do desconectar de conexão (paridade V3 -> V2).
 *
 * Antes: o diálogo de "Desconectar" fechava no clique, sem nenhum sinal de que a
 * ação estava em andamento — o operador podia achar que nada aconteceu e clicar
 * de novo. Aqui o componente REAL é renderizado e prova-se que, enquanto o
 * desconectar está em voo (`pending`), o diálogo mantém o spinner "Desconectando…"
 * e trava tanto a ação quanto o Cancelar.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionDisconnectDialog } from '../ConnectionDisconnectDialog';

function renderDialog(pending: boolean) {
  return render(
    <ConnectionDisconnectDialog
      open
      onOpenChange={vi.fn()}
      connectionName="Principal"
      phoneNumber="+55 11 90000-0000"
      pending={pending}
      onConfirm={vi.fn()}
    />,
  );
}

describe('ConnectionDisconnectDialog — estado de espera (t_53fc1ddb)', () => {
  it('em repouso: ação "Desconectar" e "Cancelar" habilitados', () => {
    renderDialog(false);
    expect(screen.getByRole('button', { name: 'Desconectar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled();
  });

  it('em voo: mostra "Desconectando…" e trava a ação e o Cancelar', () => {
    renderDialog(true);
    const acao = screen.getByRole('button', { name: /Desconectando/ });
    expect(acao).toBeDisabled();
    expect(acao).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    // O rótulo de repouso some enquanto aguarda.
    expect(screen.queryByRole('button', { name: 'Desconectar' })).toBeNull();
  });
});
