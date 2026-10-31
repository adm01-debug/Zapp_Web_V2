/**
 * CV-079 — testes do hook useLossRiskDetector.
 */
import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useLossRiskDetector } from '../useLossRiskDetector';

describe('useLossRiskDetector', () => {
  it('risco baixo para mensagem positiva recente', () => {
    const { result } = renderHook(() =>
      useLossRiskDetector({
        clientText: 'Ótimo, adorei! Vamos confirmar.',
        daysSinceLastContact: 0,
      }),
    );
    expect(result.current.level).toBe('low');
    expect(result.current.signals).toHaveLength(0);
  });

  it('detecta risco alto com cancelamento explícito', () => {
    const { result } = renderHook(() =>
      useLossRiskDetector({
        clientText: 'Fechei com outro, obrigado mesmo assim.',
        daysSinceLastContact: 1,
      }),
    );
    expect(result.current.level).toBe('high');
    expect(result.current.signals.length).toBeGreaterThan(0);
    expect(result.current.recoveryAction).toBeTruthy();
  });

  it('detecta risco médio por silêncio prolongado', () => {
    const { result } = renderHook(() =>
      useLossRiskDetector({
        clientText: '',
        daysSinceLastContact: 6,
      }),
    );
    expect(['medium', 'high']).toContain(result.current.level);
  });

  it('detecta risco médio por menção a cotação paralela', () => {
    const { result } = renderHook(() =>
      useLossRiskDetector({
        clientText: 'Estou comparando com outras opções.',
        daysSinceLastContact: 0,
      }),
    );
    expect(result.current.level).toBe('medium');
  });

  it('recoveryAction é string não vazia quando há risco', () => {
    const { result } = renderHook(() =>
      useLossRiskDetector({
        clientText: 'Vou pensar melhor.',
        daysSinceLastContact: 0,
      }),
    );
    if (result.current.level !== 'low') {
      expect(result.current.recoveryAction.length).toBeGreaterThan(0);
    }
  });
});
