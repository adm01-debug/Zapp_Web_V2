/**
 * E17 — Fusão Quadro→Tarefas (docs/plans/PLANO_FUSAO_QUADRO_TAREFAS_50_ETAPAS_2026-10-07.md).
 *
 * Ao remover a porta de entrada "Quadro" (id `pipeline`), ids que morreram ficam
 * gravados no `localStorage` de quem já usava o app antes da fusão — em
 * `sidebar-favorites` e `mobile-drawer-recents`. Nenhum dos dois é migrado (plano,
 * seção 1.4): cada um resolve o id contra a lista de módulos viva e descarta o que
 * não existe mais. (A paleta ⌘K única, X054, não guarda recentes de módulos.)
 *
 *   - Sidebar            → `favoriteItems` (allNavItems.find + filter(Boolean))
 *   - MobileDrawerMenu   → `recentItems`   (allItems.find + filter(Boolean))
 *
 * Este teste trava esse comportamento nos DOIS lugares, com um id morto de verdade
 * (`quadro-legado`, que nunca existiu no menu) e um módulo vivo (`chatbot`): o id
 * morto não aparece e não lança; o vivo continua acessível. Sem o filtro, o
 * `.find()` devolve `undefined` e o primeiro acesso a `item.icon` / `item.id` estoura.
 * Os componentes são renderizados de verdade (nada de replicar o filtro no teste).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

/** Id que morreu na fusão: não existe em nenhuma lista de módulos do produto. */
const ID_MORTO = 'quadro-legado';
/** Módulo vivo (grupo "Automação & IA", id liberado para STAFF) — o controle. */
const ID_VIVO = 'chatbot';

vi.mock('@/hooks/ui/useTheme', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}));

vi.mock('@/hooks/ui/useSidebarCollapse', () => ({
  useSidebarCollapse: () => ({ collapsed: false, toggle: vi.fn() }),
}));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    roles: ['supervisor'],
    permissions: ['multiplix.dispatch.create'],
    isAdmin: false,
    isSupervisor: true,
    isSpecialAgent: false,
    hasRole: (r: string) => r === 'supervisor',
    loading: false,
    permissionsLoading: false,
    refetch: vi.fn(),
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
vi.mock('@/components/theme/HighContrastToggle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/theme/HighContrastToggle')>()),
  AccessibilitySettings: () => null,
}));

// `useSidebarFavorites` NÃO é mockado de propósito: o ponto do cartão é justamente
// o hook real lendo `sidebar-favorites` do localStorage.
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileDrawerMenu } from '@/components/mobile/MobileDrawerMenu';

function renderSidebar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <Sidebar currentView="inbox" onViewChange={vi.fn()} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

/** O bloco "Recentes" do menu mobile (o `<div>` que envolve o rótulo). */
function blocoDeRecentesDoDrawer(): HTMLElement | null {
  const rotulo = screen.queryByText('Recentes');
  return rotulo ? (rotulo.parentElement as HTMLElement) : null;
}

function renderDrawer() {
  return render(
    <MobileDrawerMenu
      isOpen
      onClose={vi.fn()}
      currentView="inbox"
      onViewChange={vi.fn()}
      agentName="Ana Souza"
    />,
  );
}

beforeEach(() => {
  // O jsdom não implementa `scrollIntoView` e a lista da paleta (cmdk) chama no
  // layout-effect ao abrir. Stub de ambiente, nada ao comportamento testado.
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
});

describe('E17 — Sidebar: favoritos gravados (sidebar-favorites) ignoram id morto', () => {
  it('mostra só o módulo vivo quando o id morto está favoritado junto', () => {
    localStorage.setItem('sidebar-favorites', JSON.stringify([ID_MORTO, ID_VIVO]));

    renderSidebar();

    const favoritos = screen.getByRole('navigation', { name: 'Favoritos' });
    const atalhos = Array.from(favoritos.querySelectorAll('[data-tour]')).map((el) =>
      el.getAttribute('data-tour'),
    );

    expect(atalhos).toEqual([ID_VIVO]);
    expect(favoritos.textContent).not.toContain(ID_MORTO);
  });

  it('não renderiza a seção Favoritos (e não lança) quando só o id morto está gravado', () => {
    localStorage.setItem('sidebar-favorites', JSON.stringify([ID_MORTO]));

    expect(() => renderSidebar()).not.toThrow();

    expect(screen.queryByText('Favoritos')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Favoritos' })).toBeNull();
  });
});

describe('E17 — Menu mobile: recentes gravados (mobile-drawer-recents) ignoram id morto', () => {
  it('mostra só o módulo vivo no bloco Recentes', () => {
    localStorage.setItem('mobile-drawer-recents', JSON.stringify([ID_MORTO, ID_VIVO]));

    renderDrawer();

    const bloco = blocoDeRecentesDoDrawer();
    expect(bloco).not.toBeNull();
    expect(bloco!.querySelectorAll('button')).toHaveLength(1);
    expect(bloco!.textContent).toContain('Chatbot');
    expect(bloco!.textContent).not.toContain(ID_MORTO);
  });

  it('não renderiza o bloco Recentes (e não lança) quando só o id morto está gravado', () => {
    localStorage.setItem('mobile-drawer-recents', JSON.stringify([ID_MORTO]));

    expect(() => renderDrawer()).not.toThrow();

    expect(blocoDeRecentesDoDrawer()).toBeNull();
    expect(screen.queryByText('Recentes')).toBeNull();
  });
});
