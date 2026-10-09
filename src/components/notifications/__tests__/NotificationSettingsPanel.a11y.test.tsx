/**
 * A11Y: Switch sem nome acessível em NotificationSettingsPanel.
 * Cada Switch precisa de aria-label ligado ao rótulo visível.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationSettingsPanel } from '../NotificationSettingsPanel';

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: {
      soundEnabled: true,
      soundVolume: 70,
      browserNotifications: false,
      quietHoursEnabled: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
      sentimentAlertEnabled: true,
      sentimentAlertThreshold: 30,
      sentimentConsecutiveCount: 3,
      transcriptionNotificationEnabled: true,
      messageSoundType: 'chime',
      mentionSoundType: 'bell',
      slaSoundType: 'alert',
      goalSoundType: 'chime',
      transcriptionSoundType: 'soft',
    },
    updateSettings: vi.fn(),
    resetSettings: vi.fn(),
    isQuietHours: () => false,
    isLoading: false,
    isSaving: false,
  }),
}));

vi.mock('@/hooks/system/usePushNotifications', () => ({
  usePushNotifications: () => ({
    isEnabled: false,
    isSupported: true,
    permission: 'default',
    isSubscribed: false,
    isLoading: false,
    toggleSubscription: vi.fn(),
    showNotification: vi.fn(),
  }),
}));

vi.mock('@/utils/notificationSounds', () => ({
  previewSound: vi.fn(),
  requestNotificationPermission: vi.fn().mockResolvedValue('granted'),
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: vi.fn(),
}));

describe('a11y: Switch com nome acessível', () => {
  it('Switch de som tem aria-label', () => {
    render(<NotificationSettingsPanel />);
    expect(screen.getByRole('switch', { name: /Ativar sons de notificação/i })).toBeInTheDocument();
  });

  it('Switch de notificações do navegador tem aria-label', () => {
    render(<NotificationSettingsPanel />);
    expect(screen.getByRole('switch', { name: /Notificações do navegador/i })).toBeInTheDocument();
  });
});