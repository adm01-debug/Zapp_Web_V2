/**
 * P2 #447 — REGRESSÃO DE INTEGRAÇÃO do atalho "Ir para Dashboard" (Ctrl+2).
 *
 * O defeito original: a ação `go-to-dashboard` do registry global de atalhos só
 * chamava `navigate('/')` e anunciava no toast. O aviso saía, a view do shell
 * continuava `inbox`. Um teste que só olhasse `toast.info` passaria com o bug de
 * pé — por isso este teste observa o PONTO QUE RECEBE A VIEW: o `currentView`
 * entregue ao `AppShell`.
 *
 * Fluxo coberto (o mesmo do app):
 *   GlobalKeyboardProvider → useGlobalKeyboardShortcuts (registry global)
 *     → `navigateToView('dashboard')` (fonte única em
 *       `src/hooks/system/useNavigationHistory.ts`: grava `?view=dashboard` e
 *       emite `zapp:navigate`)
 *     → `useNavigationHistory` do `Index` (escuta `zapp:navigate`)
 *     → prop `currentView` do `AppShell`.
 *
 * Com a implementação antiga (`navigate('/')` + toast) a URL canônica seguia
 * `?view=inbox`, nenhum `zapp:navigate` saía e o shell recebia `inbox` — as duas
 * asserções do primeiro caso falham.
 *
 * Observação de escopo: este commit inclui a correção de produção do hook
 * `go-to-dashboard` em `src/hooks/ui/useGlobalKeyboardShortcuts.ts`, trazida
 * como cópia da correção 5dc966476, para que a regressão exercite o fluxo real.
 * Os dublês abaixo são só os painéis e hooks de dados do shell, que não
 * participam do fluxo em teste.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Dublês mínimos — só o que o shell puxa e não participa do fluxo do atalho.
// ---------------------------------------------------------------------------

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

// O cliente real carrega a URL/chave de produção fixas no código; nada aqui
// precisa dele (e a guarda de rede do setup recusa qualquer chamada real).
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn(), auth: {} },
}));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u-regressao-ctrl2', email: 'regressao@local.test' },
    profile: { name: 'Regressão Ctrl+2' },
    signOut: vi.fn(),
  }),
}));
vi.mock('@/hooks/ui/useOnboarding', () => ({
  useOnboarding: () => ({
    hasCompletedOnboarding: true,
    loading: false,
    completeOnboarding: vi.fn(),
  }),
}));
vi.mock('@/hooks/ui/useOnboardingChecklist', () => ({
  useOnboardingChecklist: () => ({ isComplete: true, isDismissed: true }),
}));
vi.mock('@/hooks/communication/useTranscriptionNotifications', () => ({
  useTranscriptionNotifications: () => undefined,
}));
vi.mock('@/hooks/integrations/useGmailOAuth', () => ({
  useGmailOAuth: () => undefined,
}));
// Setas/voltar-avançar ficam fora do fluxo do Ctrl+2.
vi.mock('@/hooks/ui/useKeyboardNavigation', () => ({
  useKeyboardNavigation: () => undefined,
}));
vi.mock('@/components/onboarding/OnboardingTour', () => ({
  TourProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTour: () => ({ startTour: vi.fn() }),
  DEFAULT_ONBOARDING_STEPS: [],
}));
vi.mock('@/components/notifications/GoalNotificationProvider', () => ({
  GoalNotificationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
// O provider de SLA abre queries (`useSLANotifications`) — dado de shell, não do
// fluxo do atalho.
vi.mock('@/components/notifications/SLANotificationProvider', () => ({
  SLANotificationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Painéis secundários do shell (todos lazy no `Index`): fora do escopo.
vi.mock('@/components/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('@/components/onboarding/WelcomeModal', () => ({ WelcomeModal: () => null }));
vi.mock('@/components/ui/offline-indicator', () => ({
  OfflineIndicator: () => null,
  ConnectionToast: () => null,
}));
vi.mock('@/components/alerts/EvolutionDisconnectBanner', () => ({
  EvolutionDisconnectBanner: () => null,
}));
vi.mock('@/components/security/MfaAdminNudge', () => ({ MfaAdminNudge: () => null }));
vi.mock('@/components/performance/HotRoutePrefetcher', () => ({
  HotRoutePrefetcher: () => null,
}));

// O ponto que RECEBE a view — é aqui que a regressão é observada. O dublê
// publica `currentView` no DOM para a asserção ler o que o shell de verdade
// receberia.
vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ currentView }: { currentView: string }) => (
    <div data-testid="app-shell" data-view={currentView} />
  ),
}));

import { toast } from 'sonner';
import Index from '@/pages/Index';
import { GlobalKeyboardProvider } from '@/components/keyboard/GlobalKeyboardProvider';

/** Mesmo caminho do app: registry de atalhos por fora, `Index` (shell) por dentro. */
async function montarShell(entrada = '/?view=inbox') {
  // O `await act` deixa os painéis `lazy` do shell resolverem DENTRO do act
  // (senão o React avisa "suspended resource finished loading").
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[entrada]}>
        <GlobalKeyboardProvider>
          <Index />
        </GlobalKeyboardProvider>
      </MemoryRouter>,
    );
  });
}

function teclar(key: string, extra: KeyboardEventInit = {}) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...extra }));
  });
}

/** View entregue ao shell agora (é o `currentView` que o AppShell recebe). */
function viewNoShell(): string | null {
  return screen.getByTestId('app-shell').getAttribute('data-view');
}

/** View da URL canônica do app (`?view=<id>`) — o outro sintoma do #447. */
function viewNaUrl(): string | null {
  return new URLSearchParams(window.location.search).get('view');
}

describe('#447 — Ctrl+2 troca a view do shell para dashboard', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState(null, '', '/');
  });

  it('Ctrl+2 partindo de ?view=inbox faz o shell receber dashboard', async () => {
    window.history.replaceState(null, '', '/?view=inbox');
    await montarShell('/?view=inbox');

    // Partida: o shell está mesmo em inbox.
    expect(viewNoShell()).toBe('inbox');

    teclar('2', { ctrlKey: true });

    // A view observável do shell mudou de verdade...
    expect(viewNoShell()).toBe('dashboard');
    // ...e a URL canônica acompanhou (?view=dashboard, não a raiz).
    expect(viewNaUrl()).toBe('dashboard');
    // O aviso continua acontecendo — mas ele não é a prova.
    expect(toast.info).toHaveBeenCalledWith('📊 Dashboard', { duration: 1500 });
  });

  it('Ctrl+2 já em ?view=dashboard mantém o shell em dashboard', async () => {
    window.history.replaceState(null, '', '/?view=dashboard');
    await montarShell('/?view=dashboard');
    expect(viewNoShell()).toBe('dashboard');

    teclar('2', { ctrlKey: true });

    expect(viewNoShell()).toBe('dashboard');
    expect(viewNaUrl()).toBe('dashboard');
  });

  it('o "2" sem Ctrl não troca a view do shell (o modificador continua obrigatório)', async () => {
    window.history.replaceState(null, '', '/?view=inbox');
    await montarShell('/?view=inbox');

    teclar('2');

    expect(viewNoShell()).toBe('inbox');
    expect(viewNaUrl()).toBe('inbox');
  });
});
