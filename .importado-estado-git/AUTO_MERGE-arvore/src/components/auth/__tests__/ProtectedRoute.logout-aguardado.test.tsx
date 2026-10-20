/**
 * Botões "Sair e Entrar Novamente" (tela de verificação e tela de erro de MFA):
 * a navegação tem de ESPERAR o logout remoto terminar. Antes o código fazia
 * `void signOut()` e navegava na mesma linha: o unload da página podia abortar
 * a requisição de sign-out e o usuário voltava logado ao recarregar /auth.
 */
import { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

const estado = vi.hoisted(() => ({
  user: null as { id: string; email?: string } | null,
  loading: true,
  assurance: { currentLevel: 'aal1', nextLevel: 'aal1' } as
    | { currentLevel: string; nextLevel: string }
    | null,
  signOut: vi.fn<() => Promise<unknown>>(),
  assign: vi.fn(),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({
    user: estado.user,
    loading: estado.loading,
    bootstrapError: false,
    retryBootstrap: vi.fn(),
  }),
}));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ loading: false, hasRole: () => false }),
}));

vi.mock('@/services/role.service', () => ({
  RoleService: { checkPermission: vi.fn(async () => true) },
}));

vi.mock('@/services/auth.service', () => ({
  AuthService: {
    signOut: () => estado.signOut(),
    getMfaAssurance: async () => estado.assurance,
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }));

function cenario(children: ReactNode = <div>CONTEUDO</div>) {
  return render(<MemoryRouter initialEntries={['/painel']}>{children}</MemoryRouter>);
}

const renderProtected = () => cenario(<ProtectedRoute>{<div>CONTEUDO</div>}</ProtectedRoute>);

beforeEach(() => {
  estado.user = null;
  estado.loading = true;
  estado.assurance = { currentLevel: 'aal1', nextLevel: 'aal1' };
  estado.signOut.mockReset();
  estado.assign.mockReset();
  vi.stubGlobal('location', { assign: estado.assign, href: '/painel', reload: vi.fn() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProtectedRoute — logout aguardado antes de navegar', () => {
  it('na tela de verificação só navega para /auth depois que o signOut termina', async () => {
    let resolver: (() => void) | undefined;
    estado.signOut.mockImplementation(
      () => new Promise<void>((resolve) => { resolver = () => resolve(); }),
    );

    renderProtected();
    const botao = await screen.findByRole('button', { name: 'Sair e Entrar Novamente' });
    botao.click();

    // signOut ainda em voo: nada de navegar (aqui é onde o logout era abortado).
    await Promise.resolve();
    expect(estado.signOut).toHaveBeenCalledTimes(1);
    expect(estado.assign).not.toHaveBeenCalled();

    resolver?.();
    await waitFor(() => expect(estado.assign).toHaveBeenCalledWith('/auth'));
  });

  it('navega mesmo se o signOut falhar (limpeza local não pode travar a saída)', async () => {
    estado.signOut.mockRejectedValue(new Error('rede fora'));

    renderProtected();
    const botao = await screen.findByRole('button', { name: 'Sair e Entrar Novamente' });
    botao.click();

    await waitFor(() => expect(estado.assign).toHaveBeenCalledWith('/auth'));
  });

  it('na tela de erro do MFA o botão também espera o logout', async () => {
    estado.loading = false;
    estado.user = { id: 'u-1', email: 'agente@promobrindes.com.br' };
    // getMfaAssurance sem dados -> gate 'error' (tela de erro de autenticação).
    estado.assurance = null;
    let resolver: (() => void) | undefined;
    estado.signOut.mockImplementation(
      () => new Promise<void>((resolve) => { resolver = () => resolve(); }),
    );

    renderProtected();

    // Espera o gate assentar na tela de erro (senão o clique cai num botão
    // desmontado da tela de verificação).
    await screen.findByText('Erro ao verificar autenticação');
    const botao = await screen.findByRole('button', { name: 'Sair e Entrar Novamente' });
    botao.click();

    await Promise.resolve();
    expect(estado.assign).not.toHaveBeenCalled();

    resolver?.();
    await waitFor(() => expect(estado.assign).toHaveBeenCalledWith('/auth'));
  });
});
