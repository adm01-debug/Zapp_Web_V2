import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReauthDialog } from '@/components/auth/ReauthDialog';
import type { ReauthOutcome } from '@/hooks/auth/useReauthentication';

/**
 * O 2º fator na reautenticação: só aparece quando o hook pede o código
 * (usuário com TOTP verificado e sessão ainda em AAL1), e a senha vai junto —
 * a sessão corrente sobe para AAL2 sem login novo.
 */
describe('ReauthDialog — código do autenticador', () => {
  it('abre o campo do código quando a reautenticação pede o 2º fator', async () => {
    const onConfirm = vi.fn(async (): Promise<ReauthOutcome> => ({
      ok: false,
      motivo: 'codigo_necessario',
      mensagem: 'Digite o código de 6 dígitos do seu aplicativo autenticador.',
      precisaCodigo: true,
    }));

    render(
      <ReauthDialog
        open
        onOpenChange={() => {}}
        actionLabel="Alterar Senha"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );

    expect(screen.queryByLabelText('Código do autenticador')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Senha Atual'), { target: { value: 'senha-certa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(screen.getByLabelText('Código do autenticador')).toBeInTheDocument());
    expect(
      screen.getByText('Digite o código de 6 dígitos do seu aplicativo autenticador.'),
    ).toBeInTheDocument();
  });

  it('reenvia senha + código e conclui quando o código é aceito', async () => {
    const onConfirm = vi
      .fn<(password: string, codigo: string) => Promise<ReauthOutcome>>()
      .mockResolvedValueOnce({
        ok: false,
        motivo: 'codigo_necessario',
        mensagem: 'Digite o código de 6 dígitos do seu aplicativo autenticador.',
        precisaCodigo: true,
      })
      .mockResolvedValueOnce({ ok: true });

    render(
      <ReauthDialog
        open
        onOpenChange={() => {}}
        actionLabel="Alterar Senha"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('Senha Atual'), { target: { value: 'senha-certa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(screen.getByLabelText('Código do autenticador')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Código do autenticador'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(onConfirm).toHaveBeenLastCalledWith('senha-certa', '123456'));
    // Sucesso limpa o formulário: senha e código não ficam no state.
    const senha = screen.getByLabelText('Senha Atual') as HTMLInputElement;
    await waitFor(() => expect(senha.value).toBe(''));
    expect(screen.queryByLabelText('Código do autenticador')).not.toBeInTheDocument();
  });

  it('não deixa caractere não numérico entrar no código', async () => {
    const onConfirm = vi.fn(async (): Promise<ReauthOutcome> => ({
      ok: false,
      motivo: 'codigo_necessario',
      mensagem: 'Digite o código de 6 dígitos do seu aplicativo autenticador.',
      precisaCodigo: true,
    }));

    render(
      <ReauthDialog
        open
        onOpenChange={() => {}}
        actionLabel="Alterar Senha"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('Senha Atual'), { target: { value: 'senha-certa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(screen.getByLabelText('Código do autenticador')).toBeInTheDocument());

    const campo = screen.getByLabelText('Código do autenticador') as HTMLInputElement;
    fireEvent.change(campo, { target: { value: 'a1b2c3d4e5f6' } });

    expect(campo.value).toBe('123456');
  });

  it('código incorreto mostra a mensagem própria e mantém o campo', async () => {
    const onConfirm = vi.fn(async (): Promise<ReauthOutcome> => ({
      ok: false,
      motivo: 'codigo_incorreto',
      mensagem: 'Código do autenticador incorreto. Confira o código e tente novamente.',
      precisaCodigo: true,
    }));

    render(
      <ReauthDialog
        open
        onOpenChange={() => {}}
        actionLabel="Alterar Senha"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('Senha Atual'), { target: { value: 'senha-certa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(screen.getByLabelText('Código do autenticador')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Código do autenticador'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(
        screen.getByText('Código do autenticador incorreto. Confira o código e tente novamente.'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Código do autenticador')).toBeInTheDocument();
    expect(screen.queryByText('Senha incorreta')).not.toBeInTheDocument();
  });

  it('com o campo aberto, não envia sem o código', async () => {
    const onConfirm = vi.fn(async (): Promise<ReauthOutcome> => ({
      ok: false,
      motivo: 'codigo_necessario',
      mensagem: 'Digite o código de 6 dígitos do seu aplicativo autenticador.',
      precisaCodigo: true,
    }));

    render(
      <ReauthDialog
        open
        onOpenChange={() => {}}
        actionLabel="Alterar Senha"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('Senha Atual'), { target: { value: 'senha-certa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(screen.getByLabelText('Código do autenticador')).toBeInTheDocument());
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(screen.getByText('Digite o código do autenticador')).toBeInTheDocument());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
