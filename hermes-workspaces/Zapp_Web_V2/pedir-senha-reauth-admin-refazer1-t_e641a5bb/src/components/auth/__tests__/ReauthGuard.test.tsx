import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

const { mockReauthenticate, mockVerifyTOTP, mockFactors } = vi.hoisted(() => ({
  mockReauthenticate: vi.fn(),
  mockVerifyTOTP: vi.fn(),
  mockFactors: { current: [] as Array<{ id: string; status: string }> },
}));

vi.mock('@/hooks/auth/useReauthentication', () => ({
  useReauthentication: () => ({ reauthenticate: mockReauthenticate, isReauthenticating: false }),
}));

vi.mock('@/hooks/auth/useMFA', () => ({
  useMFA: () => ({ verifyTOTP: mockVerifyTOTP, loading: false }),
  useMfaFactors: () => ({ data: mockFactors.current, isLoading: false }),
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
});
