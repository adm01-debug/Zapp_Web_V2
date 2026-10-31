/**
 * CV-083 — testes do hook useDeadlineCalculator.
 */
import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useDeadlineCalculator } from '../useDeadlineCalculator';

const today = new Date('2026-10-30');

describe('useDeadlineCalculator', () => {
  it('prazo OK com folga de 20 dias', () => {
    const eventDate = new Date('2026-11-25');
    const { result } = renderHook(() =>
      useDeadlineCalculator({ eventDate, productType: 'caneta', today }),
    );
    expect(result.current.feasibility).toBe('ok');
    expect(result.current.productionDays).toBe(5);
  });

  it('prazo tight quando dias restantes == productionDays + 2', () => {
    const eventDate = new Date('2026-11-07'); // 8 dias à frente; caneta=5 → tight
    const { result } = renderHook(() =>
      useDeadlineCalculator({ eventDate, productType: 'caneta', today }),
    );
    expect(result.current.feasibility).toBe('tight');
  });

  it('prazo impossível quando evento é amanhã', () => {
    const eventDate = new Date('2026-10-31');
    const { result } = renderHook(() =>
      useDeadlineCalculator({ eventDate, productType: 'camiseta', today }),
    );
    expect(result.current.feasibility).toBe('impossible');
    expect(result.current.alternatives.length).toBeGreaterThan(0);
  });

  it('usa productionDays padrão (10) para produto desconhecido', () => {
    const eventDate = new Date('2026-11-20');
    const { result } = renderHook(() =>
      useDeadlineCalculator({ eventDate, productType: 'desconhecido', today }),
    );
    expect(result.current.productionDays).toBe(10);
  });
});
