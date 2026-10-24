import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EnterDepartmentByCode } from '../EnterDepartmentByCode';

/**
 * E83 — "Entrar via Código" (card desacoplado).
 *
 * O card vive em módulo próprio e NÃO é montado no `TeamChatPanel` nesta PR
 * (o painel pertence à PR1987 — ver corpo da PR). O teste trava o contrato do
 * card em isolamento: input + botão "Entrar", resgate pela RPC (via
 * `useRedeemDepartmentInvite`) com o código em maiúsculas, `refreshProfile()`
 * sem reload, código curto que não dispara a RPC e a mensagem de erro tipada.
 */
const h = vi.hoisted(() => {
  const redeem = {
    isPending: false,
    error: null as Error | null,
    mutateAsync: vi.fn(() => Promise.resolve({ departmentId: 'dep-B' })),
  };
  return { redeem, refreshProfile: vi.fn(() => Promise.resolve()) };
});

vi.mock('@/hooks/team-chat/useRedeemDepartmentInvite', () => ({
  useRedeemDepartmentInvite: () => h.redeem,
}));
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ refreshProfile: h.refreshProfile }),
}));

describe('EnterDepartmentByCode — card "Entrar via Código" (E83)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.redeem.isPending = false;
    h.redeem.error = null;
    h.redeem.mutateAsync = vi.fn(() => Promise.resolve({ departmentId: 'dep-B' }));
    h.refreshProfile = vi.fn(() => Promise.resolve());
  });

  it('mostra o input de código e o botão Entrar', () => {
    render(<EnterDepartmentByCode />);

    expect(screen.getByLabelText('Código do convite')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('resgata com o código em maiúsculas e então atualiza o perfil (sem reload)', async () => {
    render(<EnterDepartmentByCode />);

    fireEvent.change(screen.getByLabelText('Código do convite'), { target: { value: 'ab12cd34' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(h.redeem.mutateAsync).toHaveBeenCalledWith({ code: 'AB12CD34' });
    });
    await waitFor(() => {
      expect(h.refreshProfile).toHaveBeenCalledTimes(1);
    });
  });

  it('não dispara a RPC com código curto', () => {
    render(<EnterDepartmentByCode />);

    fireEvent.change(screen.getByLabelText('Código do convite'), { target: { value: 'AB12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(h.redeem.mutateAsync).not.toHaveBeenCalled();
  });

  it('exibe a mensagem de erro tipada devolvida pelo resgate', () => {
    h.redeem.error = new Error('Código inválido ou expirado');
    render(<EnterDepartmentByCode />);

    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent('Código inválido ou expirado');
  });
});
