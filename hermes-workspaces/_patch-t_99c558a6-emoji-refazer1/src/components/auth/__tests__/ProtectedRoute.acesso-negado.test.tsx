/**
 * Acesso negado com registro (paridade V3 -> V2): antes o ProtectedRoute
 * devolvia o usuário para '/' em silêncio. Agora ele navega para /access-denied
 * com a rota tentada em `state.from` E registra UMA vez por navegação
 * (logAudit com 'unauthorized_access'), sem dado pessoal.
 *
 * O "palco" lê a rota real do router (`useLocation`) e renderiza a tela REAL
 * de acesso negado quando a navegação acontece — nada de mock com a resposta
 * pronta.
 */
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import AccessDenied from '@/pages/AccessDenied';
import { logAudit } from '@/lib/audit';

const USUARIO = { id: 'u-1', email: 'agente@promobrindes.com.br' };
let usuarioAtual: unknown = USUARIO;
const papeis = { value: [] as string[] };
const permissao = { value: true };

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: usuarioAtual, loading: false }),
}));
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    loading: false,
    hasRole: (papel: string) => papeis.value.includes(papel),
  }),
}));
vi.mock('@/services/role.service', () => ({
  RoleService: { checkPermission: vi.fn(async () => permissao.value) },
}));
vi.mock('@/services/auth.service', () => ({
  AuthService: {
    signOut: vi.fn(async () => {}),
    // Sessão sem fator pendente: o gate de MFA não interfere neste teste.
    getMfaAssurance: async () => ({
      currentLevel: 'aal1',
      nextLevel: 'aal1',
      currentAuthenticationMethods: [],
    }),
  },
}));
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(async () => {}),
}));

type Papel = 'admin' | 'supervisor' | 'agent';

interface PalcoProps {
  roles?: Papel[];
  permissao?: string;
  fallback?: ReactNode;
}

function Palco({ roles, permissao: perm, fallback }: PalcoProps) {
  const { pathname } = useLocation();

  if (pathname === '/access-denied') {
    return <AccessDenied />;
  }

  return (
    <ProtectedRoute requiredRoles={roles} requiredPermission={perm} fallback={fallback}>
      <div>CONTEUDO PROTEGIDO</div>
    </ProtectedRoute>
  );
}

function cenario(props: PalcoProps = {}) {
  return render(
    <MemoryRouter initialEntries={['/painel']}>
      <Palco {...props} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  usuarioAtual = USUARIO;
  papeis.value = [];
  permissao.value = true;
  vi.mocked(logAudit).mockClear();
});

describe('ProtectedRoute — acesso negado explicado e registrado', () => {
  it('sem o papel exigido vai para /access-denied mostrando a rota tentada', async () => {
    cenario({ roles: ['admin'] });

    await waitFor(() => {
      expect(screen.getByText('/painel')).toBeTruthy();
    });
    expect(screen.getByRole('heading', { name: 'Acesso negado' })).toBeTruthy();
    expect(screen.queryByText('CONTEUDO PROTEGIDO')).toBeNull();
  });

  it('registra a negação UMA vez, com a rota e o papel exigidos', async () => {
    cenario({ roles: ['admin'] });

    await waitFor(() => {
      expect(screen.getByText('/painel')).toBeTruthy();
    });
    expect(vi.mocked(logAudit)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logAudit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'unauthorized_access',
        entityType: 'route',
        entityId: '/painel',
        details: expect.objectContaining({ required: ['admin'], method: 'NAVIGATE' }),
      })
    );
  });

  it('com o papel exigido entra no conteúdo e não registra nada', async () => {
    papeis.value = ['admin'];
    cenario({ roles: ['admin'] });

    await waitFor(() => {
      expect(screen.getByText('CONTEUDO PROTEGIDO')).toBeTruthy();
    });
    expect(vi.mocked(logAudit)).not.toHaveBeenCalled();
  });

  it('sem a permissão exigida também explica e registra', async () => {
    permissao.value = false;
    cenario({ permissao: 'relatorios.ver' });

    await waitFor(() => {
      expect(screen.getByText('/painel')).toBeTruthy();
    });
    expect(vi.mocked(logAudit)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logAudit)).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: '/painel',
        details: expect.objectContaining({ required: ['relatorios.ver'] }),
      })
    );
  });

  it('o fallback do chamador continua mandando: nada de redirecionar nem registrar', async () => {
    cenario({ roles: ['admin'], fallback: <div>SEM PERMISSAO</div> });

    await waitFor(() => {
      expect(screen.getByText('SEM PERMISSAO')).toBeTruthy();
    });
    expect(screen.queryByText('Acesso negado')).toBeNull();
    expect(vi.mocked(logAudit)).not.toHaveBeenCalled();
  });
});
