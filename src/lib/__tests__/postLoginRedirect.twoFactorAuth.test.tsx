/**
 * 2FA mantém o destino: o ProtectedRoute manda a rota pedida no state.from ao
 * interromper em /2fa (state={{ from: location }}); ao concluir, o usuário vai
 * para essa rota e não para '/'. Exercita o componente real (TwoFactorAuth).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import TwoFactorAuth from '@/pages/TwoFactorAuth';

const navigate = vi.hoisted(() => vi.fn());
const getAssuranceLevel = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-1' }, loading: false }),
}));
vi.mock('@/hooks/auth/useMFA', () => ({ useMFA: () => ({ getAssuranceLevel }) }));
vi.mock('@/components/mfa/MFAVerify', () => ({
  MFAVerify: ({ onSuccess }: { onSuccess: () => void }) => (
    <button onClick={onSuccess}>Concluir verificação</button>
  ),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { signOut: vi.fn() } },
}));

const DESTINO = { pathname: '/crm', search: '?view=kanban', hash: '#topo' };

/** Espelha a rota atual do router real (o <Navigate> interno não usa o mock). */
function RotaAtual() {
  const loc = useLocation();
  return <div>{`rota:${loc.pathname}${loc.search}${loc.hash}`}</div>;
}

function render2fa() {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/2fa', state: { from: DESTINO } }]}>
      <RotaAtual />
      <TwoFactorAuth />
    </MemoryRouter>,
  );
}

describe('TwoFactorAuth — destino do 2FA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no sucesso volta para a tela pedida (state.from), não para /', async () => {
    getAssuranceLevel.mockResolvedValue({ nextLevel: 'aal2', currentLevel: 'aal1' });
    render2fa();

    const botao = await screen.findByRole('button', { name: 'Concluir verificação' });
    await act(async () => {
      fireEvent.click(botao);
    });

    expect(navigate).toHaveBeenCalledWith('/crm?view=kanban#topo');
  });

  it('sem fator pendente redireciona para a tela pedida', async () => {
    getAssuranceLevel.mockResolvedValue({ nextLevel: 'aal2', currentLevel: 'aal2' });
    render2fa();

    expect(await screen.findByText('rota:/crm?view=kanban#topo')).toBeTruthy();
  });
});
