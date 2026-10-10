/**
 * N-198: os controles de som por tipo e o botão "Testar som"
 * precisam de nome acessível (aria-label) para que leitores de
 * tela anunciem o que cada controle faz.
 *
 * O teste falha sem a correção (RED) e passa depois (GREEN).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({
  settings: {
    soundEnabled: true,
    soundVolume: 70,
    browserNotifications: false,
    slaBreachSound: true,
    newMessageSound: true,
    mentionSound: true,
    desktopAlerts: false,
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
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: h.settings,
    updateSettings: h.updateSettings,
    isQuietHours: () => false,
  }),
}));

vi.mock('@/utils/notificationSounds', () => ({
  playNotificationSound: vi.fn(),
  previewSound: vi.fn(),
  requestNotificationPermission: vi.fn().mockResolvedValue(true),
}));

import { NotificationSettingsPanel } from '../NotificationSettingsPanel';
import { NotificationTypeSection } from '../NotificationTypeCards';
import { TooltipProvider } from '@/components/ui/tooltip';

function renderPanel() {
  return render(
    <TooltipProvider>
      <NotificationSettingsPanel />
    </TooltipProvider>,
  );
}

describe('N-198 — controles de som com nome acessível', () => {
  it('o botão "Testar som" mestre tem aria-label', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Testar som' })).toBeInTheDocument();
  });

  it('o seletor de som de mensagem tem aria-label "Som de mensagem"', () => {
    render(
      <TooltipProvider>
        <NotificationTypeSection
          settings={h.settings}
          updateSettings={h.updateSettings}
        />
      </TooltipProvider>,
    );
    expect(
      screen.getByRole('combobox', { name: 'Som de mensagem' }),
    ).toBeInTheDocument();
  });

  it('o botão de testar som de mensagem tem aria-label "Testar som de mensagem"', () => {
    render(
      <TooltipProvider>
        <NotificationTypeSection
          settings={h.settings}
          updateSettings={h.updateSettings}
        />
      </TooltipProvider>,
    );
    expect(
      screen.getByRole('button', { name: 'Testar som de mensagem' }),
    ).toBeInTheDocument();
  });

});
