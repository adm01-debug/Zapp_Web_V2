import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/components/errors/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/ui/skip-link', () => ({ SkipLinks: () => null }));
vi.mock('@/components/ui/visually-hidden', () => ({ LiveRegion: () => null }));
vi.mock('@/components/keyboard/GlobalKeyboardProvider', () => ({
  GlobalKeyboardProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/providers/AppProviders', () => ({
  AppProviders: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('react-router-dom', () => ({
  BrowserRouter: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: null }) }));
vi.mock('@/hooks/realtime/useGlobalIncomingMessageAlerts', () => ({
  useGlobalIncomingMessageAlerts: vi.fn(),
}));

vi.mock('@/routes/AppRoutes', async () => {
  const { toast } = await import('@/hooks/ui/use-toast');
  return {
    AppRoutes: () => (
      <button onClick={() => toast({ title: 'Aviso do store legado' })}>
        Disparar aviso legado
      </button>
    ),
  };
});

vi.mock('@/components/notifications/RealtimeSentimentAlertProvider', () => ({
  RealtimeSentimentAlertProvider: () => null,
}));
vi.mock('@/components/calls/IncomingCallAlert', () => ({ IncomingCallAlert: () => null }));
vi.mock('@/components/calls/OutboundCallDialog', () => ({ OutboundCallDialog: () => null }));
vi.mock('@/components/effects/EasterEggs', () => ({
  EasterEggsProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/team-chat/TeamChatNotificationsListener', () => ({
  TeamChatNotificationsListener: () => null,
}));
vi.mock('@/components/notifications/SecurityPushNotificationsListener', () => ({
  SecurityPushNotificationsListener: () => null,
}));
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));
vi.mock('@/components/gamification/AchievementToast', () => ({
  AchievementCelebrationToaster: () => null,
}));
vi.mock('@/hooks/system/useServiceWorker', () => ({ useServiceWorker: vi.fn() }));
vi.mock('@/hooks/ui/useScreenProtection', () => ({ useScreenProtection: vi.fn() }));
vi.mock('@/hooks/system/useOfflineSendQueueDrain', () => ({
  useOfflineSendQueueDrain: vi.fn(),
}));

import App from '@/App';

afterEach(cleanup);

describe('App — host da API legada use-toast', () => {
  it('exibe avisos emitidos pelo store legado através do toaster lazy global', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Disparar aviso legado' }));

    expect(await screen.findByText('Aviso do store legado')).toBeInTheDocument();
  });
});
