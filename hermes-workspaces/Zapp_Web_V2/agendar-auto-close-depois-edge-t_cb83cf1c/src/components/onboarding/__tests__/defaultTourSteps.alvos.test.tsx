/**
 * R2-INF-038 (#380) — Tour padrão aponta para dois alvos ausentes e avança até a
 * conclusão sem mostrá-los.
 *
 * Os dois últimos passos do tour padrão (`notifications` e `theme`) apontavam para
 * `[data-tour="notifications"]` e `[data-tour="theme"]` — atributos que nenhum
 * componente do layout produzia (o único produtor, SidebarNavItem, só emite IDs de
 * navegação). O TourOverlay procura o alvo, tenta 10 vezes de 200ms e, não achando,
 * chama `nextStep()`: os dois passos eram pulados em silêncio e, no último, o
 * `endTour()` chamava o `onComplete` do onboarding sem que "Central de Notificações"
 * e "Personalização" fossem mostrados uma única vez.
 *
 * O teste monta o layout REAL da Sidebar (com o NotificationsPopover real e o botão
 * real de tema) dentro do TourProvider, com os passos REAIS
 * (DEFAULT_ONBOARDING_STEPS). Entram mockadas só as fontes de dado (hooks) e os
 * vizinhos que não são alvo do tour — mesmo conjunto do Sidebar.test.tsx.
 *
 * Nota de jsdom: o ambiente não tem layout, então todo `getBoundingClientRect`
 * devolve zeros e o TourOverlay trata medida zero como alvo invisível (nextStep).
 * A medida é stubbada aqui para separar "alvo ausente" de "jsdom sem layout"; o
 * `querySelector` do alvo continua sendo o real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('@/hooks/ui/useTheme', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}));

vi.mock('@/hooks/ui/useSidebarCollapse', () => ({
  useSidebarCollapse: () => ({ collapsed: false, toggle: vi.fn() }),
}));

vi.mock('@/hooks/ui/useSidebarFavorites', () => ({
  useSidebarFavorites: () => ({
    favorites: [],
    toggleFavorite: vi.fn(),
    isFavorite: () => false,
    maxReached: false,
  }),
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

vi.mock('@/hooks/tasks/useMyWorkItems', () => ({
  useMyWorkItemsBadge: () => 0,
  useMyWorkItemsBadgeInfo: () => ({ count: 0, hasOverdue: false }),
}));

// O popover de notificações é o COMPONENTE REAL (é um dos alvos do tour); só a
// fonte de dados dele (useAuth + supabase) entra mockada.
vi.mock('@/hooks/system/useNotifications', () => ({
  useNotifications: () => ({
    notifications: [],
    loading: false,
    unreadCount: 0,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    deleteNotification: vi.fn(),
    clearAll: vi.fn(),
    createNotification: vi.fn(),
    refetch: vi.fn(),
  }),
}));

vi.mock('@/components/notifications/PushNotificationToggle', () => ({ PushNotificationToggle: () => null }));
vi.mock('@/components/notifications/ScreenProtectionToggle', () => ({ ScreenProtectionToggle: () => null }));
vi.mock('@/components/notifications/SoundVolumeControl', () => ({ SoundVolumeControl: () => null }));
vi.mock('@/components/theme/HighContrastToggle', () => ({ AccessibilitySettings: () => null }));
vi.mock('@/components/layout/SidebarBackButton', () => ({ SidebarBackButton: () => null }));

import { Sidebar } from '@/components/layout/Sidebar';
import { TourProvider, useTour, DEFAULT_ONBOARDING_STEPS } from '../OnboardingTour';

const PASSOS_DA_AUDITORIA = ['notifications', 'theme'];

function indiceDoPasso(id: string) {
  return DEFAULT_ONBOARDING_STEPS.findIndex((s) => s.id === id);
}

function TourDriver() {
  const { isActive, currentStep, startTour, goToStep } = useTour();
  return (
    <div>
      <span data-testid="tour-ativo">{String(isActive)}</span>
      <span data-testid="tour-passo">{currentStep}</span>
      <button data-testid="tour-iniciar" onClick={() => startTour(DEFAULT_ONBOARDING_STEPS)}>
        Iniciar tour padrão
      </button>
      {PASSOS_DA_AUDITORIA.map((id) => (
        <button key={id} data-testid={`tour-ir-para-${id}`} onClick={() => goToStep(indiceDoPasso(id))}>
          Ir para {id}
        </button>
      ))}
    </div>
  );
}

function renderLayout(onComplete?: () => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <TourProvider onComplete={onComplete}>
          <Sidebar currentView="inbox" onViewChange={vi.fn()} />
          <TourDriver />
        </TourProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // Altura/largura não nulas: jsdom mede tudo como 0 e o overlay trata 0 como
  // "alvo invisível" (ver nota no topo). A ausência REAL do alvo continua sendo um
  // querySelector que devolve null.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 40, y: 40, top: 40, left: 40, right: 120, bottom: 120, width: 80, height: 80,
    toJSON: () => ({}),
  } as DOMRect);
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    writable: true,
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DEFAULT_ONBOARDING_STEPS — os dois alvos da auditoria são renderizados', () => {
  it('cada passo do tour padrão que a auditoria citou tem alvo no layout composto', () => {
    renderLayout();

    const passos = DEFAULT_ONBOARDING_STEPS.filter((s) => PASSOS_DA_AUDITORIA.includes(s.id));
    expect(passos).toHaveLength(2);

    for (const passo of passos) {
      expect(
        document.querySelector(passo.target),
        `passo "${passo.id}" aponta para ${passo.target}, que não existe no layout`,
      ).not.toBeNull();
    }

    // Os dois alvos são exatamente os controles reais que os títulos descrevem:
    // "Central de Notificações" (sino da sidebar) e "Personalização" (tema claro/escuro).
    expect(document.querySelector('[data-tour="notifications"]')).toHaveAttribute('aria-label', expect.stringContaining('Notificações'));
    expect(document.querySelector('[data-tour="theme"]')).toHaveAttribute('aria-label', 'Modo escuro');
  });

  it('o tour mostra os dois passos e não avança sozinho até a conclusão', async () => {
    const onComplete = vi.fn();
    renderLayout(onComplete);

    fireEvent.click(screen.getByTestId('tour-iniciar'));
    expect(screen.getByTestId('tour-ativo').textContent).toBe('true');

    fireEvent.click(screen.getByTestId('tour-ir-para-notifications'));
    expect(await screen.findByText('Central de Notificações')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tour-ir-para-theme'));
    expect(await screen.findByText('Personalização')).toBeInTheDocument();

    // 2,5s: com os alvos ausentes, cada passo esgotava as 10 tentativas de 200ms e o
    // overlay saltava sozinho; na última etapa isso chamava endTour/onComplete.
    await new Promise((resolve) => setTimeout(resolve, 2500));

    expect(screen.getByTestId('tour-passo').textContent).toBe(String(indiceDoPasso('theme')));
    expect(screen.getByTestId('tour-ativo').textContent).toBe('true');
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByText('Passo 6 de 6')).toBeInTheDocument();
  });
});
