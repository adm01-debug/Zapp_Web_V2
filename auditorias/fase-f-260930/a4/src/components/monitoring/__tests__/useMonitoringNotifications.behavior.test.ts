import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ConnectionInfo } from '@/components/monitoring/hooks/types';

/**
 * Bugs: (1) o ganho do alerta de monitoramento era 0.3 CRAVADO; (2) o mudo vinha de
 * `localStorage('monitoring_sound')`, não da preferência do usuário.
 * Agora: volume de `settings.soundVolume`, mudo de `settings.soundEnabled` + horário de silêncio.
 */

const ganhos: number[] = [];

vi.stubGlobal(
  'AudioContext',
  class FakeAudioContext {
    currentTime = 0;
    destination = {};
    createOscillator() {
      return {
        type: 'sine',
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
    }
    createGain() {
      return {
        connect: vi.fn(),
        gain: {
          setValueAtTime: (valor: number) => { ganhos.push(valor); },
          exponentialRampToValueAtTime: vi.fn(),
        },
      };
    }
  },
);

const settingsState = { soundVolume: 40, soundEnabled: true };
let quiet = false;
const updateSettings = vi.fn();

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: settingsState,
    updateSettings,
    isQuietHours: () => quiet,
  }),
}));

import { useMonitoringNotifications } from '@/components/monitoring/hooks/useMonitoringNotifications';

const conn = (id: string, status: string): ConnectionInfo =>
  ({ id, status, instance_id: id }) as unknown as ConnectionInfo;

describe('useMonitoringNotifications — volume e mudo das preferências', () => {
  beforeEach(() => {
    ganhos.length = 0;
    settingsState.soundVolume = 40;
    settingsState.soundEnabled = true;
    quiet = false;
    updateSettings.mockClear();
  });

  it('volume do painel 40 → ganho 0.12 (0.3 * 0.4), nunca 0.3 cravado', () => {
    const { result } = renderHook(() => useMonitoringNotifications());

    act(() => { result.current.checkDisconnections([conn('c1', 'connected')]); });
    act(() => { result.current.checkDisconnections([conn('c1', 'disconnected')]); });

    expect(ganhos).toContain(0.12);
    expect(ganhos).not.toContain(0.3);
  });

  it('NÃO toca com o mudo ligado na preferência (soundEnabled=false)', () => {
    settingsState.soundEnabled = false;
    const { result } = renderHook(() => useMonitoringNotifications());

    act(() => { result.current.checkDisconnections([conn('c1', 'connected')]); });
    act(() => { result.current.checkDisconnections([conn('c1', 'disconnected')]); });

    expect(ganhos).toHaveLength(0);
  });

  it('NÃO toca em horário de silêncio mesmo com som ligado', () => {
    quiet = true;
    const { result } = renderHook(() => useMonitoringNotifications());

    act(() => { result.current.checkDisconnections([conn('c1', 'connected')]); });
    act(() => { result.current.checkDisconnections([conn('c1', 'disconnected')]); });

    expect(ganhos).toHaveLength(0);
  });

  it('setSoundEnabled grava na preferência do usuário, não em localStorage', () => {
    const { result } = renderHook(() => useMonitoringNotifications());

    act(() => { result.current.setSoundEnabled(false); });

    expect(updateSettings).toHaveBeenCalledWith({ soundEnabled: false });
  });
});
