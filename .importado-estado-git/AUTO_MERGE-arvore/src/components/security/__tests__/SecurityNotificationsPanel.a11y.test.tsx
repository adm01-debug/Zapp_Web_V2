/**
 * A11Y: Switch sem nome acessível em SecurityNotificationsPanel.
 * O Switch é rotulado pelo título visível "Status das Notificações" via aria-labelledby (WCAG 2.5.3).
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
  it('Switch tem o nome do título visível "Status das Notificações"', () => {
    render(<SecurityNotificationsPanel />);
    const sw = screen.getByRole('switch', { name: /Status das Notificações/i });
    expect(sw).toBeInTheDocument();
    expect(sw.getAttribute('aria-labelledby')).toBe('security-notif-status-title');
    expect(document.getElementById('security-notif-status-title')).toHaveTextContent(/Status das Notificações/i);
  });
});
