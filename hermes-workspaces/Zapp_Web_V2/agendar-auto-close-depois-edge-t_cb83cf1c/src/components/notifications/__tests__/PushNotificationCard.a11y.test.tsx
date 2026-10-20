/**
 * A11Y: Switch sem nome acessível em PushNotificationCard.
 * O Switch é rotulado pelo título visível "Notificações Push" via aria-labelledby (WCAG 2.5.3).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PushNotificationCard } from '../PushNotificationCard';

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

describe('a11y: PushNotificationCard Switch com nome acessível', () => {
  it('Switch tem o nome do título visível "Notificações Push"', () => {
    render(<PushNotificationCard />);
    const sw = screen.getByRole('switch', { name: /Notificações Push/i });
    expect(sw).toBeInTheDocument();
    expect(sw.getAttribute('aria-labelledby')).toBe('push-notif-title');
    expect(document.getElementById('push-notif-title')).toHaveTextContent(/Notificações Push/i);
  });
});
