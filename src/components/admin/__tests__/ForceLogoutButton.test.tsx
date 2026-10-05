import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Mock supabase: ForceLogoutButton só deve falar com a Edge Function
// `revoke-auth-sessions`. Expor `from` como vi.fn() permite o teste de
// regressão que prova que NÃO há mais update de `profiles.session_invalidated_at`.
const { mockInvoke, mockFrom } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockFrom: vi.fn(),
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

import { ForceLogoutButton } from '@/components/admin/ForceLogoutButton';
import { toast } from 'sonner';

function renderButton() {
  return render(<ForceLogoutButton userId="11111111-1111-1111-1111-111111111111" userName="Ana Teste" />);
}

async function openAndConfirm() {
  // Abre o AlertDialog pelo trigger.
  fireEvent.click(screen.getByRole('button', { name: 'Forçar logout' }));
  // Confirma no botão de ação (o texto "Forçar logout" dentro do footer).
  const actionButton = await screen.findByRole('button', { name: /Forçar logout/ });
  fireEvent.click(actionButton);
  return actionButton;
}

describe('ForceLogoutButton — revogação real via Edge Function', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ data: { revoked: 2, scope: 'global' }, error: null });
  });

  it('invoca revoke-auth-sessions com payload exato (scope global + target_user_id) e mostra sucesso após 2xx', async () => {
    renderButton();
    await openAndConfirm();

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
    await openAndConfirm();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledTimes(1);
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('trata rejeição (rede/exceção) sem anunciar sucesso', async () => {
    mockInvoke.mockRejectedValue(new Error('network down'));
    renderButton();
    await openAndConfirm();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledTimes(1);
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('duplo clique não duplica a operação', async () => {
    let resolveInvoke: (value: unknown) => void;
    mockInvoke.mockImplementation(() => new Promise((resolve) => { resolveInvoke = resolve; }));

    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Forçar logout' }));
    const actionButton = await screen.findByRole('button', { name: /Forçar logout/ });

    // Dois cliques antes de a promise resolver — a trava síncrona (ref) deve
    // permitir apenas a primeira invocação.
    fireEvent.click(actionButton);
    fireEvent.click(actionButton);

    resolveInvoke!({ data: { revoked: 2, scope: 'global' }, error: null });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });
  });
});
