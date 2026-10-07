/**
 * OTH-005 — os filtros da lista de Email saíram do componente (que só apresenta) e
 * passaram a alimentar a consulta ao servidor. A URL continua sendo o deep link:
 * mesmas chaves, rota ativa preservada e página de volta ao início quando o filtro muda.
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEmailThreadListQuery } from '../useEmailThreadListQuery';
import { EMAIL_THREAD_DEFAULT_FILTERS } from '@/lib/emailThreadQuery';
import { EMAIL_THREAD_SEARCH_DEBOUNCE_MS } from '../useEmailThreadListQuery';

describe('useEmailThreadListQuery (OTH-005)', () => {
  beforeEach(() => window.history.replaceState({}, '', '/?view=email-chat'));

  it('começa nos filtros padrão quando a URL não traz nada', () => {
    const { result } = renderHook(() => useEmailThreadListQuery());
    expect(result.current.filters).toEqual(EMAIL_THREAD_DEFAULT_FILTERS);
    expect(result.current.page).toBe(1);
  });

  it('restaura filtros do deep link', () => {
    window.history.replaceState({}, '', '/?view=email-chat&emailFilter=unread&emailPeriod=30d&emailQuery=Maria');
    const { result } = renderHook(() => useEmailThreadListQuery());
    expect(result.current.filters).toEqual({ ...EMAIL_THREAD_DEFAULT_FILTERS, filter: 'unread', period: '30d', search: 'Maria' });
  });

  it('persiste os filtros na URL preservando a rota e a thread abertas', () => {
    window.history.replaceState({}, '', '/?view=email-chat&emailThread=abc');
    const { result } = renderHook(() => useEmailThreadListQuery());
    act(() => result.current.updateFilters({ filter: 'unread', hasAttachments: true }));
    const params = new URLSearchParams(window.location.search);
    expect(params.get('emailFilter')).toBe('unread');
    expect(params.get('emailAttachment')).toBe('true');
    expect(params.get('view')).toBe('email-chat');
    expect(params.get('emailThread')).toBe('abc');
  });

  it('trocar filtro volta para a primeira página', () => {
    const { result } = renderHook(() => useEmailThreadListQuery());
    act(() => result.current.setPage(4));
    expect(result.current.page).toBe(4);
    act(() => result.current.updateFilters({ filter: 'starred' }));
    expect(result.current.page).toBe(1);
  });

  it('limpar remove os filtros da URL', () => {
    window.history.replaceState({}, '', '/?view=email-chat&emailFilter=unread&emailPeriod=7d');
    const { result } = renderHook(() => useEmailThreadListQuery());
    act(() => result.current.resetFilters());
    expect(result.current.filters).toEqual(EMAIL_THREAD_DEFAULT_FILTERS);
    const params = new URLSearchParams(window.location.search);
    expect(params.get('emailFilter')).toBeNull();
    expect(params.get('emailPeriod')).toBeNull();
    expect(params.get('view')).toBe('email-chat');
  });

  it('a busca só troca a consulta depois da espera curta', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useEmailThreadListQuery());
      act(() => result.current.setSearch('mar'));
      expect(result.current.filters.search).toBe('mar');
      expect(result.current.query.search).toBe('');
      act(() => { vi.advanceTimersByTime(EMAIL_THREAD_SEARCH_DEBOUNCE_MS); });
      expect(result.current.query.search).toBe('mar');
    } finally {
      vi.useRealTimers();
    }
  });

  it('trocar de filtro reseta a busca pendente da consulta', () => {
    const { result } = renderHook(() => useEmailThreadListQuery());
    act(() => result.current.setSearch('mar'));
    act(() => result.current.resetFilters());
    expect(result.current.filters.search).toBe('');
    expect(result.current.query.search).toBe('');
  });

  it('a consulta leva a página pedida ao servidor', () => {
    const { result } = renderHook(() => useEmailThreadListQuery());
    act(() => result.current.setPage(3));
    expect(result.current.query.page).toBe(3);
    expect(result.current.query.filter).toBe('all');
  });
});
