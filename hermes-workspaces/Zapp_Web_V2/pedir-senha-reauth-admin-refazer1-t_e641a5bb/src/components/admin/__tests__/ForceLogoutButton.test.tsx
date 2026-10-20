import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// Mock supabase: ForceLogoutButton só deve falar com a Edge Function
// `revoke-auth-sessions`. Expor `from` como vi.fn() permite o teste de
// regressão que prova que NÃO há mais update de `profiles.session_invalidated_at`.
const { mockInvoke, mockFrom, mockReauthenticate, mockVerifyTOTP } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockFrom: vi.fn(),
  mockReauthenticate: vi.fn(),
  mockVerifyTOTP: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mockFrom,
    functions: { invoke: mockInvoke },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

// Sessão sem 2FA: o ReauthGuard pede a senha pelo useReauthentication.
vi.mock('@/hooks/auth/useReauthentication', () => ({
  useReauthentication: () => ({ reauthenticate: mockReauthenticate, isReauthenticating: false }),
}));

vi.mock('@/hooks/auth/useMFA', () => ({
  useMFA: () => ({ verifyTOTP: mockVerifyTOTP, loading: false }),
  useMfaFactors: () => ({ data: [], isLoading: false }),
}));

import { ForceLogoutButton } from '@/components/admin/ForceLogoutButton';
import { toast } from 'sonner';

function renderButton() {
  return render(<ForceLogoutButton userId="11111111-1111-1111-1111-111111111111" userName="Ana Teste" />);
}

// t_5e689954: o diálogo de confirmação só ARMA a revogação; ela espera a
// re-autenticação.
async function armForceLogout() {
  fireEvent.click(screen.getByRole('button', { name: 'Forçar logout' }));
  const actionButton = await screen.findByRole('button', { name: /Forçar logout/ });
  fireEvent.click(actionButton);
  return actionButton;
}

async function submitReauth(value = 'senha-correta') {
  const input = await screen.findByLabelText('Senha Atual');
  fireEvent.change(input, { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
}

describe('ForceLogoutButton — revogação real via Edge Function', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ data: { revoked: 2, scope: 'global' }, error: null });
    mockReauthenticate.mockResolvedValue({ success: true });
  });

  it('só revoga depois da re-autenticação confirmada', async () => {
    renderButton();
    await armForceLogout();

    // Ação armada, identidade ainda não confirmada: nada de Edge Function.
    expect(mockInvoke).not.toHaveBeenCalled();

    await submitReauth();

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });
  });

  it('senha incorreta mantém a ação bloqueada e mostra erro com role=alert', async () => {
    mockReauthenticate.mockResolvedValue({ success: false, error: 'Senha incorreta' });
    renderButton();
    await armForceLogout();
    await submitReauth('errada');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Senha incorreta');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('invoca revoke-auth-sessions com payload exato (scope global + target_user_id) e mostra sucesso após 2xx', async () => {
    renderButton();
    await armForceLogout();
    await submitReauth();

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    expect(mockInvoke).toHaveBeenCalledWith('revoke-auth-sessions', {
      body: { scope: 'global', target_user_id: '11111111-1111-1111-1111-111111111111' },
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledTimes(1);
    });
    expect(toast.error).not.toHaveBeenCalled();
    // Prova de regressão: nunca mais atualizar apenas session_invalidated_at.
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('não mostra sucesso quando a Edge Function devolve erro (write parcial/erro)', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'Forbidden' } });
    renderButton();
    await armForceLogout();
    await submitReauth();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledTimes(1);
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('trata rejeição (rede/exceção) sem anunciar sucesso', async () => {
    mockInvoke.mockRejectedValue(new Error('network down'));
    renderButton();
    await armForceLogout();
    await submitReauth();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledTimes(1);
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('duplo clique não duplica a operação', async () => {
    let resolveInvoke: (value: unknown) => void;
    mockInvoke.mockImplementation(() => new Promise((resolve) => { resolveInvoke = resolve; }));

    renderButton();
    await armForceLogout();
    const input = await screen.findByLabelText('Senha Atual');
    fireEvent.change(input, { target: { value: 'senha-correta' } });
    const confirm = screen.getByRole('button', { name: 'Confirmar' });

    // Dois cliques antes de a promise resolver — a trava síncrona deve permitir
    // apenas a primeira invocação.
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      resolveInvoke!({ data: { revoked: 2, scope: 'global' }, error: null });
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
});
