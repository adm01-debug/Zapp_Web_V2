/**
 * A11Y: Switch sem nome acessível em NotificationSettingsPanel.
 * Cada Switch é rotulado pelo título visível do cartão via aria-labelledby (SHELL-14, WCAG 2.5.3).
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

// O cartão "Alertas de Conexão" (PD-38) lê as preferências do usuário pelo hook,
// que depende do AuthProvider — a tela é renderizada aqui sem provider, então o
// hook entra falso (mesmo padrão do usePushNotifications acima).
vi.mock('@/hooks/system/useConnectionAlertPreferences', () => ({
  useConnectionAlertPreferences: () => ({
    preferences: { push_enabled: true, email_enabled: true, alert_on_degraded: true, alert_on_disconnected: true },
    isLoading: false,
    isSaving: false,
    updatePreference: vi.fn(),
    updatePreferenceAsync: vi.fn(),
    shouldNotify: () => true,
  }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: vi.fn(),
}));

describe('a11y: Switch com nome acessível', () => {
  it('Switch de som tem o nome do título visível "Sons de Notificação"', () => {
    render(<NotificationSettingsPanel />);
    const sw = screen.getByRole('switch', { name: /Sons de Notificação/i });
    expect(sw).toBeInTheDocument();
    expect(sw.getAttribute('aria-labelledby')).toBe('notif-sound-title');
    expect(document.getElementById('notif-sound-title')).toHaveTextContent(/Sons de Notificação/i);
  });

  it('Switch de notificações do navegador tem o nome do título visível', () => {
    render(<NotificationSettingsPanel />);
    const sw = screen.getByRole('switch', { name: /Notificações do Navegador/i });
    expect(sw).toBeInTheDocument();
    expect(sw.getAttribute('aria-labelledby')).toBe('notif-browser-title');
    expect(document.getElementById('notif-browser-title')).toHaveTextContent(/Notificações do Navegador/i);
  });
});
