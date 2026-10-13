/**
 * TwoFactorAuth (/2fa) — t_62a7ee39.
 *
 * R2-AUTH-003: a rota não pode ficar presa em "Verificando". Cada estado tem
 * saída explícita: sem sessão -> /auth; erro de assurance -> tela de erro;
 * fator pendente -> desafio; já em aal2/sem pendência -> destino pedido.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useRoutes } from 'react-router-dom';

const h = vi.hoisted(() => ({
  user: { id: 'u-1' } as { id: string } | null,
  loading: false,
  getAssuranceLevel: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: h.user, loading: h.loading }),
}));

vi.mock('@/hooks/auth/useMFA', () => ({
  useMFA: () => ({ getAssuranceLevel: h.getAssuranceLevel }),
}));

vi.mock('@/components/mfa/MFAVerify', () => ({
  MFAVerify: ({ onSuccess, onCancel }: { onSuccess?: () => void; onCancel?: () => void }) => (
    <div>
      <p>VERIFY STUB</p>
      <button onClick={() => onSuccess?.()}>ok</button>
      <button onClick={() => onCancel?.()}>cancel</button>
    </div>
  ),
}));

vi.mock('@/lib/postLoginRedirect', () => ({
  resolverDestinoPosLogin: () => '/painel',
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { signOut: (...a: unknown[]) => h.signOut(...a) } },
}));

import TwoFactorAuth from '../TwoFactorAuth';

function Rotas() {
  return useRoutes([
    { path: '/2fa', element: <TwoFactorAuth /> },
    { path: '/auth', element: <div>TELA LOGIN</div> },
    { path: '/painel', element: <div>PAINEL</div> },
  ]);
}

function cenario() {
  return render(
    <MemoryRouter initialEntries={['/2fa']}>
      <Rotas />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.user = { id: 'u-1' };
  h.loading = false;
  h.getAssuranceLevel.mockResolvedValue({ currentLevel: 'aal1', nextLevel: 'aal1' });
  h.signOut.mockResolvedValue({ error: null });
  vi.clearAllMocks();
});

describe('TwoFactorAuth — estados sem spinner infinito', () => {
  it('sem usuário redireciona para /auth', async () => {
    h.user = null;
    cenario();
    expect(await screen.findByText('TELA LOGIN')).toBeTruthy();
  });

  it('erro de assurance mostra a tela de erro', async () => {
    h.getAssuranceLevel.mockResolvedValue(null);
    cenario();

    expect(await screen.findByText('Erro ao verificar autenticação')).toBeTruthy();
    expect(screen.queryByText('VERIFY STUB')).toBeNull();
  });

  it('fator pendente (aal2) mostra o desafio de verificação', async () => {
    h.getAssuranceLevel.mockResolvedValue({ currentLevel: 'aal1', nextLevel: 'aal2' });
    cenario();

    expect(await screen.findByText('VERIFY STUB')).toBeTruthy();
    expect(screen.queryByText('TELA LOGIN')).toBeNull();
    expect(screen.queryByText('PAINEL')).toBeNull();
  });

  it('sem pendência (aal1 -> aal1) vai para o destino pedido', async () => {
    cenario();
    expect(await screen.findByText('PAINEL')).toBeTruthy();
  });

  it('concluir o desafio navega para o destino, não para /auth', async () => {
    h.getAssuranceLevel.mockResolvedValue({ currentLevel: 'aal1', nextLevel: 'aal2' });
    cenario();

    fireEvent.click(await screen.findByRole('button', { name: 'ok' }));
    expect(await screen.findByText('PAINEL')).toBeTruthy();
  });

  it('cancelar faz signOut e volta para o login', async () => {
    h.getAssuranceLevel.mockResolvedValue({ currentLevel: 'aal1', nextLevel: 'aal2' });
    cenario();

    fireEvent.click(await screen.findByRole('button', { name: 'cancel' }));
    await waitFor(() => expect(h.signOut).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('TELA LOGIN')).toBeTruthy();
  });
});
