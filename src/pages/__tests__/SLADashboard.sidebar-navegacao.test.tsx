/**
 * R2-PLAT-012 (#450): as rotas /sla e /sla/history renderizavam a Sidebar real, mas
 * ligavam `onViewChange` a um `useState` local — o item clicado só acendia a seleção
 * e o corpo de SLA continuava na tela. O destino tem de ser o contrato compartilhado
 * de navegação do Index (`/?view=<id>`, lido por `useNavigationHistory`), com o
 * Voltar do navegador preservado.
 *
 * O teste renderiza a PÁGINA real (com a Sidebar real dentro dela), clica no item
 * como o usuário clica e confere o destino real do roteador.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

// --- dependências pesadas da Sidebar (mesmo conjunto do Sidebar.test.tsx) ---
vi.mock('@/hooks/ui/useTheme', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}));
vi.mock('@/hooks/ui/useSidebarCollapse', () => ({
  useSidebarCollapse: () => ({ collapsed: false, toggle: vi.fn() }),
}));
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    roles: ['supervisor'],
    permissions: [],
    isAdmin: false,
    isSupervisor: true,
    isSpecialAgent: false,
    hasRole: (r: string) => r === 'supervisor',
    loading: false,
    permissionsLoading: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/ui/useSidebarFavorites', () => ({
  useSidebarFavorites: () => ({
    favorites: [],
    toggleFavorite: vi.fn(),
    isFavorite: () => false,
    maxReached: false,
  }),
}));
vi.mock('@/components/notifications/PushNotificationToggle', () => ({ PushNotificationToggle: () => null }));
vi.mock('@/components/notifications/ScreenProtectionToggle', () => ({ ScreenProtectionToggle: () => null }));
vi.mock('@/components/notifications/SoundVolumeControl', () => ({ SoundVolumeControl: () => null }));
vi.mock('@/components/notifications/NotificationsPopover', () => ({ NotificationsPopover: () => null }));
vi.mock('@/hooks/tasks/useMyWorkItems', () => ({
  useMyWorkItemsBadge: () => 0,
  useMyWorkItemsBadgeInfo: () => ({ count: 0, hasOverdue: false }),
}));
vi.mock('@/components/layout/SidebarUserPill', () => ({ SidebarUserPill: () => null }));
vi.mock('@/components/layout/SidebarBackButton', () => ({ SidebarBackButton: () => null }));
vi.mock('@/components/theme/HighContrastToggle', () => ({ AccessibilitySettings: () => null }));

// --- corpos de SLA: não são o alvo aqui; só marcam em que tela o usuário está ---
vi.mock('@/components/queues/SLADashboard', () => ({
  SLADashboard: () => <div data-testid="corpo-sla" />,
}));
vi.mock('@/components/sla/SLAHistoryDashboard', () => ({
  SLAHistoryDashboard: () => <div data-testid="corpo-sla-historico" />,
}));
vi.mock('@/components/dashboard/FloatingParticles', () => ({ FloatingParticles: () => null }));
vi.mock('@/components/effects/AuroraBorealis', () => ({ AuroraBorealis: () => null }));

import SLADashboardPage from '@/pages/SLADashboard';
import SLAHistoryPage from '@/pages/SLAHistory';

/** Marcador da tela que o módulo escolhido abre no lugar do corpo de SLA. */
function Destino() {
  return <div data-testid="destino-modulo" />;
}

function montarRota(inicial: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/', element: <Destino /> },
      { path: '/sla', element: <SLADashboardPage /> },
      { path: '/sla/history', element: <SLAHistoryPage /> },
    ],
    { initialEntries: [inicial] },
  );
  const utils = render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { router, ...utils };
}

/** Rota real (caminho + query) em que o roteador parou. */
function destinoDe(router: { state: { location: { pathname: string; search: string } } }) {
  const { pathname, search } = router.state.location;
  return `${pathname}${search}`;
}

function clicarItemDaSidebar(container: HTMLElement, tourId: string) {
  const botao = container.querySelector(`[data-tour="${tourId}"]`);
  expect(botao).not.toBeNull();
  fireEvent.click(botao as HTMLElement);
}

beforeEach(() => {
  localStorage.clear();
});

describe('R2-PLAT-012 — Sidebar das rotas de SLA abre o módulo escolhido', () => {
  it('em /sla, clicar em Chat abre o Inbox no contrato ?view= em vez de só trocar a seleção', () => {
    const { router, container } = montarRota('/sla');
    expect(screen.getByTestId('corpo-sla')).toBeTruthy();

    clicarItemDaSidebar(container, 'inbox');

    expect(destinoDe(router)).toBe('/?view=inbox');
    expect(screen.queryByTestId('corpo-sla')).toBeNull();
    expect(screen.getByTestId('destino-modulo')).toBeTruthy();
  });

  it('em /sla, clicar em Configurações (item de grupo) também abre o módulo', () => {
    const { router, container } = montarRota('/sla');
    // O grupo "Sistema" nasce recolhido fora da sua própria view — abre como o usuário abre.
    fireEvent.click(screen.getByRole('button', { name: /Sistema/ }));

    clicarItemDaSidebar(container, 'settings');

    expect(destinoDe(router)).toBe('/?view=settings');
  });

  it('em /sla/history, clicar em Chat abre o Inbox no contrato ?view=', () => {
    const { router, container } = montarRota('/sla/history');
    expect(screen.getByTestId('corpo-sla-historico')).toBeTruthy();

    clicarItemDaSidebar(container, 'inbox');

    expect(destinoDe(router)).toBe('/?view=inbox');
  });

  it('a ida para o módulo empilha histórico: o Voltar devolve o usuário à rota de SLA', async () => {
    const { router, container } = montarRota('/sla');
    clicarItemDaSidebar(container, 'inbox');
    expect(destinoDe(router)).toBe('/?view=inbox');

    await act(async () => {
      await router.navigate(-1);
    });

    expect(destinoDe(router)).toBe('/sla');
    expect(screen.getByTestId('corpo-sla')).toBeTruthy();
  });
});
