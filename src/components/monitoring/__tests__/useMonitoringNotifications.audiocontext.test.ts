/**
 * Item (2026-10-15): cada alerta de conexão perdida criava um `new AudioContext()` novo.
 *
 * O navegador limita contextos de áudio simultâneos (~6 no Chrome); passado o limite, os
 * alertas seguintes ficam MUDOS (e o contexto antigo nunca é liberado). Agora o contexto é
 * único e reaproveitado, e um contexto suspenso é retomado antes de agendar o tom.
 *
 * Prova: 10 alertas seguidos criam UM contexto e continuam produzindo os 10 tons.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ConnectionInfo } from '@/components/monitoring/hooks/types';

let contextosCriados = 0;
let tonsAgendados = 0;
const ganhos: number[] = [];

vi.stubGlobal(
  'AudioContext',
  class FakeAudioContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    resume = vi.fn();
    constructor() { contextosCriados += 1; }
    createOscillator() {
      return {
        type: 'sine',
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: () => { tonsAgendados += 1; },
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

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: { soundEnabled: true, soundVolume: 40 },
    updateSettings: vi.fn(),
    isQuietHours: () => false,
  }),
}));

import { useMonitoringNotifications } from '@/components/monitoring/hooks/useMonitoringNotifications';

const conn = (id: string, status: string): ConnectionInfo =>
  ({ id, status, instance_id: id }) as unknown as ConnectionInfo;

beforeEach(() => {
  contextosCriados = 0;
  tonsAgendados = 0;
  ganhos.length = 0;
});

describe('useMonitoringNotifications — AudioContext único para os alertas', () => {
  it('10 alertas seguidos reaproveitam UM contexto e continuam tocando', () => {
    const { result } = renderHook(() => useMonitoringNotifications());

    const conectadas = Array.from({ length: 10 }, (_, i) => conn(`c${i}`, 'connected'));
    const caidas = conectadas.map(c => conn(c.id, 'disconnected'));

    act(() => { result.current.checkDisconnections(conectadas); });
    act(() => { result.current.checkDisconnections(caidas); });

    expect(tonsAgendados).toBe(10);
    expect(ganhos).toHaveLength(10);
    expect(ganhos.every(g => g === 0.3 * (40 / 100))).toBe(true);
    // Antes: 10 contextos abertos (mudo a partir do 7º); agora: um só, reutilizado.
    expect(contextosCriados).toBe(1);
  });
});
