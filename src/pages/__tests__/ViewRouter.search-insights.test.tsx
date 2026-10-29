/**
 * HZ1-06 — gate da rota `?view=search-insights`.
 *
 * A tela é de admin/supervisor (mesmo filtro de papel das demais telas de
 * admin). O ViewRouter decide por NavigationService.canAccess, que lê o papel
 * do próprio item de menu; a RPC por trás também nega os demais (42501).
 * Aqui a view é um stub — o que está sob teste é o gate, não a tela.
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

vi.mock('@/components/admin/SearchInsightsView', () => ({
  default: () => <div data-testid="search-insights-view" />,
  SearchInsightsView: () => <div data-testid="search-insights-view" />,
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

describe('ViewRouter — rota ?view=search-insights', () => {
  it('nega a rota para um agente comum', () => {
    mockRoles = ['agent'];
    renderView('search-insights');

    expect(screen.getByText('Acesso restrito')).toBeInTheDocument();
    expect(screen.queryByTestId('search-insights-view')).toBeNull();
  });

  it('libera a rota para supervisor', async () => {
    mockRoles = ['supervisor'];
    renderView('search-insights');

    expect(screen.queryByText('Acesso restrito')).toBeNull();
    expect(await screen.findByTestId('search-insights-view', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('libera a rota para admin', async () => {
    mockRoles = ['admin'];
    renderView('search-insights');

    expect(await screen.findByTestId('search-insights-view', {}, { timeout: 5000 })).toBeInTheDocument();
  });
});
