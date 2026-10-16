import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { SENTIMENT_VALUES } from '@/lib/ai-vocabulary';
import { useAmbientColor } from '../useAmbientColor';

/**
 * Tingimento do chat (item L2): o valor REAL do banco é pt-BR canônico, mas o
 * hook só reconhecia `positive`/`negative`/`neutral` — o canônico caía sempre no
 * neutro (tinta morta). `critical`/`critico` pertence ao extremo negativo.
 */
describe('useAmbientColor', () => {
  it('acende com o valor canônico do banco', () => {
    expect(renderHook(() => useAmbientColor('positivo')).result.current.className).toBe('ambient-positive');
    expect(renderHook(() => useAmbientColor('negativo')).result.current.className).toBe('ambient-negative');
    expect(renderHook(() => useAmbientColor('critico')).result.current.className).toBe('ambient-negative');
    expect(renderHook(() => useAmbientColor('neutro')).result.current.className).toBe('ambient-neutral');
  });

  it('o legado EN continua acendendo igual (regressão)', () => {
    expect(renderHook(() => useAmbientColor('positive')).result.current.className).toBe('ambient-positive');
    expect(renderHook(() => useAmbientColor('negative')).result.current.className).toBe('ambient-negative');
    expect(renderHook(() => useAmbientColor('critical')).result.current.className).toBe('ambient-negative');
    expect(renderHook(() => useAmbientColor('neutral')).result.current.className).toBe('ambient-neutral');
  });

  it('percorre todo valor de SENTIMENT_VALUES sem lançar', () => {
    for (const value of SENTIMENT_VALUES) {
      const { result } = renderHook(() => useAmbientColor(value));
      expect(['ambient-positive', 'ambient-negative', 'ambient-neutral'], value).toContain(
        result.current.className,
      );
    }
  });

  it('desconhecido/ausente fica neutro — nenhum valor inventado vira cor', () => {
    for (const raw of [null, undefined, '', 'xpto', 'muito_positivo', 42]) {
      expect(renderHook(() => useAmbientColor(raw)).result.current.className, String(raw)).toBe(
        'ambient-neutral',
      );
    }
  });
});
