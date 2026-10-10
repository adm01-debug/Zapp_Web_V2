/**
 * X055 — a prancha de referência do Talk X (?view=talkx-kit) é alcançável pelo
 * roteador sem entrada em menu, só com a trava aberta (DEV ou VITE_TALKX_KIT=1).
 * Com a trava fechada, comporta-se como view desconhecida (bloqueio padrão).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let mockKitOpen = true;

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    roles: ['agent'],
    permissions: [],
    isAdmin: false,
    isSupervisor: false,
    isSpecialAgent: false,
    hasRole: () => false,
    loading: false,
    permissionsLoading: false,
    refetch: vi.fn(),
  }),
}));

// A prancha vira stub: o que está sob teste é o gate da rota, não a prancha.
vi.mock('@/components/talkx/__dev__/TalkXKit', () => ({
  TalkXKit: () => <div data-testid="talkx-kit-view" />,
}));

vi.mock('@/components/talkx/kit/forcedState', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/talkx/kit/forcedState')>();
  return { ...real, isTalkXKitEnabled: () => mockKitOpen };
});

import { ViewRouter } from '@/pages/ViewRouter';
import { NavigationService } from '@/services/navigation.service';

function renderView(view: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ViewRouter currentView={view} onNavigateTo={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockKitOpen = true;
});

describe('ViewRouter — prancha talkx-kit (X055)', () => {
  it('com a trava aberta, ?view=talkx-kit rende a prancha mesmo sem papel nem permissão', async () => {
    mockKitOpen = true;
    renderView('talkx-kit');

    expect(screen.queryByText('Acesso restrito')).toBeNull();
    expect(await screen.findByTestId('talkx-kit-view', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('com a trava fechada, ?view=talkx-kit cai no bloqueio padrão (como view desconhecida)', () => {
    mockKitOpen = false;
    renderView('talkx-kit');

    expect(screen.getByText('Acesso restrito')).toBeInTheDocument();
    expect(screen.queryByTestId('talkx-kit-view')).toBeNull();
  });

  it('talkx-kit não entra no menu (só por URL direta)', () => {
    const ids = [
      ...NavigationService.getPrimaryNav(),
      ...NavigationService.getGroups().flatMap((g) => g.items),
      ...NavigationService.getAdvancedNav(),
    ].map((item) => item.id);

    expect(ids).not.toContain('talkx-kit');
  });
});
