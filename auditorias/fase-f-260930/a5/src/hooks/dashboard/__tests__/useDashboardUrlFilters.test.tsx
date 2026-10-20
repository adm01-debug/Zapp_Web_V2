import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockSearchParams = new URLSearchParams();
const mockSetSearchParams = vi.fn();

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}));

import { useDashboardUrlFilters } from '../useDashboardUrlFilters';

describe('useDashboardUrlFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    [...mockSearchParams.keys()].forEach((k) => mockSearchParams.delete(k));
  });

  it('sem params na URL, cai no default: period=today, queue/agent nulos', () => {
    const { result } = renderHook(() => useDashboardUrlFilters());
    const [filters] = result.current;
    expect(filters.period).toBe('today');
    expect(filters.queueId).toBeNull();
    expect(filters.agentId).toBeNull();
  });

  it('lê period/queue/agent da URL', () => {
    mockSearchParams.set('period', 'week');
    mockSearchParams.set('queue', 'queue-123');
    mockSearchParams.set('agent', 'agent-456');
    const { result } = renderHook(() => useDashboardUrlFilters());
    const [filters] = result.current;
    expect(filters.period).toBe('week');
    expect(filters.queueId).toBe('queue-123');
    expect(filters.agentId).toBe('agent-456');
  });

  it('period=custom com from/to válidos na URL usa esse range exato', () => {
    mockSearchParams.set('period', 'custom');
    mockSearchParams.set('from', '2026-01-10');
    mockSearchParams.set('to', '2026-01-15');
    const { result } = renderHook(() => useDashboardUrlFilters());
    const [filters] = result.current;
    expect(filters.period).toBe('custom');
    expect(filters.dateRange.from.getDate()).toBe(10);
    expect(filters.dateRange.to.getDate()).toBe(15);
  });

  it('period=custom sem from/to na URL (link incompleto) cai para today em vez de quebrar', () => {
    mockSearchParams.set('period', 'custom');
    const { result } = renderHook(() => useDashboardUrlFilters());
    const [filters] = result.current;
    expect(filters.period).toBe('today');
  });

  it('period inválido na URL (editado à mão) cai para today', () => {
    mockSearchParams.set('period', 'nao-existe');
    const { result } = renderHook(() => useDashboardUrlFilters());
    const [filters] = result.current;
    expect(filters.period).toBe('today');
  });

  it('setFilters grava period/queue/agent na URL e chama setSearchParams com replace:true', () => {
    const { result } = renderHook(() => useDashboardUrlFilters());
    const [, setFilters] = result.current;
    act(() => {
      setFilters({
        period: 'week',
        dateRange: { from: new Date(), to: new Date() },
        queueId: 'queue-abc',
        agentId: null,
      });
    });
    expect(mockSetSearchParams).toHaveBeenCalledWith(expect.any(Function), { replace: true });
    const updater = mockSetSearchParams.mock.calls[0][0] as (p: URLSearchParams) => URLSearchParams;
    const result_ = updater(new URLSearchParams());
    expect(result_.get('period')).toBe('week');
    expect(result_.get('queue')).toBe('queue-abc');
    expect(result_.has('agent')).toBe(false);
  });

  it('setFilters com period=custom grava from/to como yyyy-MM-dd', () => {
    const { result } = renderHook(() => useDashboardUrlFilters());
    const [, setFilters] = result.current;
    act(() => {
      setFilters({
        period: 'custom',
        dateRange: { from: new Date(2026, 0, 10), to: new Date(2026, 0, 15) },
        queueId: null,
        agentId: null,
      });
    });
    const updater = mockSetSearchParams.mock.calls[0][0] as (p: URLSearchParams) => URLSearchParams;
    const result_ = updater(new URLSearchParams());
    expect(result_.get('from')).toBe('2026-01-10');
    expect(result_.get('to')).toBe('2026-01-15');
  });

  it('setFilters com period != custom remove from/to que possam estar na URL', () => {
    const { result } = renderHook(() => useDashboardUrlFilters());
    const [, setFilters] = result.current;
    act(() => {
      setFilters({ period: 'today', dateRange: { from: new Date(), to: new Date() }, queueId: null, agentId: null });
    });
    const updater = mockSetSearchParams.mock.calls[0][0] as (p: URLSearchParams) => URLSearchParams;
    const params = new URLSearchParams();
    params.set('from', '2026-01-01');
    params.set('to', '2026-01-02');
    const result_ = updater(params);
    expect(result_.has('from')).toBe(false);
    expect(result_.has('to')).toBe(false);
  });
});
