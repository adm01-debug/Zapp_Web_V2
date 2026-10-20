import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useContactFormValidation } from '../useContactFormValidation';

// vi.hoisted() ensures these are defined before vi.mock factory is evaluated
const { mockFrom, mockSelect, mockIlike, mockNeq, mockLimit, mockOr } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockIlike: vi.fn(),
  mockNeq: vi.fn(),
  mockLimit: vi.fn(),
  mockOr: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mockFrom },
}));

function setupEmailChain(data: unknown[] | null) {
  mockLimit.mockResolvedValue({ data });
  mockNeq.mockReturnValue({ limit: mockLimit });
  mockIlike.mockReturnValue({ neq: mockNeq, limit: mockLimit });
  mockSelect.mockReturnValue({ ilike: mockIlike });
  mockFrom.mockReturnValue({ select: mockSelect });
}

function setupPhoneChain(data: unknown[] | null) {
  mockLimit.mockResolvedValue({ data });
  mockNeq.mockReturnValue({ limit: mockLimit });
  mockOr.mockReturnValue({ neq: mockNeq, limit: mockLimit });
  mockSelect.mockReturnValue({ or: mockOr });
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
    setupEmailChain([]);
    const { result } = renderHook(() =>
      useContactFormValidation(BASE_VALUES, noop, noop),
    );
    act(() => { result.current.handleChange('email', 'a@b.com'); });
    expect(mockFrom).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('consecutive changes within 500 ms fire only one query (last value wins)', async () => {
    setupEmailChain([]);
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
    setupEmailChain([]);
    const { result } = renderHook(() =>
      useContactFormValidation(BASE_VALUES, noop, noop),
    );
    act(() => { result.current.handleChange('email', 'u%er@b.com'); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(mockIlike).toHaveBeenCalledWith('email', 'u\\%er@b.com');
  });

  it('escapes _ wildcard in email passed to ilike', async () => {
    setupEmailChain([]);
    const { result } = renderHook(() =>
      useContactFormValidation(BASE_VALUES, noop, noop),
    );
    act(() => { result.current.handleChange('email', 'u_er@b.com'); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(mockIlike).toHaveBeenCalledWith('email', 'u\\_er@b.com');
  });

  it('escapes backslash in email before % and _ (escape order)', async () => {
    setupEmailChain([]);
    const { result } = renderHook(() =>
      useContactFormValidation(BASE_VALUES, noop, noop),
    );
    act(() => { result.current.handleChange('email', 'u\\@b.com'); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(mockIlike).toHaveBeenCalledWith('email', 'u\\\\@b.com');
  });

  it('sets duplicateEmailWarning when a duplicate is found', async () => {
    setupEmailChain([{ name: 'Maria', email: 'maria@b.com' }]);
    const { result } = renderHook(() =>
      useContactFormValidation(BASE_VALUES, noop, noop),
    );
    act(() => { result.current.handleChange('email', 'maria@b.com'); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(result.current.duplicateEmailWarning).toBe('Email já cadastrado: "Maria"');
  });

  it('clears duplicateEmailWarning when no duplicate found', async () => {
    setupEmailChain([]);
    const { result } = renderHook(() =>
      useContactFormValidation(BASE_VALUES, noop, noop),
    );
    act(() => { result.current.handleChange('email', 'new@b.com'); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(result.current.duplicateEmailWarning).toBeNull();
  });

  it('adds neq(id) exclusion when excludeContactId is provided', async () => {
    setupEmailChain([]);
    const { result } = renderHook(() =>
      useContactFormValidation(BASE_VALUES, noop, noop, 'uuid-123'),
    );
    act(() => { result.current.handleChange('email', 'a@b.com'); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(mockNeq).toHaveBeenCalledWith('id', 'uuid-123');
    expect(mockLimit).toHaveBeenCalledWith(1);
  });

  it('omits neq when excludeContactId is not provided', async () => {
    setupEmailChain([]);
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

    act(() => { result.current.handleChange('email', 'slow@b.com'); });
    await act(async () => { vi.advanceTimersByTime(500); });

    act(() => { result.current.handleChange('email', 'fast@b.com'); });
    await act(async () => { vi.advanceTimersByTime(500); });

    await act(async () => {
      resolveSlow({ data: [{ name: 'Stale Dup', email: 'slow@b.com' }] });
    });

    expect(result.current.duplicateEmailWarning).toBeNull();
  });

  it('seq incremented before early return: invalid email invalidates prior in-flight query', async () => {
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

    act(() => { result.current.handleChange('email', 'valid@b.com'); });
    await act(async () => { vi.advanceTimersByTime(500); });

    act(() => { result.current.handleChange('email', 'not-an-email'); });
    await act(async () => { vi.advanceTimersByTime(500); });

    await act(async () => {
      resolveSlow({ data: [{ name: 'Dup User', email: 'valid@b.com' }] });
    });

    expect(result.current.duplicateEmailWarning).toBeNull();
  });
});

describe('useContactFormValidation — checkDuplicate (phone)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it('debounces phone query by 500 ms — no call before timeout', async () => {
    setupPhoneChain([]);
    const { result } = renderHook(() =>
      useContactFormValidation({ name: 'Test', phone: '', email: '' }, noop, noop),
    );
    act(() => { result.current.handlePhoneChange('11987654321'); });
    expect(mockFrom).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('phone with fewer than 10 digits skips query and clears warning', async () => {
    setupPhoneChain([{ name: 'Someone', phone: '12345' }]);
    const { result } = renderHook(() =>
      useContactFormValidation({ name: 'Test', phone: '', email: '' }, noop, noop),
    );
    act(() => { result.current.handlePhoneChange('123456789'); }); // 9 digits
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(result.current.duplicateWarning).toBeNull();
  });

  it('passes last 8 digits of cleaned phone to .or() query', async () => {
    setupPhoneChain([]);
    const { result } = renderHook(() =>
      useContactFormValidation({ name: 'Test', phone: '', email: '' }, noop, noop),
    );
    // "11987654321" → cleaned "11987654321" → last 8 = "87654321"
    act(() => { result.current.handlePhoneChange('11987654321'); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(mockOr).toHaveBeenCalledWith('phone.ilike.%87654321%');
  });

  it('consecutive changes within 500 ms fire only one query (last value wins)', async () => {
    setupPhoneChain([]);
    const { result } = renderHook(() =>
      useContactFormValidation({ name: 'Test', phone: '', email: '' }, noop, noop),
    );
    act(() => { result.current.handlePhoneChange('11987654321'); });
    act(() => { result.current.handlePhoneChange('11999888777'); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(mockFrom).toHaveBeenCalledTimes(1);
    // "11999888777" → cleaned → last 8 = "99888777"
    expect(mockOr).toHaveBeenCalledWith('phone.ilike.%99888777%');
  });

  it('sets duplicateWarning when a duplicate phone is found', async () => {
    setupPhoneChain([{ name: 'João', phone: '11987654321' }]);
    const { result } = renderHook(() =>
      useContactFormValidation({ name: 'Test', phone: '', email: '' }, noop, noop),
    );
    act(() => { result.current.handlePhoneChange('11987654321'); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(result.current.duplicateWarning).toBe('Possível duplicata: "João" (11987654321)');
  });

  it('clears duplicateWarning when no duplicate phone is found', async () => {
    setupPhoneChain([]);
    const { result } = renderHook(() =>
      useContactFormValidation({ name: 'Test', phone: '', email: '' }, noop, noop),
    );
    act(() => { result.current.handlePhoneChange('11999888777'); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(result.current.duplicateWarning).toBeNull();
  });

  it('adds neq(id) exclusion when excludeContactId is provided', async () => {
    setupPhoneChain([]);
    const { result } = renderHook(() =>
      useContactFormValidation({ name: 'Test', phone: '', email: '' }, noop, noop, 'uuid-456'),
    );
    act(() => { result.current.handlePhoneChange('11987654321'); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(mockNeq).toHaveBeenCalledWith('id', 'uuid-456');
    expect(mockLimit).toHaveBeenCalledWith(1);
  });

  it('omits neq when excludeContactId is not provided for phone check', async () => {
    setupPhoneChain([]);
    const { result } = renderHook(() =>
      useContactFormValidation({ name: 'Test', phone: '', email: '' }, noop, noop),
    );
    act(() => { result.current.handlePhoneChange('11987654321'); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(mockNeq).not.toHaveBeenCalled();
  });

  it('stale-response guard: slow first call is ignored when second call resolves first', async () => {
    let resolveSlow!: (v: unknown) => void;
    const slowPromise = new Promise(r => { resolveSlow = r; });

    mockLimit
      .mockReturnValueOnce(slowPromise)
      .mockResolvedValue({ data: [] });
    mockNeq.mockReturnValue({ limit: mockLimit });
    mockOr.mockReturnValue({ neq: mockNeq, limit: mockLimit });
    mockSelect.mockReturnValue({ or: mockOr });
    mockFrom.mockReturnValue({ select: mockSelect });

    const { result } = renderHook(() =>
      useContactFormValidation({ name: 'Test', phone: '', email: '' }, noop, noop),
    );

    act(() => { result.current.handlePhoneChange('11987654321'); });
    await act(async () => { vi.advanceTimersByTime(500); });

    act(() => { result.current.handlePhoneChange('11999888777'); });
    await act(async () => { vi.advanceTimersByTime(500); });

    await act(async () => {
      resolveSlow({ data: [{ name: 'Stale Dup', phone: '11987654321' }] });
    });

    expect(result.current.duplicateWarning).toBeNull();
  });

  it('seq incremented before early return: short phone invalidates prior in-flight query', async () => {
    let resolveSlow!: (v: unknown) => void;
    const slowPromise = new Promise(r => { resolveSlow = r; });

    mockLimit.mockReturnValueOnce(slowPromise);
    mockNeq.mockReturnValue({ limit: mockLimit });
    mockOr.mockReturnValue({ neq: mockNeq, limit: mockLimit });
    mockSelect.mockReturnValue({ or: mockOr });
    mockFrom.mockReturnValue({ select: mockSelect });

    const { result } = renderHook(() =>
      useContactFormValidation({ name: 'Test', phone: '', email: '' }, noop, noop),
    );

    // First call: valid phone → fires slow query
    act(() => { result.current.handlePhoneChange('11987654321'); });
    await act(async () => { vi.advanceTimersByTime(500); });

    // Second call: phone becomes short (< 10 digits) → increments seq, early return in checkDuplicate
    act(() => { result.current.handlePhoneChange('12345678'); });
    await act(async () => { vi.advanceTimersByTime(500); });

    // First slow query resolves with duplicate data — must be discarded
    await act(async () => {
      resolveSlow({ data: [{ name: 'Dup User', phone: '11987654321' }] });
    });

    expect(result.current.duplicateWarning).toBeNull();
  });
});
