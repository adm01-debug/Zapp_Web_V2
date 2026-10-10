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
    expect(result.current.filters.tags).toEqual([]);
    expect(result.current.filters.agentId).toBeNull();
    expect(result.current.filters.dateFrom).toBeNull();
    expect(result.current.filters.dateTo).toBeNull();
    expect(result.current.filters.search).toBe('');
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

  it('parses tags from URL', () => {
    mockSearchParams.set('tags', 'vip,urgent');
    const { result } = renderHook(() => useUrlFilters());
    expect(result.current.filters.tags).toEqual(['vip', 'urgent']);
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

  it('ignora ?q= da URL: o texto livre não é lido dela', () => {
    mockSearchParams.set('q', '11999998888');
    const { result } = renderHook(() => useUrlFilters());
    expect(result.current.filters.search).toBe('');
  });

  it('busca fica em estado local e nunca é gravada na URL (PII)', () => {
    const { result } = renderHook(() => useUrlFilters());
    act(() => {
      result.current.setFilters({ search: '11999998888', status: ['open'] });
    });
    expect(result.current.filters.search).toBe('11999998888');
    expect(result.current.hasActiveFilters).toBe(true);

    const updater = mockSetSearchParams.mock.calls[0][0] as (p: URLSearchParams) => URLSearchParams;
    const gravado = updater(new URLSearchParams('view=inbox&q=11999998888'));
    expect(gravado.toString()).not.toContain('11999998888');
    expect(gravado.has('q')).toBe(false);
    // filtros não-PII continuam na URL e params alheios são preservados
    expect(gravado.get('status')).toBe('open');
    expect(gravado.get('view')).toBe('inbox');
  });

  it('limpar a busca esvazia o estado local', () => {
    const { result } = renderHook(() => useUrlFilters());
    act(() => { result.current.setFilters({ search: 'ana' }); });
    act(() => { result.current.setFilters({ search: '' }); });
    expect(result.current.filters.search).toBe('');
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('clearFilters zera a busca local e remove ?q= antigo', () => {
    const { result } = renderHook(() => useUrlFilters());
    act(() => { result.current.setFilters({ search: 'ana' }); });
    act(() => { result.current.clearFilters(); });
    expect(result.current.filters.search).toBe('');
    const calls = mockSetSearchParams.mock.calls;
    const updater = calls[calls.length - 1][0] as (p: URLSearchParams) => URLSearchParams;
    expect(updater(new URLSearchParams('q=ana&view=inbox')).toString()).toBe('view=inbox');
  });

  it('setFilters calls setSearchParams', () => {
    const { result } = renderHook(() => useUrlFilters());
    act(() => {
      result.current.setFilters({ status: ['open'] });
    });
    expect(mockSetSearchParams).toHaveBeenCalled();
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
