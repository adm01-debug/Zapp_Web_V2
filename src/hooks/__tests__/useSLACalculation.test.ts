import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSLACalculation, formatTimeRemaining } from '@/hooks/sla/useSLACalculation';

// Testes do hook REAL (sem espelho local): prazo de 5 min, alerta (âmbar) a
// partir de 2 min decorridos e vencimento (vermelho) no prazo.

const BASE = new Date('2026-10-11T12:00:00Z');

function renderAt(elapsedMs: number, opts: { warningMinutes?: number; firstResponseAt?: Date | null }) {
  vi.setSystemTime(new Date(BASE.getTime() + elapsedMs));
  return renderHook(() =>
    useSLACalculation({
      firstMessageAt: BASE,
      firstResponseMinutes: 5,
      warningMinutes: opts.warningMinutes ?? 2,
      firstResponseAt: opts.firstResponseAt ?? null,
    })
  );
}

describe('useSLACalculation — prazo de 5 min, alerta aos 2 min', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('verde antes de 2 min decorridos', () => {
    const { result } = renderAt(60_000, {});
    expect(result.current.firstResponse.status).toBe('ok');
    expect(result.current.firstResponse.breached).toBe(false);
    expect(result.current.worstStatus).toBe('ok');
  });

  it('âmbar exatamente aos 2 min decorridos', () => {
    const { result } = renderAt(120_000, {});
    expect(result.current.firstResponse.status).toBe('warning');
    expect(result.current.firstResponse.breached).toBe(false);
    expect(result.current.worstStatus).toBe('warning');
  });

  it('âmbar depois dos 2 min e antes do prazo', () => {
    const { result } = renderAt(240_000, {});
    expect(result.current.firstResponse.status).toBe('warning');
    expect(result.current.firstResponse.remainingMs).toBe(60_000);
  });

  it('vermelho ao vencer o prazo de 5 min', () => {
    const { result } = renderAt(300_000, {});
    expect(result.current.firstResponse.status).toBe('breached');
    expect(result.current.firstResponse.breached).toBe(true);
    expect(result.current.worstStatus).toBe('breached');
  });

  it('primeira resposta no prazo fica verde', () => {
    const { result } = renderAt(300_000, {
      firstResponseAt: new Date(BASE.getTime() + 240_000),
    });
    expect(result.current.firstResponse.breached).toBe(false);
    expect(result.current.firstResponse.status).toBe('ok');
  });

  it('primeira resposta atrasada fica vermelha', () => {
    const { result } = renderAt(300_000, {
      firstResponseAt: new Date(BASE.getTime() + 360_000),
    });
    expect(result.current.firstResponse.breached).toBe(true);
    expect(result.current.firstResponse.status).toBe('breached');
  });
});

describe('useSLACalculation — formatTimeRemaining', () => {
  it('formata segundos, minutos e horas', () => {
    expect(formatTimeRemaining(45_000)).toBe('45s');
    expect(formatTimeRemaining(125_000)).toBe('2m 5s');
    expect(formatTimeRemaining(5_400_000)).toBe('1h 30m');
    expect(formatTimeRemaining(0)).toBe('0s');
    expect(formatTimeRemaining(-60_000)).toBe('1m 0s');
  });
});
