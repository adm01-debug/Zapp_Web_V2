import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Bug: os ganhos do som de team chat eram 0.2 / 0.15 CRAVADOS no código, ignorando o volume
 * do painel. O teste aplica volumes diferentes e exige que o ganho escale por `volume/100`.
 */

const rampas: number[] = [];

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: null }) }));
vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({ settings: {}, isQuietHours: () => false }),
}));
vi.mock('@/hooks/system/usePushNotifications', () => ({ usePushNotifications: () => ({}) }));

vi.stubGlobal(
  'AudioContext',
  class FakeAudioContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    resume = vi.fn();
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
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: (valor: number) => { rampas.push(valor); },
          exponentialRampToValueAtTime: vi.fn(),
        },
      };
    }
  },
);

import { playTeamChatSound } from '@/hooks/chat/useTeamChatNotifications';

const temGanho = (alvo: number) => rampas.some((r) => Math.abs(r - alvo) < 1e-9);

describe('playTeamChatSound — ganho segue o volume do painel', () => {
  beforeEach(() => { rampas.length = 0; vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('volume 100 aplica os ganhos-base (0.2 e 0.15)', () => {
    playTeamChatSound(100);
    vi.advanceTimersByTime(200); // dispara o 3º tom (setTimeout 150ms)

    expect(temGanho(0.2)).toBe(true);
    expect(temGanho(0.15)).toBe(true);
  });

  it('volume 40 aplica 40% dos ganhos-base (0.08 e 0.06) — falha se voltar a cravar 0.2/0.15', () => {
    playTeamChatSound(40);
    vi.advanceTimersByTime(200);

    expect(temGanho(0.08)).toBe(true); // 0.2 * 0.4
    expect(temGanho(0.06)).toBe(true); // 0.15 * 0.4
    expect(temGanho(0.2)).toBe(false);
    expect(temGanho(0.15)).toBe(false);
  });

  it('sem argumento usa o default do painel (70 → 0.14 / 0.105)', () => {
    playTeamChatSound();
    vi.advanceTimersByTime(200);

    expect(temGanho(0.14)).toBe(true); // 0.2 * 0.7
    expect(temGanho(0.105)).toBe(true); // 0.15 * 0.7
  });
});
