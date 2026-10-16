import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePriceAnchor } from '../usePriceAnchor';

describe('usePriceAnchor', () => {
  it('accepts discount within default limit (10%)', () => {
    const { result } = renderHook(() => usePriceAnchor());

    let suggestion = result.current.checkDiscount(0, 0);
    expect(suggestion).toBeDefined();

    act(() => {
      suggestion = result.current.checkDiscount(5, 100);
    });

    expect(suggestion.type).toBe('anchor');
    expect(suggestion.message).toContain('5%');
  });

  it('offers trade alternatives when slightly over limit', () => {
    const { result } = renderHook(() => usePriceAnchor({ vendorDiscountLimit: 10 }));

    let suggestion = result.current.checkDiscount(0, 0);

    act(() => {
      suggestion = result.current.checkDiscount(15, 200);
    });

    expect(suggestion.type).toBe('trade_offer');
    expect(suggestion.tradeOptions).toBeDefined();
    expect(suggestion.tradeOptions?.length).toBeGreaterThan(0);
  });

  it('refuses discount significantly over limit', () => {
    const { result } = renderHook(() => usePriceAnchor({ vendorDiscountLimit: 10 }));

    let suggestion = result.current.checkDiscount(0, 0);

    act(() => {
      suggestion = result.current.checkDiscount(30, 500);
    });

    expect(suggestion.type).toBe('discount_refused');
    expect(suggestion.tradeOptions).toBeDefined();
  });

  it('default vendor limit is 10%', () => {
    const { result } = renderHook(() => usePriceAnchor());

    let withinLimit = result.current.checkDiscount(0, 0);
    let overLimit = result.current.checkDiscount(0, 0);

    act(() => {
      withinLimit = result.current.checkDiscount(10, 100);
    });
    expect(withinLimit.type).toBe('anchor');

    act(() => {
      overLimit = result.current.checkDiscount(11, 100);
    });
    expect(overLimit.type).not.toBe('anchor');
  });

  it('calls onDiscountViolation when limit is exceeded', () => {
    const onDiscountViolation = vi.fn();
    const { result } = renderHook(() =>
      usePriceAnchor({ vendorDiscountLimit: 10, onDiscountViolation }),
    );

    act(() => {
      result.current.checkDiscount(25, 100);
    });

    expect(onDiscountViolation).toHaveBeenCalledOnce();
    expect(onDiscountViolation).toHaveBeenCalledWith(
      expect.objectContaining({ requestedPercent: 25, vendorLimit: 10 }),
    );
  });

  it('returns trade alternatives list', () => {
    const { result } = renderHook(() => usePriceAnchor());

    expect(result.current.tradeAlternatives).toBeDefined();
    expect(result.current.tradeAlternatives.length).toBeGreaterThan(0);
  });

  it('sets suggestion state after checkDiscount call', () => {
    const { result } = renderHook(() => usePriceAnchor());

    expect(result.current.suggestion).toBeNull();

    act(() => {
      result.current.checkDiscount(5, 100);
    });

    expect(result.current.suggestion).not.toBeNull();
    expect(result.current.suggestion?.type).toBe('anchor');
  });
});
