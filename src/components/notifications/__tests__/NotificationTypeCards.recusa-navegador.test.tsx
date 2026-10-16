/**
 * t_0be31284 — "Testar som de <tipo>" precisa AVISAR quando o navegador recusa tocar.
 *
 * `playNotificationSound` (src/utils/notificationSounds.ts) devolve `boolean` — `false` quando o
 * navegador recusou (sem WebAudio / áudio bloqueado nesta aba). O SoundSelector de
 * NotificationTypeCards ignorava o retorno: o botão "Testar som de <tipo>" ficava sem aviso e a
 * pessoa achava que o som tinha tocado. Aqui o componente REAL é renderizado com o player mockado
 * nos dois ramos do retorno; a prova é o toast e o fato de nenhuma preferência ser gravada
 * (updateSettings nunca é chamado).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mocks comuns (toast) — o mesmo bloco usado pelos testes dos outros controles de som.
import '@/test/volumeControlMocks';

import { toast } from '@/hooks/ui/use-toast';

const h = vi.hoisted(() => ({
  playNotificationSound: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock('@/utils/notificationSounds', () => ({
  playNotificationSound: h.playNotificationSound,
}));

import { NotificationTypeSection } from '../NotificationTypeCards';

const baseSettings = {
  soundEnabled: true,
  soundVolume: 70,
  browserNotifications: false,
  newMessageSound: true,
  mentionSound: true,
  slaBreachSound: true,
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

const botaoTestarMensagem = () =>
  screen.getByRole('button', { name: 'Testar som de mensagem' });

const renderSecao = () =>
  render(
    <NotificationTypeSection
      settings={{ ...baseSettings }}
      updateSettings={h.updateSettings}
    />,
  );

describe('NotificationTypeCards — aviso quando o navegador recusa tocar o som', () => {
  beforeEach(() => {
    h.playNotificationSound.mockReset();
    h.updateSettings.mockReset();
    vi.mocked(toast).mockClear();
  });

  it('recusa (false): avisa que o navegador não deixou tocar e não grava preferência', () => {
    h.playNotificationSound.mockReturnValue(false);
    renderSecao();

    fireEvent.click(botaoTestarMensagem());

    expect(h.playNotificationSound).toHaveBeenCalledWith('message', 'chime', 70);
    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('não deixou tocar o som'),
        variant: 'destructive',
      }),
    );
    expect(h.updateSettings).not.toHaveBeenCalled();
    // O botão não fica travado esperando o fim de um som que nunca tocou.
    expect(botaoTestarMensagem()).not.toBeDisabled();
  });

  it('tocou (true): comportamento atual, nenhum aviso', () => {
    h.playNotificationSound.mockReturnValue(true);
    renderSecao();

    fireEvent.click(botaoTestarMensagem());

    expect(h.playNotificationSound).toHaveBeenCalledWith('message', 'chime', 70);
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
    expect(h.updateSettings).not.toHaveBeenCalled();
  });

  it('retorno `undefined` (player desta base, sem boolean): nenhum aviso falso', () => {
    // Guarda contra o aviso disparar em TODO clique: enquanto a base não tiver o player que
    // devolve `boolean`, o retorno é `undefined` e nada pode ser anunciado como recusa.
    h.playNotificationSound.mockReturnValue(undefined);
    renderSecao();

    fireEvent.click(botaoTestarMensagem());

    expect(vi.mocked(toast)).not.toHaveBeenCalled();
  });
});
