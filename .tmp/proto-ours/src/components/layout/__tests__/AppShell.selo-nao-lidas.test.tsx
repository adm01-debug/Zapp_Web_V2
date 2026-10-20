/**
 * PE-30/31 — ligação do total real de não lidas entre a página e as duas barras.
 *
 * Sintoma que este arquivo trava: `src/pages/Index.tsx` passava
 * `unreadNotifications={0}` CRAVADO para o `AppShell`, e o `AppShell` não tinha
 * como levar o total do Teams para a barra lateral nem para a barra inferior do
 * celular — os selos de Chat e Teams nunca apareciam, qualquer que fosse o
 * número de conversas não lidas.
 *
 * O que se prova aqui é a PASSAGEM (AppShell → Sidebar / MobileShell), com as
 * duas barras trocadas por stubs que registram as props recebidas; o desenho do
 * selo em si é provado nos testes reais das barras
 * (`Sidebar.test.tsx` e `MobileShell.notificacoes.test.tsx`).
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MutableRefObject } from 'react';

const estado = vi.hoisted(() => ({
  isMobile: false,
  sidebar: null as Record<string, unknown> | null,
  mobile: null as Record<string, unknown> | null,
}));

vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => estado.isMobile }));

vi.mock('@/components/layout/Sidebar', async () => {
  const { createElement } = await import('react');
  return {
    Sidebar: (props: Record<string, unknown>) => {
      estado.sidebar = props;
      return createElement('div', { 'data-testid': 'sidebar-stub' });
    },
  };
});

vi.mock('@/components/mobile/MobileShell', async () => {
  const { createElement } = await import('react');
  return {
    MobileShell: (props: Record<string, unknown>) => {
      estado.mobile = props;
      return createElement('div', { 'data-testid': 'mobile-shell-stub' });
    },
  };
});

vi.mock('@/pages/ViewRouter', () => ({ ViewRouter: () => null }));
vi.mock('@/components/layout/VoiceActionBridge', () => ({ VoiceActionBridge: () => null }));
vi.mock('@/components/calls/ActiveCallBar', () => ({ ActiveCallBar: () => null }));
vi.mock('@/components/onboarding/OnboardingChecklist', () => ({ OnboardingChecklist: () => null }));
vi.mock('@/components/ui/route-loading-bar', () => ({ RouteLoadingBar: () => null }));
vi.mock('@/components/layout/A11yBoilerplate', () => ({ A11yBoilerplate: () => null }));
vi.mock('@/components/layout/ZenModeToggle', () => ({ ZenModeToggle: () => null }));
vi.mock('@/hooks/ui/useSwipeNavigation', () => ({ useSwipeNavigation: () => undefined }));
vi.mock('@/hooks/ui/useNavShortcuts', () => ({ useNavShortcuts: () => undefined }));
vi.mock('@/hooks/crm/useAgentPresence', () => ({ useAgentPresenceJoin: () => undefined }));

import { AppShell } from '@/components/layout/AppShell';

const navDirectionRef: MutableRefObject<'forward' | 'back'> = { current: 'forward' };

function props(over: Record<string, unknown> = {}) {
  return {
    currentView: 'inbox',
    setCurrentView: vi.fn(),
    userId: 'user-1',
    canGoBack: false,
    canGoForward: false,
    goBack: vi.fn(),
    goForward: vi.fn(),
    breadcrumbTrail: [],
    navDirectionRef,
    profile: null,
    userEmail: 'teste@local',
    signOut: vi.fn(),
    unreadNotifications: 0,
    showChecklist: false,
    loading: false,
    ...over,
  };
}

beforeEach(() => {
  estado.isMobile = false;
  estado.sidebar = null;
  estado.mobile = null;
});

beforeAll(() => {
  // o destaque de acessibilidade do shell só age em ambiente com matchMedia
  window.matchMedia = window.matchMedia ?? ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

describe('AppShell — totais de não lidas chegam às duas barras (PE-31)', () => {
  it('passa o total do Chat e o do Teams para a barra lateral', () => {
    render(<AppShell {...props({ unreadNotifications: 7, teamsUnread: 4 })} />);

    expect(screen.getByTestId('sidebar-stub')).not.toBeNull();
    expect(estado.sidebar?.inboxBadge).toBe(7);
    expect(estado.sidebar?.teamsBadge).toBe(4);
  });

  it('passa os MESMOS totais para a barra inferior do celular', async () => {
    estado.isMobile = true;
    render(<AppShell {...props({ unreadNotifications: 7, teamsUnread: 4 })} />);

    expect(await screen.findByTestId('mobile-shell-stub')).not.toBeNull();
    expect(estado.mobile?.unreadNotifications).toBe(7);
    expect(estado.mobile?.teamsUnread).toBe(4);
    expect(screen.queryByTestId('sidebar-stub')).toBeNull();
  });

  it('total 0 não vira selo (a barra recebe "sem selo", não o número 0)', () => {
    render(<AppShell {...props({ unreadNotifications: 0, teamsUnread: 0 })} />);

    expect(estado.sidebar?.inboxBadge).toBeUndefined();
    expect(estado.sidebar?.teamsBadge).toBeUndefined();
  });
});
