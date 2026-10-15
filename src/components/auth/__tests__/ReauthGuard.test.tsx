import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

const { mockReauthenticate, mockVerifyTOTP, mockFactors, mockFactorsError, mockRefetchFactors } = vi.hoisted(() => ({
  mockReauthenticate: vi.fn(),
  mockVerifyTOTP: vi.fn(),
  mockFactors: { current: [] as Array<{ id: string; status: string }> },
  mockFactorsError: { current: false },
  mockRefetchFactors: vi.fn(),
}));

vi.mock('@/hooks/auth/useReauthentication', () => ({
  useReauthentication: () => ({ reauthenticate: mockReauthenticate, isReauthenticating: false }),
}));

vi.mock('@/hooks/auth/useMFA', () => ({
  useMFA: () => ({ verifyTOTP: mockVerifyTOTP, loading: false }),
  useMfaFactors: () => ({
    data: mockFactors.current,
    isLoading: false,
    isError: mockFactorsError.current,
    refetch: mockRefetchFactors,
  }),
}));

import { ReauthGuard } from '@/components/auth/ReauthDialog';

function renderGuard(onConfirmed = vi.fn()) {
  render(
    <ReauthGuard
      open
      onOpenChange={vi.fn()}
      actionLabel="Remover papel"
      onConfirmed={onConfirmed}
    />,
  );
  return onConfirmed;
}

describe('ReauthGuard — método escolhido pela sessão (t_5e689954)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFactors.current = [];
    mockFactorsError.current = false;
    mockReauthenticate.mockResolvedValue({ success: true });
    mockVerifyTOTP.mockResolvedValue(undefined);
  });

  it('sem 2FA pede a senha e só executa depois de confirmar', async () => {
    const onConfirmed = renderGuard();

    expect(screen.getByLabelText('Senha Atual')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Senha Atual'), { target: { value: 'segredo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    expect(mockReauthenticate).toHaveBeenCalledWith('segredo');
    expect(mockVerifyTOTP).not.toHaveBeenCalled();
  });

  it('senha errada não executa a ação e mostra erro com role=alert', async () => {
    mockReauthenticate.mockResolvedValue({ success: false, error: 'Senha incorreta' });
    const onConfirmed = renderGuard();

    fireEvent.change(screen.getByLabelText('Senha Atual'), { target: { value: 'errada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Senha incorreta');
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it('com TOTP verificado pede o código e usa mfa.challenge/verify (sem novo login)', async () => {
    mockFactors.current = [{ id: 'factor-1', status: 'verified' }];
    const onConfirmed = renderGuard();

    // Não pede senha: um novo login derrubaria o AAL2 da sessão.
    expect(screen.queryByLabelText('Senha Atual')).toBeNull();

    fireEvent.change(screen.getByLabelText('Código de Verificação (2FA)'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    expect(mockVerifyTOTP).toHaveBeenCalledWith('factor-1', '123456');
    expect(mockReauthenticate).not.toHaveBeenCalled();
  });

  it('falha na consulta de fatores bloqueia a ação em vez de cair em senha (ponto 1)', async () => {
    mockFactorsError.current = true;
    const onConfirmed = renderGuard();

    // Nada de campo de senha: um novo login derrubaria o AAL2 de quem tem MFA.
    expect(screen.queryByLabelText('Senha Atual')).toBeNull();
    expect(screen.queryByLabelText('Código de Verificação (2FA)')).toBeNull();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('bloqueada por segurança');
    expect(mockReauthenticate).not.toHaveBeenCalled();
    expect(onConfirmed).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(mockRefetchFactors).toHaveBeenCalledTimes(1);
    expect(mockReauthenticate).not.toHaveBeenCalled();
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it('código MFA inválido mostra alerta e não executa a ação (ponto 4)', async () => {
    mockFactors.current = [{ id: 'factor-1', status: 'verified' }];
    mockVerifyTOTP.mockRejectedValue(new Error('Invalid code'));
    const onConfirmed = renderGuard();

    fireEvent.change(screen.getByLabelText('Código de Verificação (2FA)'), {
      target: { value: '000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Código inválido');
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(mockReauthenticate).not.toHaveBeenCalled();
  });

  it('onConfirmed que lança mostra alerta genérico (ponto 4)', async () => {
    const onConfirmed = vi.fn().mockRejectedValue(new Error('boom'));
    renderGuard(onConfirmed);

    fireEvent.change(screen.getByLabelText('Senha Atual'), { target: { value: 'segredo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível concluir a ação');
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  it('cancelar devolve o foco ao gatilho (ponto 3)', async () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Disparar</button>
          {open && (
            <ReauthGuard
              open
              onOpenChange={(next) => { if (!next) setOpen(false); }}
              actionLabel="Remover papel"
              onConfirmed={vi.fn()}
            />
          )}
        </>
      );
    }
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: 'Disparar' });
    trigger.focus();
    fireEvent.click(trigger);

    await screen.findByLabelText('Senha Atual');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('confirmar com sucesso devolve o foco ao gatilho (ponto 3)', async () => {
    const onConfirmed = vi.fn().mockResolvedValue(undefined);
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Disparar</button>
          {open && (
            <ReauthGuard
              open
              onOpenChange={(next) => { if (!next) setOpen(false); }}
              actionLabel="Remover papel"
              onConfirmed={onConfirmed}
            />
          )}
        </>
      );
    }
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: 'Disparar' });
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.change(await screen.findByLabelText('Senha Atual'), { target: { value: 'segredo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
