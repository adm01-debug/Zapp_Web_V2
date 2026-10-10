/**
 * F25 (Bloco B): a rota do Multiplix (?view=multiplix) deixou de ser bloqueada
 * por PAPEL (STAFF_ROLES = admin/supervisor) e passou a exigir a permissao
 * nomeada `multiplix.dispatch.create`.
 *
 * O ViewRouter recebe papeis + permissoes do mesmo hook de acesso
 * (useUserRole -> RoleService.checkPermission -> RPC user_has_permission) e
 * decide por NavigationService.canAccess. Aqui os dois caminhos sao testados
 * com papel de staff — que antes era suficiente — e a regressao de outra rota.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let mockRoles: string[] = ['supervisor'];
let mockPermissions: string[] = ['multiplix.dispatch.create'];

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    roles: mockRoles,
    permissions: mockPermissions,
    isAdmin: mockRoles.includes('admin'),
    isSupervisor: mockRoles.includes('supervisor') || mockRoles.includes('admin'),
    isSpecialAgent: mockRoles.includes('special_agent'),
    hasRole: (r: string) => mockRoles.includes(r),
    loading: false,
    permissionsLoading: false,
    refetch: vi.fn(),
  }),
}));

// Views pesadas viram stubs: o que esta sob teste e o gate da rota, nao a tela.
vi.mock('@/components/multiplix/MultiplixView', () => ({
  default: () => <div data-testid="multiplix-view" />,
}));
vi.mock('@/components/catalog/ExternalProductManagement', () => ({
  default: () => <div data-testid="catalog-view" />,
}));

import { ViewRouter } from '@/pages/ViewRouter';

function renderView(view: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ViewRouter currentView={view} onNavigateTo={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockRoles = ['supervisor'];
  mockPermissions = ['multiplix.dispatch.create'];
});

describe('ViewRouter — rota do Multiplix por permissao nomeada (F25)', () => {
  it('bloqueia ?view=multiplix para staff SEM a permissao (papel nao basta mais)', () => {
    mockRoles = ['supervisor', 'admin'];
    mockPermissions = [];
    renderView('multiplix');

    expect(screen.getByText('Acesso restrito')).toBeInTheDocument();
    expect(screen.queryByTestId('multiplix-view')).toBeNull();
  });

  it('libera ?view=multiplix para quem TEM a permissao, mesmo sendo agente', async () => {
    mockRoles = ['agent'];
    mockPermissions = ['multiplix.dispatch.create'];
    renderView('multiplix');

    expect(screen.queryByText('Acesso restrito')).toBeNull();
    expect(await screen.findByTestId('multiplix-view', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('nao bloqueia a rota de catalogo de um agente sem permissao nomeada', () => {
    mockRoles = ['agent'];
    mockPermissions = [];
    renderView('catalog');

    // A rota segue para a view (nao para a tela de bloqueio). Nao assertamos o
    // render da view: ProductManagement e um lazy sem `default export` no modulo
    // alvo (achado pre-existente, fora do F25) — o que este teste cobre e o gate.
    expect(screen.queryByText('Acesso restrito')).toBeNull();
  });
});
