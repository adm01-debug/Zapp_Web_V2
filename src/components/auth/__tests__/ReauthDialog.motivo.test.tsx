import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReauthDialog } from '@/components/auth/ReauthDialog';
import type { ReauthOutcome } from '@/hooks/auth/useReauthentication';

describe('ReauthDialog — motivo da falha no campo', () => {
  const openDialog = (onConfirm: (p: string) => Promise<ReauthOutcome>) => {
    render(
      <ReauthDialog
        open
        onOpenChange={() => {}}
        actionLabel="Alterar Senha"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
  };

  it('mostra a mensagem do bloqueio em vez de "Senha incorreta"', async () => {
    openDialog(async () => ({
      ok: false,
      motivo: 'conta_bloqueada',
      mensagem: 'Conta temporariamente bloqueada. Tente novamente mais tarde.',
    }));

    fireEvent.change(screen.getByLabelText('Senha Atual'), { target: { value: 'qualquer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(
        screen.getByText('Conta temporariamente bloqueada. Tente novamente mais tarde.'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('Senha incorreta')).not.toBeInTheDocument();
  });

  it('mostra a mensagem de indisponibilidade da Edge', async () => {
    openDialog(async () => ({
      ok: false,
      motivo: 'indisponivel',
      mensagem: 'Reautenticação temporariamente indisponível. Tente novamente em instantes.',
    }));

    fireEvent.change(screen.getByLabelText('Senha Atual'), { target: { value: 'qualquer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(
        screen.getByText('Reautenticação temporariamente indisponível. Tente novamente em instantes.'),
      ).toBeInTheDocument(),
    );
  });

  it('limpa o campo quando a reautenticação é bem-sucedida', async () => {
    openDialog(async () => ({ ok: true }));

    const input = screen.getByLabelText('Senha Atual') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'senha-certa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(input.value).toBe(''));
    expect(screen.queryByText('Senha incorreta')).not.toBeInTheDocument();
  });

  it('volta para "Senha incorreta" só quando é senha incorreta', async () => {
    openDialog(async () => ({ ok: false, motivo: 'senha_incorreta', mensagem: 'Senha incorreta' }));

    fireEvent.change(screen.getByLabelText('Senha Atual'), { target: { value: 'errada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(screen.getByText('Senha incorreta')).toBeInTheDocument());
  });
});
