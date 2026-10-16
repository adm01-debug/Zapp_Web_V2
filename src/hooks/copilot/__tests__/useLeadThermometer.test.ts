import { renderHook } from '@testing-library/react';
import { useLeadThermometer } from '../useLeadThermometer';

describe('useLeadThermometer', () => {
  it('returns cold temperature when brindeScore is 0 and no signals', () => {
    const { result } = renderHook(() =>
      useLeadThermometer({
        conversationId: 'conv-1',
        messages: [],
        brindeScore: 0,
      }),
    );
    expect(result.current.thermometer.temperature).toBe('cold');
    expect(result.current.thermometer.score).toBe(0);
    expect(result.current.thermometer.signals).toHaveLength(0);
    expect(result.current.thermometer.shouldSuggestClose).toBe(false);
  });

  it('returns hot or closing when brindeScore is 6 and buy signal is present', () => {
    const { result } = renderHook(() =>
      useLeadThermometer({
        conversationId: 'conv-2',
        messages: ['como faço o pedido?', 'aceita boleto?'],
        brindeScore: 6,
      }),
    );
    const { temperature, score, signals } = result.current.thermometer;
    expect(['hot', 'closing']).toContain(temperature);
    expect(score).toBeGreaterThanOrEqual(60);
    expect(signals.length).toBeGreaterThan(0);
  });

  it('shouldSuggestClose is true only at closing temperature', () => {
    const { result: coldResult } = renderHook(() =>
      useLeadThermometer({
        conversationId: 'conv-3',
        messages: [],
        brindeScore: 0,
      }),
    );
    expect(coldResult.current.thermometer.shouldSuggestClose).toBe(false);

    // Max score: 6 * 10 = 60 (brinde) + 45 (3 signals * 15) + 20 (fast) = 125 → capped 100 → closing
    const { result: closingResult } = renderHook(() =>
      useLeadThermometer({
        conversationId: 'conv-4',
        messages: [
          'como faço o pedido?',
          'aceita boleto?',
          'pode mandar a arte?',
          'prazo pra entrega?',
        ],
        brindeScore: 6,
        avgResponseTimeMs: 10_000, // 10s → +20
      }),
    );
    expect(closingResult.current.thermometer.temperature).toBe('closing');
    expect(closingResult.current.thermometer.shouldSuggestClose).toBe(true);
    expect(closingResult.current.thermometer.closeMessage).toBeTruthy();
  });

  it('detects buy signals correctly', () => {
    const { result } = renderHook(() =>
      useLeadThermometer({
        conversationId: 'conv-5',
        messages: ['Quero confirmar o preço final', 'prazo pra dia 15'],
        brindeScore: 2,
      }),
    );
    const signalTypes = result.current.thermometer.signals.map((s) => s.type);
    expect(signalTypes).toContain('price_confirmation');
    expect(signalTypes).toContain('deadline_press');
  });

  it('response speed bonus increases score', () => {
    const { result: slowResult } = renderHook(() =>
      useLeadThermometer({
        conversationId: 'conv-6',
        messages: [],
        brindeScore: 3,
        avgResponseTimeMs: 600_001,
      }),
    );

    const { result: fastResult } = renderHook(() =>
      useLeadThermometer({
        conversationId: 'conv-7',
        messages: [],
        brindeScore: 3,
        avgResponseTimeMs: 5_000,
      }),
    );

    expect(fastResult.current.thermometer.score).toBeGreaterThan(slowResult.current.thermometer.score);
  });
});
