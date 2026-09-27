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
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    roles: mockRoles,
    isAdmin: mockRoles.includes('admin'),
    isSupervisor: mockRoles.includes('supervisor') || mockRoles.includes('admin'),
    isSpecialAgent: mockRoles.includes('special_agent'),
    hasRole: (r: string) => mockRoles.includes(r),
    loading: false,
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
vi.mock('@/components/notifications/SoundMuteToggle', () => ({ SoundMuteToggle: () => null }));
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

  it('agente comum não vê Multiplix na nav primária', () => {
    mockRoles = ['agent'];
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
