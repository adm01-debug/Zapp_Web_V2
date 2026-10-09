/**
 * A11Y: Switch sem nome acessível em PushNotificationCard.
 * O Switch precisa de aria-label ligado ao rótulo visível.
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
  it('Switch de notificações push tem aria-label', () => {
    render(<PushNotificationCard />);
    expect(screen.getByRole('switch', { name: /Notificações push/i })).toBeInTheDocument();
  });
});