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
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { RoleService } from '@/services/role.service';
import AccessDenied from '@/pages/AccessDenied';
import { logAudit } from '@/lib/audit';

const USUARIO = { id: 'u-1', email: 'agente@promobrindes.com.br' };
let usuarioAtual: unknown = USUARIO;
const papeis = { value: [] as string[] };
const permissao = { value: true };
const falhaPapeis = { value: false };
const pausaPapeis = { value: false };
const erroPermissao = { value: false };
// Papéis servidos pelo `fetchUserRoles` mockado nos testes que usam o hook
// REAL (importActual): o filtro de pausa é provado com hook + React Query reais.
const papeisReais = { value: [] as string[] };

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: usuarioAtual, loading: false }),
}));
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    loading: false,
    rolesLoadError: falhaPapeis.value,
    isPaused: pausaPapeis.value,
    hasRole: (papel: string) => papeis.value.includes(papel),
  }),
}));
vi.mock('@/services/role.service', () => ({
  RoleService: {
    // Erro de RPC (JWT vencido/RLS/rede) NÃO é "sem permissão": rejeita.
    checkPermission: vi.fn(async () => {
      if (erroPermissao.value) throw new Error('user_has_permission indisponivel');
      return permissao.value;
    }),
    // Papéis para os testes com o hook REAL (o filtro de pausa vive no hook).
    fetchUserRoles: vi.fn(async () => papeisReais.value),
  },
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
  falhaPapeis.value = false;
  pausaPapeis.value = false;
  erroPermissao.value = false;
  papeisReais.value = [];
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

  it('falha ao carregar papeis não vira acesso negado nem auditoria falsa', async () => {
    falhaPapeis.value = true;
    cenario({ roles: ['admin'] });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Erro ao verificar permissões' })).toBeTruthy();
    });
    expect(screen.queryByText('Acesso negado')).toBeNull();
    expect(screen.queryByText('CONTEUDO PROTEGIDO')).toBeNull();
    expect(vi.mocked(logAudit)).not.toHaveBeenCalled();
  });

  it('leitura de papeis pausada (sem rede) também não vira acesso negado nem auditoria', async () => {
    pausaPapeis.value = true;
    cenario({ roles: ['admin'] });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Erro ao verificar permissões' })).toBeTruthy();
    });
    expect(screen.queryByText('Acesso negado')).toBeNull();
    expect(screen.queryByText('CONTEUDO PROTEGIDO')).toBeNull();
    expect(vi.mocked(logAudit)).not.toHaveBeenCalled();
  });

  it('erro ao consultar a permissão NÃO vira acesso negado: mostra o erro com Tentar de novo e não audita', async () => {
    erroPermissao.value = true;
    cenario({ permissao: 'relatorios.ver' });

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Não foi possível verificar suas permissões' })
      ).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
    expect(screen.queryByText('Acesso negado')).toBeNull();
    expect(screen.queryByText('CONTEUDO PROTEGIDO')).toBeNull();
    expect(vi.mocked(logAudit)).not.toHaveBeenCalled();
  });

  it('negação REAL da permissão (resultado false) continua indo para /access-denied e auditando', async () => {
    permissao.value = false;
    cenario({ permissao: 'relatorios.ver' });

    await waitFor(() => {
      expect(screen.getByText('/painel')).toBeTruthy();
    });
    expect(screen.getByRole('heading', { name: 'Acesso negado' })).toBeTruthy();
    expect(screen.queryByText('Não foi possível verificar suas permissões')).toBeNull();
    expect(vi.mocked(logAudit)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logAudit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'unauthorized_access',
        entityId: '/painel',
        details: expect.objectContaining({ required: ['relatorios.ver'] }),
      })
    );
  });

  /**
   * Ponto 1 da recusa (hook REAL, fora do mock do palco): pausa COM papéis em
   * cache não é falha de leitura. A consulta está de fato pausada (fetchStatus
   * 'paused', sem rede no refetch), mas o hook expõe `isPaused === false`.
   * Sem o filtro (`isPaused` cru), este teste falha com `isPaused === true`.
   */
  it('pausa com papeis em cache nao expoe isPaused (hook real, refetch sem rede)', async () => {
    usuarioAtual = { id: 'u-pausa-cache', email: 'cache@promobrindes.com.br' };
    papeisReais.value = ['admin'];
    const { useUserRole: useUserRoleReal } =
      await vi.importActual<typeof import('@/hooks/system/useUserRole')>('@/hooks/system/useUserRole');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const Envoltorio = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useUserRoleReal(), { wrapper: Envoltorio });
    await waitFor(() => {
      expect(result.current.roles).toEqual(['admin']);
    });

    onlineManager.setOnline(false);
    try {
      result.current.refetch();
      // A consulta de papéis está de fato pausada (sem rede)...
      await waitFor(() => {
        expect(qc.getQueryState(['user-roles', 'u-pausa-cache'])?.fetchStatus).toBe('paused');
      });
      // ...mas com dados em cache isso NÃO é falha de leitura.
      expect(result.current.isPaused).toBe(false);
    } finally {
      onlineManager.setOnline(true);
    }
  });

  /**
   * Ponto 1 da recusa (trava do comportamento preservado): pausa SEM dados
   * continua sendo falha de leitura — `isPaused === true`, como o teste do
   * palco 'pausada (sem rede)' espera para mostrar a tela de erro.
   */
  it('pausa sem dados continua sendo falha de leitura (hook real, isPaused true)', async () => {
    usuarioAtual = { id: 'u-pausa-zero', email: 'zero@promobrindes.com.br' };
    papeisReais.value = ['admin'];
    const { useUserRole: useUserRoleReal } =
      await vi.importActual<typeof import('@/hooks/system/useUserRole')>('@/hooks/system/useUserRole');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const Envoltorio = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    onlineManager.setOnline(false);
    try {
      const { result } = renderHook(() => useUserRoleReal(), { wrapper: Envoltorio });
      await waitFor(() => {
        expect(result.current.isPaused).toBe(true);
      });
      expect(result.current.roles).toEqual([]);
    } finally {
      onlineManager.setOnline(true);
    }
  });

  /**
   * Ponto 2 da recusa: troca de permissão com a consulta velha pendente. A
   * consulta velha resolve negando DEPOIS da troca — pertence à identidade
   * antiga e é ignorada: a rota mostra o conteúdo (permissão nova liberada),
   * sem /access-denied e sem auditoria. Sem o cleanup, o `.then` velho
   * sobrescreve `hasPermission` e este teste cai em 'Acesso negado'.
   */
  it('troca de permissao com consulta pendente ignora o resultado velho', async () => {
    let resolverVelha!: (valor: boolean) => void;
    const consultaVelha = new Promise<boolean>((resolver) => {
      resolverVelha = resolver;
    });
    vi.mocked(RoleService.checkPermission).mockImplementationOnce(() => consultaVelha);

    const tela = cenario({ permissao: 'relatorios.ver' });
    await waitFor(() => {
      expect(vi.mocked(RoleService.checkPermission)).toHaveBeenCalledWith(USUARIO.id, 'relatorios.ver');
    });

    tela.rerender(
      <MemoryRouter initialEntries={['/painel']}>
        <Palco permissao="outra.ver" />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(vi.mocked(RoleService.checkPermission)).toHaveBeenCalledWith(USUARIO.id, 'outra.ver');
    });

    // A consulta VELHA resolve negando — é da identidade antiga, ignorada.
    await act(async () => {
      resolverVelha(false);
      await consultaVelha;
    });

    await waitFor(() => {
      expect(screen.getByText('CONTEUDO PROTEGIDO')).toBeTruthy();
    });
    expect(screen.queryByText('Acesso negado')).toBeNull();
    expect(vi.mocked(logAudit)).not.toHaveBeenCalled();
  });
});
