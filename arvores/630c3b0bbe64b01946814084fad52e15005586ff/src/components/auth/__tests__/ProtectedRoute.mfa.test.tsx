/**
 * Regressão do achado R2-AUTH-003 (reauditoria 03/10): o desafio MFA estava FORA
 * da cadeia de autorização das rotas — ProtectedRoute só checava usuário/papel/
 * permissão, então uma sessão aal1 de conta com TOTP verificado entrava direto
 * no app sem nunca passar pelo desafio (a rota /2fa era independente).
 *
 * A cadeia correta: `getAuthenticatorAssuranceLevel` decide ANTES de liberar o
 * conteúdo — currentLevel 'aal1' + nextLevel 'aal2' redireciona para /2fa;
 * aal2 (ou aal1 sem fator pendente) entra; erro vira estado explícito, nunca
 * spinner infinito nem liberação silenciosa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

const USUARIO = { id: 'u-1', email: 'agente@promobrindes.com.br' };
let usuarioAtual: unknown = USUARIO;

const getAAL = vi.fn();

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: usuarioAtual, loading: false }),
}));
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ loading: false, hasRole: () => true }),
}));
vi.mock('@/services/role.service', () => ({
  RoleService: { checkPermission: vi.fn(async () => true) },
}));
vi.mock('@/services/auth.service', () => ({
  AuthService: {
    signOut: vi.fn(async () => {}),
    // Mesmo contrato do service real: dados crus ou null em erro.
    getMfaAssurance: async () => {
      const { data, error } = await getAAL();
      return error || !data ? null : data;
    },
  },
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signOut: vi.fn(async () => {}),
      mfa: { getAuthenticatorAssuranceLevel: (...args: unknown[]) => getAAL(...args) },
    },
  },
}));
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

function RotasDeTeste() {
  return useRoutes([
    {
      path: '/',
      element: (
        <ProtectedRoute>
          <div>CONTEUDO PROTEGIDO</div>
        </ProtectedRoute>
      ),
    },
    { path: '/2fa', element: <div>TELA DESAFIO 2FA</div> },
    { path: '/auth', element: <div>TELA LOGIN</div> },
  ]);
}

function cenario() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <RotasDeTeste />
    </MemoryRouter>
  );
}

function aal(currentLevel: string, nextLevel: string) {
  getAAL.mockResolvedValue({
    data: { currentLevel, nextLevel, currentAuthenticationMethods: [] },
    error: null,
  });
}

describe('ProtectedRoute — MFA dentro da cadeia de autorização (R2-AUTH-003)', () => {
  beforeEach(() => {
    usuarioAtual = USUARIO;
    getAAL.mockReset();
  });

  it('sessão aal1 com fator pendente (nextLevel aal2) NÃO entra: vai para /2fa', async () => {
    aal('aal1', 'aal2');
    cenario();

    await waitFor(() => {
      expect(screen.getByText('TELA DESAFIO 2FA')).toBeTruthy();
    });
    expect(screen.queryByText('CONTEUDO PROTEGIDO')).toBeNull();
  });

  it('sessão aal2 (desafio já concluído) entra no conteúdo', async () => {
    aal('aal2', 'aal2');
    cenario();

    await waitFor(() => {
      expect(screen.getByText('CONTEUDO PROTEGIDO')).toBeTruthy();
    });
  });

  it('sessão aal1 sem fator pendente (nextLevel aal1) entra normalmente', async () => {
    aal('aal1', 'aal1');
    cenario();

    await waitFor(() => {
      expect(screen.getByText('CONTEUDO PROTEGIDO')).toBeTruthy();
    });
  });

  it('erro na leitura do AAL vira estado explícito — não libera nem gira para sempre', async () => {
    getAAL.mockResolvedValue({ data: null, error: new Error('mfa indisponivel') });
    cenario();

    await waitFor(() => {
      expect(screen.getByText(/erro/i)).toBeTruthy();
    });
    expect(screen.queryByText('CONTEUDO PROTEGIDO')).toBeNull();
  });

  it('sem usuário continua indo para /auth (regressão do guard de sessão)', async () => {
    usuarioAtual = null;
    getAAL.mockResolvedValue({ data: null, error: new Error('sem sessão') });
    cenario();

    await waitFor(() => {
      expect(screen.getByText('TELA LOGIN')).toBeTruthy();
    });
  });
});
