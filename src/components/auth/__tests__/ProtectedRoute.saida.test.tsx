/**
 * Paridade V3 -> V2 na tela "Verificando acesso": o primeiro instante é da
 * verificação (com passo visível e anunciado por aria-live), e os botões de
 * saída só aparecem depois de alguns segundos — antes a tela abria já com
 * "Recarregar Página" / "Sair e Entrar Novamente" na frente do usuário.
 */
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

const USUARIO = { id: 'u-1', email: 'agente@promobrindes.com.br' };
const cenario = { authLoading: true, rolesLoading: false, usuario: null as unknown };

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: cenario.usuario, loading: cenario.authLoading }),
}));
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ loading: cenario.rolesLoading, hasRole: () => true }),
}));
vi.mock('@/services/role.service', () => ({
  RoleService: { checkPermission: vi.fn(async () => true) },
}));
vi.mock('@/services/auth.service', () => ({
  AuthService: {
    signOut: vi.fn(async () => {}),
    getMfaAssurance: async () => ({
      currentLevel: 'aal1',
      nextLevel: 'aal1',
      currentAuthenticationMethods: [],
    }),
  },
}));
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(async () => {}),
}));

function renderTela() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <ProtectedRoute>
        <div>CONTEUDO PROTEGIDO</div>
      </ProtectedRoute>
    </MemoryRouter>
  );
}

describe('ProtectedRoute — tela de verificação e saída após alguns segundos', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cenario.authLoading = true;
    cenario.rolesLoading = false;
    cenario.usuario = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('não oferece botão de saída no primeiro instante da verificação', () => {
    renderTela();

    expect(screen.getByText('Carregando sessão...')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('libera "Recarregar Página" e "Sair e Entrar Novamente" depois de 5 s de espera', () => {
    renderTela();

    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(screen.queryByRole('button')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('button', { name: 'Recarregar Página' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sair e Entrar Novamente' })).toBeTruthy();
  });

  it('mostra o passo da verificação em andamento e o anuncia (aria-live polite)', () => {
    cenario.authLoading = false;
    cenario.rolesLoading = true;
    cenario.usuario = USUARIO;
    renderTela();

    const regiao = screen.getByRole('status');
    expect(regiao).toHaveAttribute('aria-live', 'polite');
    expect(regiao.textContent).toContain('Verificando permissões...');
    expect(regiao.textContent).not.toContain('CONTEUDO PROTEGIDO');
  });
});
