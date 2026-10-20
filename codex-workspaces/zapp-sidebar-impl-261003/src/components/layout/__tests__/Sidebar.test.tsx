/**
 * Cobre a correção do achado do Codex/auditoria de 5 agentes na PR #903:
 * a nav primária (com Multiplix) ficava fora do único container de rolagem,
 * encolhendo permanentemente o espaço visível dos grupos em telas baixas,
 * e um item que virou primário (Multiplix) duplicava na seção Favoritos
 * se já tivesse sido favoritado quando ainda vivia dentro de um grupo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('@/hooks/ui/useTheme', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}));

vi.mock('@/hooks/ui/useSidebarCollapse', () => ({
  useSidebarCollapse: () => ({ collapsed: false, toggle: vi.fn() }),
}));

let mockRoles: string[] = ['supervisor'];
/**
 * F25 (Bloco B): a entrada do Multiplix deixou de seguir o papel (STAFF_ROLES) e
 * passa a seguir a permissao nomeada `multiplix.dispatch.create`. O componente
 * le as permissoes do mesmo hook de acesso que ja entrega os papeis
 * (useUserRole -> RoleService.checkPermission -> RPC user_has_permission).
 * Por isso o mock agora tambem injeta as permissoes que o hook entregaria.
 */
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

let mockFavorites: string[] = [];
const mockToggleFavorite = vi.fn();
vi.mock('@/hooks/ui/useSidebarFavorites', () => ({
  useSidebarFavorites: () => ({
    favorites: mockFavorites,
    toggleFavorite: mockToggleFavorite,
    isFavorite: (id: string) => mockFavorites.includes(id),
    maxReached: false,
  }),
}));

vi.mock('@/components/notifications/PushNotificationToggle', () => ({ PushNotificationToggle: () => null }));
vi.mock('@/components/notifications/ScreenProtectionToggle', () => ({ ScreenProtectionToggle: () => null }));
vi.mock('@/components/notifications/SoundVolumeControl', () => ({ SoundVolumeControl: () => null }));
// Fase F: o popover de notificações consome `useNotifications` (useAuth/supabase)
// e o badge de Tarefas consome `useMyWorkItemsBadge` (useAuth/useQuery). Este teste
// é sobre a estrutura de navegação, então os dois entram mockados.
vi.mock('@/components/notifications/NotificationsPopover', () => ({ NotificationsPopover: () => null }));
vi.mock('@/hooks/tasks/useMyWorkItems', () => ({
  useMyWorkItemsBadge: () => 0,
  useMyWorkItemsBadgeInfo: () => ({ count: 0, hasOverdue: false }),
}));
vi.mock('@/components/layout/SidebarUserPill', () => ({ SidebarUserPill: () => null }));
vi.mock('@/components/layout/SidebarBackButton', () => ({ SidebarBackButton: () => null }));

import { Sidebar } from '@/components/layout/Sidebar';

function baseProps() {
  return { currentView: 'inbox', onViewChange: vi.fn() };
}

function renderSidebar(props = baseProps()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider><Sidebar {...props} /></TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockRoles = ['supervisor'];
  mockPermissions = ['multiplix.dispatch.create'];
  mockFavorites = [];
  mockToggleFavorite.mockClear();
});

describe('Sidebar — nav primária e grupos compartilham uma única área de rolagem', () => {
  it('Multiplix continua entre Contatos e Catálogo, e todos os três estão dentro do mesmo container com scroll', () => {
    // currentView='chatbot' força o grupo "Automação & IA" (acordeão, fechado
    // por padrão) a abrir, para podermos verificar que um item de grupo
    // também vive dentro da mesma área de rolagem da nav primária.
    const { container } = renderSidebar({ currentView: 'chatbot', onViewChange: vi.fn() });

    const tourIds = Array.from(container.querySelectorAll('[data-tour]')).map(
      (el) => el.getAttribute('data-tour'),
    );
    const contatosIdx = tourIds.indexOf('contacts');
    const multiplixIdx = tourIds.indexOf('multiplix');
    const catalogoIdx = tourIds.indexOf('catalog');

    expect(contatosIdx).toBeGreaterThanOrEqual(0);
    expect(multiplixIdx).toBe(contatosIdx + 1);
    expect(catalogoIdx).toBe(multiplixIdx + 1);

    const scrollArea = container.querySelector('.overflow-y-auto');
    expect(scrollArea).not.toBeNull();
    const multiplixButton = container.querySelector('[data-tour="multiplix"]');
    const chatbotButton = container.querySelector('[data-tour="chatbot"]');
    expect(scrollArea).toContainElement(multiplixButton as HTMLElement);
    expect(scrollArea).toContainElement(chatbotButton as HTMLElement);
  });

  /**
   * Gate do Multiplix: ANTES era por papel (STAFF_ROLES = admin/supervisor) e o
   * agente nunca via o item. AGORA (F25) é pela permissão nomeada
   * `multiplix.dispatch.create` — o papel não decide mais; staff sem a permissão
   * perde a entrada e agente com a permissão ganha. Os dois casos são testados
   * abaixo de propósito, porque a intenção do gate mudou.
   */
  it('staff SEM a permissão nomeada não vê Multiplix na nav primária (papel não basta — F25)', () => {
    mockRoles = ['supervisor', 'admin'];
    mockPermissions = [];
    const { container } = renderSidebar();
    expect(container.querySelector('[data-tour="multiplix"]')).toBeNull();
  });

  it('agente COM a permissão nomeada vê Multiplix na nav primária (F25)', () => {
    mockRoles = ['agent'];
    mockPermissions = ['multiplix.dispatch.create'];
    const { container } = renderSidebar();
    expect(container.querySelector('[data-tour="multiplix"]')).not.toBeNull();
  });

  it('agente SEM a permissão nomeada continua sem ver Multiplix na nav primária', () => {
    mockRoles = ['agent'];
    mockPermissions = [];
    const { container } = renderSidebar();
    expect(container.querySelector('[data-tour="multiplix"]')).toBeNull();
  });
});

describe('Sidebar — Favoritos não duplica item que já vive na nav primária', () => {
  it('Multiplix favoritado não aparece de novo na seção Favoritos (já é sempre visível)', () => {
    mockFavorites = ['multiplix'];
    const { container } = renderSidebar();

    expect(screen.queryByText('Favoritos')).toBeNull();
    expect(container.querySelectorAll('[data-tour="multiplix"]')).toHaveLength(1);
  });

  it('item de grupo favoritado aparece em Favoritos e pode ser desfavoritado dali', () => {
    mockFavorites = ['chatbot'];
    renderSidebar();

    const favoritosNav = screen.getByRole('navigation', { name: 'Favoritos' });
    const starButton = favoritosNav.querySelector('[aria-label="Remover dos favoritos"]');
    expect(starButton).not.toBeNull();

    fireEvent.click(starButton as HTMLElement);
    expect(mockToggleFavorite).toHaveBeenCalledWith('chatbot');
  });
});
