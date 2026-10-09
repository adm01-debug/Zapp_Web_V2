import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TC-007 — prova por renderização: o app mantém exatamente um listener global e
 * montar a view do Team Chat apenas publica o foco, sem abrir outro listener.
 */
const h = vi.hoisted(() => ({
  listener: vi.fn(() => null),
  publishActiveConversation: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/components/ui/toaster', () => ({ Toaster: () => null }));
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));
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
vi.mock('@/routes/AppRoutes', () => ({ AppRoutes: () => null }));
vi.mock('react-router-dom', () => ({
  BrowserRouter: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/notifications/RealtimeSentimentAlertProvider', () => ({
  RealtimeSentimentAlertProvider: () => null,
}));
vi.mock('@/components/calls/IncomingCallAlert', () => ({ IncomingCallAlert: () => null }));
vi.mock('@/components/effects/EasterEggs', () => ({
  EasterEggsProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/mobile/InAppNotificationProvider', () => ({
  InAppNotificationProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/team-chat/TeamChatNotificationsListener', () => ({
  TeamChatNotificationsListener: h.listener,
}));
vi.mock('@/hooks/system/useServiceWorker', () => ({ useServiceWorker: vi.fn() }));
vi.mock('@/hooks/ui/useScreenProtection', () => ({ useScreenProtection: vi.fn() }));

vi.mock('@/hooks/chat/useTeamChat', () => ({ useTeamConversations: () => ({ data: [] }) }));
vi.mock('@/hooks/chat/useTeamChatNotifications', () => ({
  useActiveTeamChatConversation: h.publishActiveConversation,
  useTeamChatNotifications: vi.fn(),
}));
vi.mock('@/components/team-chat/TeamConversationList', () => ({ TeamConversationList: () => null }));
vi.mock('@/components/team-chat/TeamChatPanel', () => ({ TeamChatPanel: () => null }));
vi.mock('@/components/team-chat/TeamMemberDetails', () => ({ TeamMemberDetails: () => null }));
vi.mock('@/components/team-chat/NewConversationDialog', () => ({ NewConversationDialog: () => null }));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children }: { children: React.ReactNode }) => React.createElement('button', null, children),
}));
vi.mock('lucide-react', () => ({ MessageSquare: () => null, Users: () => null, Plus: () => null }));
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  },
}));

import App from '@/App';
import { TeamChatView } from '@/components/team-chat/TeamChatView';

describe('TC-007 — listener de notificações do Team Chat é único e global', () => {
  beforeEach(() => {
    h.listener.mockClear();
    h.publishActiveConversation.mockClear();
  });

  afterEach(cleanup);

  it('monta um listener no app mesmo sem a view do Team Chat', async () => {
    render(React.createElement(App));

    await waitFor(() => expect(h.listener).toHaveBeenCalledTimes(1));
  });

  it('montar TeamChatView publica o foco sem montar um segundo listener', async () => {
    render(React.createElement(App));
    await waitFor(() => expect(h.listener).toHaveBeenCalledTimes(1));

    render(React.createElement(TeamChatView));

    expect(h.publishActiveConversation).toHaveBeenCalledWith(null);
    expect(h.listener).toHaveBeenCalledTimes(1);
  });
});
