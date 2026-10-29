/**
 * Saída e retomada do /2fa:
 * - a tela de erro tem 'Tentar de novo' que refaz a leitura de assurance;
 * - o ÚNICO botão de saída encerra a sessão (signOut) antes de voltar ao login —
 *   sem o signOut a pessoa seguia em aal1 e o ProtectedRoute a devolvia ao /2fa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TwoFactorAuth from '@/pages/TwoFactorAuth';

const navigate = vi.hoisted(() => vi.fn());
const getAssuranceLevel = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());
// Identidade estável: um objeto novo a cada render mudaria a dep [user] do
// efeito de checagem e o efeito voltaria a rodar (o mock não pode inventar
// re-render). Fica em vi.hoisted porque a fábrica do vi.mock roda antes das
// declarações de topo do módulo.
const USUARIO = vi.hoisted(() => ({ id: 'u-1' }));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: USUARIO, loading: false }),
}));

vi.mock('@/hooks/auth/useMFA', () => ({ useMFA: () => ({ getAssuranceLevel }) }));

vi.mock('@/components/mfa/MFAVerify', () => ({
  MFAVerify: ({ onSuccess, onCancel }: { onSuccess?: () => void; onCancel?: () => void }) => (
    <>
      <button onClick={onSuccess}>Concluir verificação</button>
      {onCancel && <button onClick={onCancel}>Cancelar</button>}
    </>
  ),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { signOut } },
}));

function render2fa() {
  return render(
    <MemoryRouter initialEntries={['/2fa']}>
      <TwoFactorAuth />
    </MemoryRouter>,
  );
}

describe('TwoFactorAuth — retomada e saída', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signOut.mockResolvedValue({ error: null });
  });

  it("erro de assurance oferece 'Tentar de novo' e a segunda leitura conclui", async () => {
    getAssuranceLevel
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ nextLevel: 'aal2', currentLevel: 'aal1' });
    render2fa();

    expect(await screen.findByText('Erro ao verificar autenticação')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));

    expect(await screen.findByRole('button', { name: 'Concluir verificação' })).toBeTruthy();
    expect(getAssuranceLevel).toHaveBeenCalledTimes(2);
  });

  it('o botão de saída da tela de erro encerra a sessão antes de ir ao login', async () => {
    getAssuranceLevel.mockResolvedValue(null);
    render2fa();

    fireEvent.click(await screen.findByRole('button', { name: /voltar para login/i }));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/auth'));
  });

  it('não existe segundo botão de saída na verificação: o Cancelar é quem encerra a sessão', async () => {
    getAssuranceLevel.mockResolvedValue({ nextLevel: 'aal2', currentLevel: 'aal1' });
    render2fa();

    const cancelar = await screen.findByRole('button', { name: 'Cancelar' });
    // Não sobra o 'Voltar para login' que só fazia navigate (ciclo preso no /2fa).
    expect(screen.queryByRole('button', { name: /voltar para login/i })).toBeNull();

    fireEvent.click(cancelar);

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/auth'));
  });
});
