/**
 * E17 — Fusão Quadro→Tarefas (docs/plans/PLANO_FUSAO_QUADRO_TAREFAS_50_ETAPAS_2026-10-07.md).
 *
 * Ao remover a porta de entrada "Quadro" (id `pipeline`), ids que morreram ficam
 * gravados no `localStorage` de quem já usava o app antes da fusão — em
 * `sidebar-favorites`, `mobile-drawer-recents` e (desde a paleta única, X054)
 * `zapp-recent-modules`. Nenhum dos três é migrado (plano,
 * seção 1.4): cada um resolve o id contra a lista de módulos viva e descarta o que
 * não existe mais.
 *
 *   - Sidebar            → `favoriteItems` (allNavItems.find + filter(Boolean))
 *   - MobileDrawerMenu   → `recentItems`   (allItems.find + filter(Boolean))
 *   - Paleta única (X054)→ `recentCommands` (navigationCommands.find + filter(Boolean))
 *
 * Este teste trava esse comportamento nos TRÊS lugares, com um id morto de verdade
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

// HZ2-007/HZ5-19: os favoritos passaram a ser do usuário — o hook real só enxerga a
// chave dele. Sem o mock de auth, não haveria dono e a lista viria vazia.
const authState = vi.hoisted(() => ({ userId: 'e17-atendente' as string | null }));
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: authState.userId ? { id: authState.userId } : null }),
}));
/** Chave de favoritos do dono logado (HZ2-007/HZ5-19: passou a ter o id do usuário). */
const SIDEBAR_FAVORITES_KEY = `zapp.sidebar.favorites:${authState.userId}`;

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
// o hook real lendo a chave do usuário em `localStorage`.
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileDrawerMenu } from '@/components/mobile/MobileDrawerMenu';
import { CommandPalette } from '@/components/ui/command-palette';
import { useModuleCommandItems } from '@/hooks/integrations/useModuleCommandItems';

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
    localStorage.setItem(SIDEBAR_FAVORITES_KEY, JSON.stringify([ID_MORTO, ID_VIVO]));

    renderSidebar();

    const favoritos = screen.getByRole('navigation', { name: 'Favoritos' });
    const atalhos = Array.from(favoritos.querySelectorAll('[data-tour]')).map((el) =>
      el.getAttribute('data-tour'),
    );

    expect(atalhos).toEqual([ID_VIVO]);
    expect(favoritos.textContent).not.toContain(ID_MORTO);
  });

  it('não renderiza a seção Favoritos (e não lança) quando só o id morto está gravado', () => {
    localStorage.setItem(SIDEBAR_FAVORITES_KEY, JSON.stringify([ID_MORTO]));

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

/**
 * Paleta única (X054): o grupo "Recentes" (`zapp-recent-modules`, gravado ao
 * escolher um módulo) resolve cada id contra a lista viva de comandos de
 * navegação — id morto cai no `find` + `filter(Boolean)`, sem estourar. Hook e
 * paleta rodam de verdade, com o papel mockado (supervisor) da suíte.
 */
function PaletaUnicaE17() {
  const navigationCommands = useModuleCommandItems(() => {});
  return <CommandPalette open onOpenChange={() => {}} navigationCommands={navigationCommands} />;
}

function renderPaletaUnica() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PaletaUnicaE17 />
    </QueryClientProvider>,
  );
}

describe('E17 — Paleta única: recentes gravados (zapp-recent-modules) ignoram id morto', () => {
  it('mostra só o módulo vivo no grupo Recentes da paleta única', () => {
    localStorage.setItem('zapp-recent-modules', JSON.stringify([ID_MORTO, ID_VIVO]));

    renderPaletaUnica();

    const rotulo = screen.getByText('Recentes');
    const grupo = rotulo.closest('div')?.parentElement as HTMLElement;
    expect(grupo.querySelectorAll('button')).toHaveLength(1);
    expect(grupo.textContent).toContain('Chatbot');
    expect(grupo.textContent).not.toContain(ID_MORTO);
  });

  it('não renderiza o grupo Recentes (e não lança) quando só o id morto está gravado', () => {
    localStorage.setItem('zapp-recent-modules', JSON.stringify([ID_MORTO]));

    expect(() => renderPaletaUnica()).not.toThrow();

    expect(screen.queryByText('Recentes')).toBeNull();
  });
});
