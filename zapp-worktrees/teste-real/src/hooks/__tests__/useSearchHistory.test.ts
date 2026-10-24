import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useSearchHistory } from '@/hooks/system/useSearchHistory';

describe('useSearchHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('initializes with empty history', () => {
    const { result } = renderHook(() => useSearchHistory());
    expect(result.current.history).toEqual([]);
  });

  it('adds item to history', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.addToHistory('test query', 5);
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].query).toBe('test query');
    expect(result.current.history[0].resultCount).toBe(5);
  });

  it('ignores empty queries', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.addToHistory('', 0);
    });

    expect(result.current.history).toEqual([]);
  });

  it('ignores short queries (less than 2 chars)', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.addToHistory('a', 0);
    });

    expect(result.current.history).toEqual([]);
  });

  it('deduplicates queries (case-insensitive)', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.addToHistory('Test Query', 5);
    });

    act(() => {
      result.current.addToHistory('test query', 10);
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].resultCount).toBe(10);
  });

  it('limits history to 10 items', () => {
    const { result } = renderHook(() => useSearchHistory());

    for (let i = 0; i < 15; i++) {
      act(() => {
        result.current.addToHistory(`query ${i}`, i);
      });
    }

    expect(result.current.history.length).toBeLessThanOrEqual(10);
  });

  it('removes specific item from history', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.addToHistory('keep me', 1);
    });
    act(() => {
      result.current.addToHistory('remove me', 2);
    });

    act(() => {
      result.current.removeFromHistory('remove me');
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].query).toBe('keep me');
  });

  it('clears all history', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.addToHistory('query 1', 1);
    });
    act(() => {
      result.current.addToHistory('query 2', 2);
    });

    act(() => {
      result.current.clearHistory();
    });

    expect(result.current.history).toEqual([]);
    expect(localStorage.getItem('global-search-history')).toBeNull();
  });

  it('persists to localStorage', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.addToHistory('persisted query', 3);
    });

    const stored = localStorage.getItem('global-search-history');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed[0].query).toBe('persisted query');
  });

  it('loads history from localStorage on mount', () => {
    localStorage.setItem('global-search-history', JSON.stringify([
      { query: 'loaded', timestamp: Date.now(), resultCount: 7 },
    ]));

    const { result } = renderHook(() => useSearchHistory());
    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].query).toBe('loaded');
  });

  it('handles corrupted localStorage data', () => {
    localStorage.setItem('global-search-history', 'not-json');
    const { result } = renderHook(() => useSearchHistory());
    expect(result.current.history).toEqual([]);
  });

  it('most recent query is first in history', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.addToHistory('first query', 1);
    });
    act(() => {
      result.current.addToHistory('second query', 2);
    });

    expect(result.current.history[0].query).toBe('second query');
  });

  it('trims whitespace from queries', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.addToHistory('  trimmed  ', 1);
    });

    expect(result.current.history[0].query).toBe('trimmed');
  });
});
