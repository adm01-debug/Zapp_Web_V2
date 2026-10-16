import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mocks comuns (toast, logger, framer-motion, ResizeObserver) — o painel renderiza `motion.div`.
import '@/test/volumeControlMocks';

import { toast } from '@/hooks/ui/use-toast';

// ---------------------------------------------------------------------------
// t_219641c9 — "Testar som" precisa AVISAR quando o navegador recusa tocar.
//
// `previewSound` (src/utils/notificationSounds.ts) devolve `false` quando o navegador
// recusou (sem WebAudio/áudio bloqueado) e o painel ignorava o retorno: o clique parecia
// ter tocado. Aqui o painel REAL é renderizado com o player mockado nos dois ramos do
// retorno; a prova é o toast do painel e o fato de nenhuma preferência ser gravada
// (updateSettings nunca é chamado).
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  previewSound: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: {
      soundEnabled: true,
      soundVolume: 70,
      browserNotifications: false,
      slaBreachSound: true,
      newMessageSound: true,
      mentionSound: true,
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
    updateSettings: h.updateSettings,
    resetSettings: vi.fn().mockResolvedValue(true),
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
  previewSound: h.previewSound,
  playNotificationSound: vi.fn(),
  requestNotificationPermission: vi.fn().mockResolvedValue(true),
}));

import { NotificationSettingsPanel } from '../NotificationSettingsPanel';

const botaoTestar = () => screen.getByRole('button', { name: 'Testar som' });

describe('NotificationSettingsPanel — aviso quando o navegador recusa tocar o som', () => {
  beforeEach(() => {
    h.previewSound.mockReset();
    h.updateSettings.mockReset();
    vi.mocked(toast).mockClear();
  });

  it('recusa (false): avisa que o navegador não deixou tocar e não grava preferência', () => {
    h.previewSound.mockReturnValue(false);
    render(<NotificationSettingsPanel />);

    fireEvent.click(botaoTestar());

    expect(h.previewSound).toHaveBeenCalledWith('chime', 70);
    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('não deixou tocar o som'),
        variant: 'destructive',
      }),
    );
    expect(h.updateSettings).not.toHaveBeenCalled();
  });

  it('tocou (true): prévia normal e nenhum aviso', () => {
    h.previewSound.mockReturnValue(true);
    render(<NotificationSettingsPanel />);

    fireEvent.click(botaoTestar());

    expect(h.previewSound).toHaveBeenCalledWith('chime', 70);
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
    expect(h.updateSettings).not.toHaveBeenCalled();
  });
});
