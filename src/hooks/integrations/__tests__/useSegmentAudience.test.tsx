import assert from 'node:assert/strict';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSegmentAudience } from '../useSegmentAudience';

const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/integrations/supabase/client')>();
  return { ...actual, supabase: { rpc: mockRpc } };
});

describe('useSegmentAudience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockRpc.mockResolvedValue({ data: { eligible: 100, sample: ['a', 'b'], totalBase: 1000, suppressed: 0 }, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls talkx_resolve_audience with normalized rules', async () => {
    const rules = {
      version: 2, join: 'or' as const,
      groups: [{ id: 'g1', match: 'and' as const, rules: [{ id: 'r1', field: 'company', op: 'eq', value: 'Acme' }] }],
    };
    renderHook(() => useSegmentAudience(rules));
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(mockRpc).toHaveBeenCalledWith('talkx_resolve_audience', expect.objectContaining({ p_rules: expect.any(Object) }));
  });

  it('returns count and sample from the RPC result', async () => {
    const rules = {
      version: 2, join: 'or' as const,
      groups: [{ id: 'g1', match: 'and' as const, rules: [{ id: 'r1', field: 'company', op: 'eq', value: 'Acme' }] }],
    };
    mockRpc.mockResolvedValueOnce({ data: { eligible: 100 }, error: null });
    mockRpc.mockResolvedValueOnce({ data: { rows: [{ id: 'a' }, { id: 'b' }], total_base: 1000, suppressed: 0 }, error: null });
    const { result } = renderHook(() => useSegmentAudience(rules));
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(result.current.count).toBe(100);
    expect(result.current.sample).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('returns zero when no rules are provided', async () => {
    const { result } = renderHook(() => useSegmentAudience(null));
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(result.current.count).toBe(0);
  });

  it('returns zero when all rules are incomplete', async () => {
    const rules = {
      version: 2, join: 'or' as const,
      groups: [{ id: 'g1', match: 'and' as const, rules: [{ id: 'r1', field: '', op: 'eq', value: 'bad' }] }],
    };
    const { result } = renderHook(() => useSegmentAudience(rules));
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(result.current.count).toBe(0);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});