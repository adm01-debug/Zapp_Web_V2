// Tests for CV-121–130: useSupervisorView, useCoachingHint, useTrainingMode
import { renderHook, act } from '@testing-library/react';
import { useSupervisorView } from '../useSupervisorView';
import { useCoachingHint } from '../useCoachingHint';
import { useTrainingMode } from '../useTrainingMode';

// ── useSupervisorView ────────────────────────────────────────────────────────

describe('useSupervisorView', () => {
  it('returns empty arrays when no vendor ids are provided', () => {
    const { result } = renderHook(() => useSupervisorView([]));
    expect(result.current.performances).toEqual([]);
    expect(result.current.alerts).toEqual([]);
  });

  it('returns one performance stub per vendor id', () => {
    const { result } = renderHook(() => useSupervisorView(['v1', 'v2']));
    expect(result.current.performances).toHaveLength(2);
    expect(result.current.performances[0].vendorId).toBe('v1');
    expect(result.current.performances[1].vendorId).toBe('v2');
  });

  it('intervene is callable without throwing', () => {
    const { result } = renderHook(() => useSupervisorView(['v1']));
    expect(() => result.current.intervene('conv-1', 'hello')).not.toThrow();
  });
});

// ── useCoachingHint ──────────────────────────────────────────────────────────

describe('useCoachingHint', () => {
  it('returns no hints when rejections are below threshold', () => {
    const { result } = renderHook(() =>
      useCoachingHint('vendor-1', ['sugestão de preço', 'desconto sugerido']),
    );
    // Only 2 price-related rejections, threshold is 3
    expect(result.current.hints).toEqual([]);
  });

  it('surfaces a hint when a category reaches frequency >= 3', () => {
    const rejections = [
      'oferecer preço especial',
      'âncora de preço alta',
      'desconto no valor',
      // 3 price rejections → should trigger price_anchor hint
    ];
    const { result } = renderHook(() => useCoachingHint('vendor-1', rejections));
    expect(result.current.hints.length).toBeGreaterThanOrEqual(1);
    expect(result.current.hints[0].category).toBe('price_anchor');
    expect(result.current.hints[0].frequency).toBe(3);
  });

  it('dismissHint removes the hint from the list', () => {
    const rejections = [
      'oferecer preço especial',
      'âncora de preço alta',
      'desconto no valor',
    ];
    const { result } = renderHook(() => useCoachingHint('vendor-1', rejections));
    expect(result.current.hints).toHaveLength(1);
    const pattern = result.current.hints[0].pattern;
    act(() => {
      result.current.dismissHint(pattern);
    });
    expect(result.current.hints).toHaveLength(0);
  });
});

// ── useTrainingMode ──────────────────────────────────────────────────────────

describe('useTrainingMode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts disabled when localStorage has no value', () => {
    const { result } = renderHook(() => useTrainingMode());
    expect(result.current.isEnabled).toBe(false);
  });

  it('toggle enables training mode and persists to localStorage', () => {
    const { result } = renderHook(() => useTrainingMode());
    act(() => {
      result.current.toggle();
    });
    expect(result.current.isEnabled).toBe(true);
    expect(localStorage.getItem('copilot-training-mode')).toBe('true');
  });

  it('toggle again disables and persists false', () => {
    const { result } = renderHook(() => useTrainingMode());
    act(() => { result.current.toggle(); });
    act(() => { result.current.toggle(); });
    expect(result.current.isEnabled).toBe(false);
    expect(localStorage.getItem('copilot-training-mode')).toBe('false');
  });

  it('getExplanation returns null when training mode is disabled', () => {
    const { result } = renderHook(() => useTrainingMode());
    expect(result.current.getExplanation('sugg-1')).toBeNull();
  });

  it('getExplanation returns a mock explanation when enabled', () => {
    const { result } = renderHook(() => useTrainingMode());
    act(() => { result.current.toggle(); });
    const explanation = result.current.getExplanation('sugg-abc');
    expect(explanation).not.toBeNull();
    expect(explanation?.suggestionId).toBe('sugg-abc');
    expect(explanation?.confidenceScore).toBeGreaterThan(0);
    expect(explanation?.triggerSignals.length).toBeGreaterThan(0);
  });

  it('reads initial state from localStorage', () => {
    localStorage.setItem('copilot-training-mode', 'true');
    const { result } = renderHook(() => useTrainingMode());
    expect(result.current.isEnabled).toBe(true);
  });
});
