import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Mocks comuns (toast, logger, framer-motion, ResizeObserver) — o painel renderiza `motion.div`.
import '@/test/volumeControlMocks';

import { toast } from '@/hooks/ui/use-toast';

const h = vi.hoisted(() => ({
  resetSettings: vi.fn(),
}));

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
    resetSettings: h.resetSettings,
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

import { NotificationSettingsPanel } from '../NotificationSettingsPanel';

const restaurar = () => screen.getByRole('button', { name: /Restaurar Configurações Padrão/i });

/** Deixa o handler assíncrono do clique terminar (o `await resetSettings()` interno). */
const assentar = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe('NotificationSettingsPanel — restaurar preferências', () => {
  beforeEach(() => {
    h.resetSettings.mockReset();
    vi.mocked(toast).mockClear();
  });

  it('banco recusando: não anuncia sucesso (o hook avisa o erro e devolve false)', async () => {
    h.resetSettings.mockResolvedValue(false);
    render(<NotificationSettingsPanel />);

    fireEvent.click(restaurar());
    await assentar();

    expect(h.resetSettings).toHaveBeenCalled();
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
  });

  it('banco grava: anuncia o sucesso só depois de confirmar', async () => {
    h.resetSettings.mockResolvedValue(true);
    render(<NotificationSettingsPanel />);

    fireEvent.click(restaurar());
    await assentar();

    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('resetadas') }),
    );
  });
});
