import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useContactFormValidation } from '../useContactFormValidation';

const mockLimit = vi.fn();
const mockNeq = vi.fn();
const mockIlike = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mockFrom },
}));

function setupChain(data: unknown[] | null) {
  mockLimit.mockResolvedValue({ data });
  mockNeq.mockReturnValue({ limit: mockLimit });
  mockIlike.mockReturnValue({ neq: mockNeq, limit: mockLimit });
  mockSelect.mockReturnValue({ ilike: mockIlike });
  mockFrom.mockReturnValue({ select: mockSelect });
}

const BASE_VALUES = { name: 'Test', phone: '11987654321', email: '' };
const noop = vi.fn();

describe('useContactFormValidation — checkEmailDuplicate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it('debounces query by 500 ms — no call before timeout', async () => {
    setupChain([]);
    const { result } = renderHook(() =>
      useContactFormValidation(BASE_VALUES, noop, noop),
    );
    act(() => { result.current.handleChange('email', 'a@b.com'); });
    expect(mockFrom).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('consecutive changes within 500 ms fire only one query (last value wins)', async () => {
    setupChain([]);
    const { result } = renderHook(() =>
      useContactFormValidation(BASE_VALUES, noop, noop),
    );
    act(() => { result.current.handleChange('email', 'a@b.com'); });
    act(() => { result.current.handleChange('email', 'b@b.com'); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockIlike).toHaveBeenCalledWith('email', 'b@b.com');
  });

  it('escapes % wildcard in email passed to ilike', async () => {
    setupChain([]);
    const { result } = renderHook(() =>
      useContactFormValidation(BASE_VALUES, noop, noop),
    );
    act(() => { result.current.handleChange('email', 'u%er@b.com'); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(mockIlike).toHaveBeenCalledWith('email', 'u\\%er@b.com');
  });

  it('escapes _ wildcard in email passed to ilike', async () => {
    setupChain([]);
    const { result } = renderHook(() =>
      useContactFormValidation(BASE_VALUES, noop, noop),
    );
    act(() => { result.current.handleChange('email', 'u_er@b.com'); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(mockIlike).toHaveBeenCalledWith('email', 'u\\_er@b.com');
  });

  it('escapes backslash in email before % and _ (escape order)', async () => {
    setupChain([]);
    const { result } = renderHook(() =>
      useContactFormValidation(BASE_VALUES, noop, noop),
    );
    // backslash must become \\\\ so it doesn't escape the following % or _
    act(() => { result.current.handleChange('email', 'u\\@b.com'); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(mockIlike).toHaveBeenCalledWith('email', 'u\\\\@b.com');
  });

  it('sets duplicateEmailWarning when a duplicate is found', async () => {
    setupChain([{ name: 'Maria', email: 'maria@b.com' }]);
    const { result } = renderHook(() =>
      useContactFormValidation(BASE_VALUES, noop, noop),
    );
    act(() => { result.current.handleChange('email', 'maria@b.com'); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(result.current.duplicateEmailWarning).toBe('Email já cadastrado: "Maria"');
  });

  it('clears duplicateEmailWarning when no duplicate found', async () => {
    setupChain([]);
    const { result } = renderHook(() =>
      useContactFormValidation(BASE_VALUES, noop, noop),
    );
    act(() => { result.current.handleChange('email', 'new@b.com'); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(result.current.duplicateEmailWarning).toBeNull();
  });

  it('adds neq(id) exclusion when excludeContactId is provided', async () => {
    setupChain([]);
    const { result } = renderHook(() =>
      useContactFormValidation(BASE_VALUES, noop, noop, 'uuid-123'),
    );
    act(() => { result.current.handleChange('email', 'a@b.com'); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(mockNeq).toHaveBeenCalledWith('id', 'uuid-123');
    expect(mockLimit).toHaveBeenCalledWith(1);
  });

  it('omits neq when excludeContactId is not provided', async () => {
    setupChain([]);
    const { result } = renderHook(() =>
      useContactFormValidation(BASE_VALUES, noop, noop),
    );
    act(() => { result.current.handleChange('email', 'a@b.com'); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(mockNeq).not.toHaveBeenCalled();
  });

  it('stale-response guard: slow first call is ignored when second call resolves first', async () => {
    let resolveSlow!: (v: unknown) => void;
    const slowPromise = new Promise(r => { resolveSlow = r; });

    // First limit call is slow; subsequent are fast
    mockLimit
      .mockReturnValueOnce(slowPromise)
      .mockResolvedValue({ data: [] });
    mockNeq.mockReturnValue({ limit: mockLimit });
    mockIlike.mockReturnValue({ neq: mockNeq, limit: mockLimit });
    mockSelect.mockReturnValue({ ilike: mockIlike });
    mockFrom.mockReturnValue({ select: mockSelect });

    const { result } = renderHook(() =>
      useContactFormValidation(BASE_VALUES, noop, noop),
    );

    // Fire first (slow) — seq becomes 1
    act(() => { result.current.handleChange('email', 'slow@b.com'); });
    await act(async () => { vi.advanceTimersByTime(500); });

    // Fire second (fast) — seq becomes 2
    act(() => { result.current.handleChange('email', 'fast@b.com'); });
    await act(async () => { vi.advanceTimersByTime(500); });

    // Resolve slow (seq=1) with a duplicate — should be ignored (current seq=2)
    await act(async () => {
      resolveSlow({ data: [{ name: 'Stale Dup', email: 'slow@b.com' }] });
    });

    expect(result.current.duplicateEmailWarning).toBeNull();
  });

  it('seq incremented before early return: invalid email invalidates prior in-flight query', async () => {
    // Regression guard for the fix: seq++ is in handleChange (sync), not inside checkEmailDuplicate.
    // If seq were incremented only inside the callback, a stale in-flight valid-email response
    // would not be invalidated when the user types an invalid email next.
    let resolveSlow!: (v: unknown) => void;
    const slowPromise = new Promise(r => { resolveSlow = r; });

    mockLimit.mockReturnValueOnce(slowPromise);
    mockNeq.mockReturnValue({ limit: mockLimit });
    mockIlike.mockReturnValue({ neq: mockNeq, limit: mockLimit });
    mockSelect.mockReturnValue({ ilike: mockIlike });
    mockFrom.mockReturnValue({ select: mockSelect });

    const { result } = renderHook(() =>
      useContactFormValidation(BASE_VALUES, noop, noop),
    );

    // Start slow query for valid email — handleChange increments seq to 1
    act(() => { result.current.handleChange('email', 'valid@b.com'); });
    await act(async () => { vi.advanceTimersByTime(500); });

    // Type invalid email — handleChange increments seq to 2, then callback early-returns
    act(() => { result.current.handleChange('email', 'not-an-email'); });
    await act(async () => { vi.advanceTimersByTime(500); });

    // Slow query (seq=1) resolves with a duplicate — must be ignored (current seq=2)
    await act(async () => {
      resolveSlow({ data: [{ name: 'Dup User', email: 'valid@b.com' }] });
    });

    expect(result.current.duplicateEmailWarning).toBeNull();
  });
});
