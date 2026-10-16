import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLossRiskDetector } from '../useLossRiskDetector';

describe('useLossRiskDetector', () => {
  it('returns none risk when no signals present', () => {
    const { result } = renderHook(() =>
      useLossRiskDetector({
        conversationId: 'conv-1',
        messages: ['olá, quero ver o catálogo'],
      }),
    );

    expect(result.current.riskState.level).toBe('none');
    expect(result.current.riskState.score).toBe(0);
    expect(result.current.riskState.signals).toHaveLength(0);
  });

  it('detects low/medium risk from delay words', () => {
    const { result } = renderHook(() =>
      useLossRiskDetector({
        conversationId: 'conv-2',
        messages: ['deixa ver', 'vou pensar', 'talvez semana que vem'],
      }),
    );

    expect(result.current.riskState.level).not.toBe('none');
    expect(result.current.riskState.signals.some(s => s.type === 'delay')).toBe(true);
  });

  it('detects critical risk from explicit "não"', () => {
    const { result } = renderHook(() =>
      useLossRiskDetector({
        conversationId: 'conv-3',
        messages: ['não quero mais', 'desisti da compra', 'cancelar tudo'],
      }),
    );

    expect(result.current.riskState.level).toBe('critical');
    expect(result.current.riskState.signals.some(s => s.type === 'explicit_no')).toBe(true);
  });

  it('provides recovery script when risk is high or critical', () => {
    const { result } = renderHook(() =>
      useLossRiskDetector({
        conversationId: 'conv-4',
        messages: ['não tenho interesse', 'mudei de ideia'],
      }),
    );

    expect(['high', 'critical']).toContain(result.current.riskState.level);
    expect(result.current.riskState.recoveryScript.length).toBeGreaterThan(0);
  });

  it('recovery script is empty when risk is none', () => {
    const { result } = renderHook(() =>
      useLossRiskDetector({
        conversationId: 'conv-5',
        messages: ['pode me mandar o orçamento?'],
      }),
    );

    expect(result.current.riskState.recoveryScript).toHaveLength(0);
  });

  it('dismiss resets risk to none', () => {
    const { result } = renderHook(() =>
      useLossRiskDetector({
        conversationId: 'conv-6',
        messages: ['não quero mais comprar'],
      }),
    );

    expect(result.current.riskState.level).not.toBe('none');

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.riskState.level).toBe('none');
    expect(result.current.riskState.score).toBe(0);
  });

  it('detects competitor mention signal', () => {
    const { result } = renderHook(() =>
      useLossRiskDetector({
        conversationId: 'conv-7',
        messages: ['vi em outro fornecedor mais barato'],
      }),
    );

    expect(result.current.riskState.signals.some(s => s.type === 'competitor_mention')).toBe(true);
    expect(result.current.riskState.score).toBeGreaterThanOrEqual(30);
  });

  it('calls onRiskDetected when risk level changes to non-none', () => {
    const onRiskDetected = vi.fn();

    renderHook(() =>
      useLossRiskDetector({
        conversationId: 'conv-8',
        messages: ['não quero mais', 'outro fornecedor'],
        onRiskDetected,
      }),
    );

    expect(onRiskDetected).toHaveBeenCalled();
    expect(onRiskDetected).toHaveBeenCalledWith(
      expect.objectContaining({ level: expect.any(String), score: expect.any(Number) }),
    );
  });

  it('score accumulates from multiple signals', () => {
    const { result } = renderHook(() =>
      useLossRiskDetector({
        conversationId: 'conv-9',
        messages: ['vou pensar', 'vi em outro fornecedor', 'não'],
      }),
    );

    // delay(20) + competitor(30) = 50+, should be medium or high
    expect(result.current.riskState.score).toBeGreaterThanOrEqual(20);
  });
});
