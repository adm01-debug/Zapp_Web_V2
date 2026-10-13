/**
 * Boot sem resposta do servidor: o AuthProvider tem de expor o erro de boot e
 * a ação de tentar de novo; o ProtectedRoute mostra a tela em vez de jogar o
 * usuário no /auth como se ele não tivesse sessão.
 */
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AuthService } from '@/services/auth.service';

const estado = vi.hoisted(() => ({
  user: null as { id: string } | null,
  loading: false,
  bootstrapError: false,
  retryBootstrap: vi.fn(),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({
    user: estado.user,
    loading: estado.loading,
    bootstrapError: estado.bootstrapError,
    retryBootstrap: estado.retryBootstrap,
  }),
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
    getMfaAssurance: async () => ({ currentLevel: 'aal1', nextLevel: 'aal1' }),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }));

function Palco({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  if (pathname === '/auth') return <div>TELA DE LOGIN</div>;
  return <>{children}</>;
}

function cenario() {
  return render(
    <MemoryRouter initialEntries={['/painel']}>
      <Palco>
        <ProtectedRoute>
          <div>CONTEUDO PROTEGIDO</div>
        </ProtectedRoute>
      </Palco>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  estado.user = null;
  estado.loading = false;
  estado.bootstrapError = false;
  estado.retryBootstrap.mockReset();
});

describe('ProtectedRoute — boot sem conexão', () => {
  it('mostra a tela de erro de boot com "Tentar de novo" e não redireciona', async () => {
    estado.bootstrapError = true;
    cenario();

    await waitFor(() => expect(screen.getByText(/não foi possível confirmar/i)).toBeTruthy());
    expect(screen.queryByText('TELA DE LOGIN')).toBeNull();
    expect(screen.queryByText('CONTEUDO PROTEGIDO')).toBeNull();

    const botao = screen.getByRole('button', { name: 'Tentar de novo' });
    botao.click();
    expect(estado.retryBootstrap).toHaveBeenCalledTimes(1);
  });

  it('a tela de erro de boot oferece "Sair" (volta ao login limpando a sessão)', async () => {
    estado.bootstrapError = true;
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    cenario();

    await waitFor(() => expect(screen.getByText(/não foi possível confirmar/i)).toBeTruthy());

    const sair = screen.getByRole('button', { name: 'Sair' });
    sair.click();

    await waitFor(() => expect(AuthService.signOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/auth'));
    vi.unstubAllGlobals();
  });

  it('sem erro de boot e sem sessão continua indo para /auth', async () => {
    estado.bootstrapError = false;
    cenario();

    await waitFor(() => expect(screen.getByText('TELA DE LOGIN')).toBeTruthy());
  });
});
