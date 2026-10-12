/**
 * Guarda de ROTA x entrada de MENU (coerencia).
 *
 * As rotas de SLA/Filas caíam em `ProtectedRoute` sem `requiredRoles`: o agente
 * entrava pela URL mesmo sem o item no menu (que exige staff). O mesmo valia
 * para /admin/rate-limit, cuja lista era um literal. Agora a rota le da
 * NavigationService (fonte unica) e o acesso negado vai para /access-denied.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom';

// Estado mutavel lido pelo mock de useUserRole (papel do usuario do teste).
const state = vi.hoisted(() => ({ roles: ['agent'] as string[] }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-teste' }, session: null, loading: false }),
}));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    roles: state.roles,
    permissions: [],
    hasRole: (role: string) => state.roles.includes(role),
    loading: false,
    permissionsLoading: false,
  }),
}));

vi.mock('@/services/auth.service', () => ({
  AuthService: {
    getMfaAssurance: vi.fn().mockResolvedValue({ currentLevel: 'aal2', nextLevel: 'aal2' }),
    signOut: vi.fn(),
  },
}));

vi.mock('@/lib/audit', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@/components/transitions', () => ({
  PageTransitionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Telas viram sondas: o que esta sob teste e o gate da rota.
vi.mock('../../pages/AccessDenied', () => ({ default: () => <div data-testid="access-denied" /> }));
vi.mock('../../pages/Install', () => ({ default: () => <div data-testid="install-view" /> }));
vi.mock('../../pages/SLADashboard', () => ({ default: () => <div data-testid="sla-view" /> }));
vi.mock('../../pages/SLAHistory', () => ({ default: () => <div data-testid="sla-history-view" /> }));
vi.mock('../../pages/QueueDetails', () => ({ default: () => <div data-testid="queue-view" /> }));
vi.mock('../../pages/QueuesComparison', () => ({
  default: () => <div data-testid="queues-comparison-view" />,
}));
vi.mock('../../pages/admin/RolesPage', () => ({ default: () => <div data-testid="roles-view" /> }));
vi.mock('../../pages/admin/RateLimitDashboard', () => ({
  default: () => <div data-testid="rate-limit-view" />,
}));
vi.mock('../../pages/Index', () => ({ default: () => <div data-testid="index" /> }));
vi.mock('../../pages/NotFound', () => ({ default: () => <div data-testid="not-found" /> }));

import { AppRoutes } from '../AppRoutes';
import { NavigationService } from '@/services/navigation.service';

beforeEach(() => {
  state.roles = ['agent'];
  vi.clearAllMocks();
});

/** Entrada autorizada: renderiza de fato a tela e prova pelo conteudo. */
function renderAllowed(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

/** Negado: monta o roteador de dados e le a URL final (o redirect do gate). */
async function renderDeniedAndGetPath(path: string) {
  const router = createMemoryRouter([{ path: '*', element: <AppRoutes /> }], {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  await vi.waitFor(() => expect(router.state.location.pathname).not.toBe(path));
  return router.state.location.pathname;
}

describe('AppRoutes — coerencia rota x menu (staff)', () => {
  it('agente em /sla vai para /access-denied e registra a exigencia do menu', async () => {
    const finalPath = await renderDeniedAndGetPath('/sla');

    expect(finalPath).toBe('/access-denied');
    expect(screen.queryByTestId('sla-view')).toBeNull();

    const { logAudit } = await import('@/lib/audit');
    expect(vi.mocked(logAudit).mock.calls[0]?.[0]).toMatchObject({
      action: 'unauthorized_access',
      entityId: '/sla',
      details: { required: ['admin', 'supervisor'], method: 'NAVIGATE' },
    });
  });

  it('supervisor em /sla entra na tela', async () => {
    state.roles = ['supervisor'];
    renderAllowed('/sla');

    expect(await screen.findByTestId('sla-view')).toBeInTheDocument();
  });

  it('agente em /sla/history vai para /access-denied', async () => {
    await expect(renderDeniedAndGetPath('/sla/history')).resolves.toBe('/access-denied');
  });

  it('agente em /queue/abc vai para /access-denied; supervisor entra', async () => {
    await expect(renderDeniedAndGetPath('/queue/abc')).resolves.toBe('/access-denied');

    state.roles = ['supervisor'];
    renderAllowed('/queue/abc');
    expect(await screen.findByTestId('queue-view')).toBeInTheDocument();
  });

  it('agente em /queues/comparison vai para /access-denied', async () => {
    await expect(renderDeniedAndGetPath('/queues/comparison')).resolves.toBe('/access-denied');
  });

  it('/admin/roles: agente negado, admin entra', async () => {
    await expect(renderDeniedAndGetPath('/admin/roles')).resolves.toBe('/access-denied');

    state.roles = ['admin'];
    renderAllowed('/admin/roles');
    expect(await screen.findByTestId('roles-view')).toBeInTheDocument();
  });

  it('/admin/rate-limit: supervisor negado, admin entra com a lista da entry admin', async () => {
    state.roles = ['supervisor'];
    await expect(renderDeniedAndGetPath('/admin/rate-limit')).resolves.toBe('/access-denied');

    state.roles = ['admin'];
    renderAllowed('/admin/rate-limit');
    expect(await screen.findByTestId('rate-limit-view')).toBeInTheDocument();
  });

  it('/install segue publico, sem sessao', async () => {
    state.roles = [];
    renderAllowed('/install');

    expect(await screen.findByTestId('install-view')).toBeInTheDocument();
  });

  it('o menu e a fonte das listas usadas pelas rotas', () => {
    // Prova de coerencia: e destas entradas que as rotas leem os papeis.
    expect(NavigationService.canAccess('sla', ['agent'])).toBe(false);
    expect(NavigationService.canAccess('sla', ['supervisor'])).toBe(true);
    expect(NavigationService.canAccess('queues', ['agent'])).toBe(false);
    expect(NavigationService.canAccess('queues', ['supervisor'])).toBe(true);
    expect(NavigationService.canAccess('admin', ['supervisor'])).toBe(false);
    expect(NavigationService.canAccess('admin', ['admin'])).toBe(true);
  });
});
