/**
 * A11Y: Switch sem nome acessível em SecurityNotificationsPanel.
 * O Switch precisa de aria-label ligado ao rótulo visível.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SecurityNotificationsPanel } from '../SecurityNotificationsPanel';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    })),
  },
}));

vi.mock('@/hooks/system/usePushNotifications', () => ({
  usePushNotifications: () => ({
    isEnabled: true,
    isSupported: true,
    permission: 'default',
    isSubscribed: true,
    isLoading: false,
    toggleSubscription: vi.fn(),
    showNotification: vi.fn(),
  }),
}));

vi.mock('@/hooks/system/useSecurityPushNotifications', () => ({
  useSecurityPushNotifications: () => ({
    isSubscribed: true,
    isLoading: false,
    handleToggle: vi.fn(),
  }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-1' } }),
}));

describe('a11y: SecurityNotificationsPanel Switch com nome acessível', () => {
  it('Switch de notificações de segurança tem aria-label', () => {
    render(<SecurityNotificationsPanel />);
    expect(screen.getByRole('switch', { name: /Notificações de segurança/i })).toBeInTheDocument();
  });
});