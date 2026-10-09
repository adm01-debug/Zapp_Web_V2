/**
 * Cobre a correção do achado do Codex/auditoria de 5 agentes na PR #903:
 * a nav primária (com Multiplix) ficava fora do único container de rolagem,
 * encolhendo permanentemente o espaço visível dos grupos em telas baixas,
 * e um item que virou primário (Multiplix) duplicava na seção Favoritos
 * se já tivesse sido favoritado quando ainda vivia dentro de um grupo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
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
/**
 * Badge de Tarefas (useMyWorkItemsBadge/Info) e contador de e-mail não lido
 * (useUnreadEmailCount, U01) são as duas fontes de número da barra: aqui o alvo é
 * o encaixe de cada selo no item certo, então as duas entram mockadas e cada
 * teste escolhe o número que a fonte entrega.
 */
const fontes = vi.hoisted(() => ({
  badgeInfo: { count: 0, hasOverdue: false },
  emailUnread: { count: 0, status: 'ok' as 'loading' | 'ok' | 'erro' },
  useUnreadEmailCount: vi.fn(),
}));
vi.mock('@/hooks/tasks/useMyWorkItems', () => ({
  useMyWorkItemsBadge: () => fontes.badgeInfo.count,
  useMyWorkItemsBadgeInfo: () => fontes.badgeInfo,
}));
vi.mock('@/hooks/gmail/useUnreadEmailCount', () => ({
  useUnreadEmailCount: fontes.useUnreadEmailCount,
}));
vi.mock('@/components/layout/SidebarUserPill', () => ({ SidebarUserPill: () => null }));
vi.mock('@/components/layout/SidebarBackButton', () => ({ SidebarBackButton: () => null }));
/**
 * Marcador no lugar do painel de acessibilidade: o alvo aqui e o ENCAIXE (o componente era
 * orfao — existia, tinha teste de tokens, e nenhuma tela o renderizava). O comportamento do
 * painel e o efeito da classe `.high-contrast` tem cobertura propria em
 * `src/components/theme/__tests__/HighContrastTokens.test.tsx`.
 */
vi.mock('@/components/theme/HighContrastToggle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/theme/HighContrastToggle')>()),
  AccessibilitySettings: () => <div data-testid="a11y-settings-montado" />,
}));

import { Sidebar } from '@/components/layout/Sidebar';

type SidebarProps = ComponentProps<typeof Sidebar>;

function baseProps(): SidebarProps {
  return { currentView: 'inbox', onViewChange: vi.fn() };
}

