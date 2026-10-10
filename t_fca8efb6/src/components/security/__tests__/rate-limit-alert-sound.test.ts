import { describe, it, expect, vi, beforeEach } from 'vitest';

// O som de alerta de segurança é criado com `new Audio(...)`; capturamos as instâncias
// para provar o volume efetivo aplicado.
const criados: Array<{ volume: number; src?: string; play: ReturnType<typeof vi.fn> }> = [];

vi.stubGlobal(
  'Audio',
  class FakeAudio {
    volume = 1;
    currentTime = 0;
    play = vi.fn().mockResolvedValue(undefined);
    constructor(public src?: string) {
      criados.push(this as never);
    }
  },
);

import { playAlertSound } from '@/utils/securityAlertSound';

describe('playAlertSound — volume do alerta de segurança', () => {
  beforeEach(() => {
    criados.length = 0;
  });

  it('usa o volume persistido do painel (40 -> 0.4), não um valor fixo no código', () => {
    playAlertSound(40);

    expect(criados).toHaveLength(1);
    expect(criados[0].volume).toBeCloseTo(0.4, 5);
    expect(criados[0].play).toHaveBeenCalled();
  });

  it('respeita o mínimo da faixa persistida (10 -> 0.1)', () => {
    playAlertSound(10);

    expect(criados[0].volume).toBeCloseTo(0.1, 5);
  });

  it('respeita o máximo da faixa persistida (100 -> 1.0)', () => {
    playAlertSound(100);

    expect(criados[0].volume).toBeCloseTo(1, 5);
  });

  it('volume 0/negativo não é aceito pelo painel, mas não estoura o elemento', () => {
    playAlertSound(0);

    expect(criados[0].volume).toBeLessThanOrEqual(1);
    expect(criados[0].volume).toBeGreaterThanOrEqual(0);
  });
});
