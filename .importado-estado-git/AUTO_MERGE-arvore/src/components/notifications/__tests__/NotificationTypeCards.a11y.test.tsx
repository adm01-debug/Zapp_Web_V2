/**
 * A11Y: Switches de NotificationTypeCards rotulados pelo texto visível (SHELL-14, WCAG 2.5.3).
 * NotifRow: aria-label contém o título da linha. Sentiment/QuietHours: aria-labelledby no CardTitle.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationTypeSection, SentimentAlertCard, QuietHoursCard } from '../NotificationTypeCards';

const baseSettings = {
  soundEnabled: true,
  soundVolume: 70,
  browserNotifications: false,
  newMessageSound: true,
  mentionSound: true,
  slaBreachSound: true,
  desktopAlerts: true,
  transcriptionNotificationEnabled: true,
  messageSoundType: 'chime',
  mentionSoundType: 'bell',
  slaSoundType: 'alert',
  goalSoundType: 'chime',
  transcriptionSoundType: 'soft',
  sentimentAlertEnabled: true,
  sentimentAlertThreshold: 30,
  sentimentConsecutiveCount: 3,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
} as const;

describe('a11y: NotificationTypeCards Switches com nome acessível', () => {
  it('cada linha tem Switch com o nome do seu título visível', () => {
    render(
      <NotificationTypeSection
        settings={{ ...baseSettings }}
        updateSettings={vi.fn()}
      />,
    );
    for (const title of ['Novas Mensagens', 'Menções', 'Violação de SLA', 'Transcrição de Áudio']) {
      expect(screen.getByRole('switch', { name: new RegExp(title, 'i') })).toBeInTheDocument();
    }
  });

  it('Switch de sentimento tem o nome do título visível "Alertas de Sentimento"', () => {
    render(<SentimentAlertCard settings={{ ...baseSettings }} updateSettings={vi.fn()} />);
    const sw = screen.getByRole('switch', { name: /Alertas de Sentimento/i });
    expect(sw).toBeInTheDocument();
    expect(sw.getAttribute('aria-labelledby')).toBe('sentiment-alert-title');
    expect(document.getElementById('sentiment-alert-title')).toHaveTextContent(/Alertas de Sentimento/i);
  });

  it('Switch de horário silencioso tem o nome do título visível "Horário Silencioso"', () => {
    render(
      <QuietHoursCard settings={{ ...baseSettings }} updateSettings={vi.fn()} isQuietHours={() => false} />,
    );
    const sw = screen.getByRole('switch', { name: /Horário Silencioso/i });
    expect(sw).toBeInTheDocument();
    expect(sw.getAttribute('aria-labelledby')).toBe('quiet-hours-title');
    expect(document.getElementById('quiet-hours-title')).toHaveTextContent(/Horário Silencioso/i);
  });
});
