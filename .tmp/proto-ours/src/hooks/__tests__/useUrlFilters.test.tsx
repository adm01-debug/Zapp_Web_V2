import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

const mockSearchParams = new URLSearchParams();
const mockSetSearchParams = vi.fn();

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}));

import { useUrlFilters } from '@/hooks/system/useUrlFilters';

describe('useUrlFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset params
    [...mockSearchParams.keys()].forEach(k => mockSearchParams.delete(k));
  });

  it('returns empty filters by default', () => {
    const { result } = renderHook(() => useUrlFilters());
    expect(result.current.filters.status).toEqual([]);
    expect(result.current.filters.agentId).toBeNull();
    expect(result.current.filters.dateFrom).toBeNull();
    expect(result.current.filters.dateTo).toBeNull();
  });

  it('hasActiveFilters is false when no filters', () => {
    const { result } = renderHook(() => useUrlFilters());
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('parses status from URL', () => {
    mockSearchParams.set('status', 'open,resolved');
    const { result } = renderHook(() => useUrlFilters());
    expect(result.current.filters.status).toEqual(['open', 'resolved']);
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('parses agentId from URL', () => {
    mockSearchParams.set('agent', 'agent-123');
    const { result } = renderHook(() => useUrlFilters());
    expect(result.current.filters.agentId).toBe('agent-123');
  });

  it('parses date range from URL', () => {
    mockSearchParams.set('from', '2024-01-01');
    mockSearchParams.set('to', '2024-12-31');
    const { result } = renderHook(() => useUrlFilters());
    expect(result.current.filters.dateFrom).toBe('2024-01-01');
    expect(result.current.filters.dateTo).toBe('2024-12-31');
  });

  it('does not read search text from ?q=', () => {
    mockSearchParams.set('q', 'hello world');
    const { result } = renderHook(() => useUrlFilters());
    expect(result.current.filters).not.toHaveProperty('search');
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('setFilters writes status/agent but never ?q=', () => {
    const { result } = renderHook(() => useUrlFilters());
    act(() => {
      result.current.setFilters({ status: ['open'], agentId: 'a1' });
    });
    expect(mockSetSearchParams).toHaveBeenCalled();
    const updater = mockSetSearchParams.mock.calls[0][0] as (p: URLSearchParams) => URLSearchParams;
    const next = updater(new URLSearchParams());
    expect(next.get('status')).toBe('open');
    expect(next.get('agent')).toBe('a1');
    expect(next.has('q')).toBe(false);
  });

  it('clearFilters removes legacy ?q= from old links', () => {
    const { result } = renderHook(() => useUrlFilters());
    act(() => {
      result.current.clearFilters();
    });
    const updater = mockSetSearchParams.mock.calls[0][0] as (p: URLSearchParams) => URLSearchParams;
    expect(updater(new URLSearchParams('q=123&view=x')).toString()).toBe('view=x');
  });

  it('clearFilters calls setSearchParams', () => {
    const { result } = renderHook(() => useUrlFilters());
    act(() => {
      result.current.clearFilters();
    });
    expect(mockSetSearchParams).toHaveBeenCalled();
  });

  it('exposes setFilters function', () => {
    const { result } = renderHook(() => useUrlFilters());
    expect(typeof result.current.setFilters).toBe('function');
  });

  it('exposes clearFilters function', () => {
    const { result } = renderHook(() => useUrlFilters());
    expect(typeof result.current.clearFilters).toBe('function');
  });

  it('handles empty status param correctly', () => {
    mockSearchParams.set('status', '');
    const { result } = renderHook(() => useUrlFilters());
    expect(result.current.filters.status).toEqual([]);
  });
});
