/**
 * Rota `?view=supervisao` — o supervisor passa a ter uma tela propria para as
 * ferramentas que estavam presas no `admin` (ADMIN_ONLY).
 *
 * O ViewRouter decide por NavigationService.canAccess com os papeis de
 * useUserRole. Aqui se prova que a rota NAO cai na tela de bloqueio para o
 * supervisor e cai para o atendente — e que a rota antiga (`admin`) continua
 * fechada para o supervisor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let mockRoles: string[] = ['supervisor'];

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    roles: mockRoles,
    permissions: [],
    isAdmin: mockRoles.includes('admin'),
    isSupervisor: mockRoles.includes('supervisor') || mockRoles.includes('admin'),
    isSpecialAgent: mockRoles.includes('special_agent'),
    hasRole: (r: string) => mockRoles.includes(r),
    loading: false,
    permissionsLoading: false,
    refetch: vi.fn(),
  }),
}));

// Views pesadas viram stubs: sob teste esta o gate da rota, nao a tela.
vi.mock('@/components/admin/SupervisaoView', () => ({
  SupervisaoView: () => <div data-testid="supervisao-view" />,
}));
vi.mock('@/components/admin/AdminView', () => ({
  AdminView: () => <div data-testid="admin-view" />,
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
});

describe('ViewRouter — rota supervisao (?view=supervisao)', () => {
  it('entrega a visao de supervisao ao supervisor, sem tela de bloqueio', async () => {
    renderView('supervisao');

    expect(screen.queryByText('Acesso restrito')).toBeNull();
    expect(await screen.findByTestId('supervisao-view', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('entrega a visao de supervisao ao admin', async () => {
    mockRoles = ['admin'];
    renderView('supervisao');

    expect(screen.queryByText('Acesso restrito')).toBeNull();
    expect(await screen.findByTestId('supervisao-view', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('bloqueia ?view=supervisao para o atendente comum', () => {
    mockRoles = ['agent'];
    renderView('supervisao');

    expect(screen.getByText('Acesso restrito')).toBeInTheDocument();
    expect(screen.queryByTestId('supervisao-view')).toBeNull();
  });

  it('mantem ?view=admin fechada para o supervisor (segue ADMIN_ONLY)', () => {
    renderView('admin');

    expect(screen.getByText('Acesso restrito')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-view')).toBeNull();
  });
});