function renderSidebar(props: SidebarProps = baseProps()) {
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
  fontes.badgeInfo = { count: 0, hasOverdue: false };
  fontes.emailUnread = { count: 0, status: 'ok' };
  fontes.useUnreadEmailCount.mockReset();
  fontes.useUnreadEmailCount.mockImplementation(() => fontes.emailUnread);
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

/**
 * F71 — o item do menu e "Multiplix · NOVO". O selo e da ENTRADA: quem nao tem
 * `multiplix.dispatch.create` nao ve entrada nem selo (o gate nao mudou, o selo
 * apenas acompanha). O nome acessivel do botao carrega o selo porque o
 * `aria-label` do botao mascara o texto interno para o leitor de tela.
 */
describe('Sidebar — selo "NOVO" da entrada do Multiplix (F71)', () => {
  it('quem tem a permissão vê "Multiplix · NOVO", com o selo lido no nome acessível', () => {
    const { container } = renderSidebar();
    const entrada = container.querySelector('[data-tour="multiplix"]');

    expect(entrada).not.toBeNull();
    expect(entrada?.textContent).toContain('Multiplix');
    expect(entrada?.textContent).toContain('NOVO');
    expect(entrada).toHaveAccessibleName('Multiplix (novo)');
  });

  it('sem a permissão não existe entrada nem selo (nada de "NOVO" solto no menu)', () => {
    mockRoles = ['supervisor', 'admin'];
    mockPermissions = [];
    const { container } = renderSidebar();

    expect(container.querySelector('[data-tour="multiplix"]')).toBeNull();
    expect(container.textContent).not.toContain('NOVO');
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

/**
 * O painel de acessibilidade era um componente ORFAO: `AccessibilitySettings` existia com o
 * switch de alto contraste, o nivel de contraste, movimento reduzido e texto grande — e nenhum
 * componente o renderizava (`grep` so encontrava a propria definicao e o `displayName`). Na
 * pratica o usuario so conseguia ligar o alto contraste por `localStorage`, o que inclusive
 * limitava os specs de e2e (`e2e/theme-alto-contraste.spec.ts` liga por localStorage porque nao
 * havia como clicar). Este teste cobre o ENCAIXE: sem ele, remover o `<AccessibilitySettings />`
 * da Sidebar volta a esconder a funcionalidade sem quebrar nada.
 */
describe('Sidebar — acessibilidade alcançável pela interface', () => {
  it('monta o gatilho do painel de acessibilidade', () => {
    renderSidebar();
    expect(screen.queryByTestId('a11y-settings-montado')).not.toBeNull();
  });

  it('o gatilho fica dentro dos controles rápidos, junto dos demais toggles', () => {
    const { container } = renderSidebar();
    const gatilho = screen.queryByTestId('a11y-settings-montado');
    expect(gatilho).not.toBeNull();
    expect(container.textContent).toContain('Controles rápidos');
    expect(container.contains(gatilho as HTMLElement)).toBe(true);
  });
});

/**
 * U01 — selo do item Email. O dono vê na barra lateral quantas conversas de e-mail
 * ainda não foram lidas (todas as contas, via RLS). O item Email não tinha selo; o
 * Chat (`inboxBadge`) e o Tarefas (`useMyWorkItemsBadgeInfo`) já tinham, e a regra
 * dos dois não pode mudar. O número exibido vem do encaixe de `useUnreadEmailCount`.
 */
describe('Sidebar — selo do item Email (U01)', () => {
  const itemDaBarra = (container: HTMLElement, id: string) =>
    container.querySelector(`[data-tour="${id}"]`) as HTMLElement;

  it('mostra a quantidade de conversas não lidas no item Email, na cor do Chat', () => {
    fontes.emailUnread = { count: 4, status: 'ok' };
    const { container } = renderSidebar();

    const email = itemDaBarra(container, 'email-chat');
    expect(email).not.toBeNull();
    const selo = within(email).getByText('4');
    expect(selo.className).toContain('bg-destructive');
    expect(selo.className).not.toContain('bg-warning');
    expect(email.getAttribute('aria-label')).toBe('Email (4 não lidas)');
    // o item Email está visível na barra: o contador é consultado (item sem acesso não consulta)
    expect(fontes.useUnreadEmailCount).toHaveBeenCalledWith(true);
  });

  it('sem conversas não lidas (0) o item Email fica sem selo', () => {
    fontes.emailUnread = { count: 0, status: 'ok' };
    const { container } = renderSidebar();

    const email = itemDaBarra(container, 'email-chat');
    expect(email).not.toBeNull();
    expect(within(email).queryByText('0')).toBeNull();
    expect(email.getAttribute('aria-label')).toBe('Email');
  });

  it('acima de 99 o selo mostra "99+"', () => {
    fontes.emailUnread = { count: 100, status: 'ok' };
    const { container } = renderSidebar();

    expect(within(itemDaBarra(container, 'email-chat')).getByText('99+')).not.toBeNull();
  });

  it('falha na contagem não mostra selo e não quebra a barra', () => {
    fontes.emailUnread = { count: 0, status: 'erro' };
    const { container } = renderSidebar();

    const email = itemDaBarra(container, 'email-chat');
    expect(within(email).queryByText('0')).toBeNull();
    // a barra continua inteira, com os outros itens no lugar
    expect(itemDaBarra(container, 'inbox')).not.toBeNull();
    expect(itemDaBarra(container, 'tasks')).not.toBeNull();
    expect(screen.getByRole('navigation', { name: 'Menu de navegação principal' })).not.toBeNull();
  });

  it('os selos de Chat e Tarefas seguem iguais (e com as cores de cada um)', () => {
    fontes.emailUnread = { count: 4, status: 'ok' };
    fontes.badgeInfo = { count: 3, hasOverdue: false };
    const { container } = renderSidebar({ currentView: 'inbox', onViewChange: vi.fn(), inboxBadge: 5 });

    const seloChat = within(itemDaBarra(container, 'inbox')).getByText('5');
    expect(seloChat.className).toContain('bg-destructive');
    expect(seloChat.className).not.toContain('bg-warning');

    const seloTarefas = within(itemDaBarra(container, 'tasks')).getByText('3');
    expect(seloTarefas.className).toContain('bg-warning');
    expect(seloTarefas.className).not.toContain('bg-destructive');

    expect(within(itemDaBarra(container, 'email-chat')).getByText('4')).not.toBeNull();
  });
});
