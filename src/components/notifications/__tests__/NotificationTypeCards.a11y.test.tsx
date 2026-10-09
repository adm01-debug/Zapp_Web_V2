/**
 * A11Y: Switch sem nome acessível em NotificationTypeCards.
 * Cada Switch precisa de aria-label ligado ao rótulo visível.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationTypeSection } from '../NotificationTypeCards';

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: vi.fn(),
}));

const settings = {
  newMessageSound: true,
  mentionSound: true,
  slaSound: true,
  goalSound: true,
  transcriptionSound: true,
  quietHoursEnabled: false,
  sentimentAlertEnabled: true,
  sentimentAlertThreshold: 30,
  sentimentConsecutiveCount: 3,
  transcriptionNotificationEnabled: true,
  messageSoundType: 'chime',
  mentionSoundType: 'bell',
  slaSoundType: 'alert',
  goalSoundType: 'chime',
  transcriptionSoundType: 'soft',
  soundEnabled: true,
  soundVolume: 70,
  browserNotifications: false,
};

describe('a11y: Switch com nome acessível em NotificationTypeSection', () => {
  it('Switch de novas mensagens tem aria-label', () => {
    render(
      <NotificationTypeSection
        settings={settings}
        updateSettings={vi.fn()}
      />
    );
    expect(screen.getByRole('switch', { name: /Ativar notificação/i })).toBeInTheDocument();
  });
});