import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTalkXFilterState } from '../useFilterState';

const CHAVE = 'talkx.test.filters';
const PADROES: Record<string, string> = { status: 'all', objective: 'all', segment: 'all' };

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
});

describe('useTalkXFilterState', () => {
  it('(1) começa nos padrões, sem busca nem período', () => {
    const { result } = renderHook(() => useTalkXFilterState(CHAVE, PADROES));

    expect(result.current.values).toEqual(PADROES);
    expect(result.current.query).toBe('');
    expect(result.current.period).toBeNull();
    expect(result.current.hasActive).toBe(false);
  });

  it('(2) setValue altera e persiste (releitura devolve o valor)', () => {
    const { result } = renderHook(() => useTalkXFilterState(CHAVE, PADROES));

    act(() => result.current.setValue('status', 'sending'));
    expect(result.current.values.status).toBe('sending');

    // Releitura: uma nova instância lê do sessionStorage.
    const { result: relido } = renderHook(() => useTalkXFilterState(CHAVE, PADROES));
    expect(relido.current.values.status).toBe('sending');
    expect(relido.current.values.objective).toBe('all');
  });

  it('(3) hasActive acompanha filtros, busca e período', () => {
    const { result } = renderHook(() => useTalkXFilterState(CHAVE, PADROES));
    expect(result.current.hasActive).toBe(false);

    act(() => result.current.setValue('status', 'sending'));
    expect(result.current.hasActive).toBe(true);

    act(() => result.current.setValue('status', 'all'));
    expect(result.current.hasActive).toBe(false);

    act(() => result.current.setQuery('campanha'));
    expect(result.current.hasActive).toBe(true);

    act(() => result.current.setQuery(''));
    expect(result.current.hasActive).toBe(false);

    act(() => result.current.setPeriod('custom'));
    expect(result.current.hasActive).toBe(true);
  });

  it('(4) JSON inválido no sessionStorage não quebra e devolve padrões', () => {
    sessionStorage.setItem(CHAVE, '{isto não é json');

    const { result } = renderHook(() => useTalkXFilterState(CHAVE, PADROES));

    expect(result.current.values).toEqual(PADROES);
    expect(result.current.query).toBe('');
    expect(result.current.period).toBeNull();
    expect(result.current.hasActive).toBe(false);
  });

  it('(5) clear() restaura tudo aos padrões e não deixa lixo no storage', () => {
    const { result } = renderHook(() => useTalkXFilterState(CHAVE, PADROES));

    act(() => {
      result.current.setValue('status', 'sending');
      result.current.setQuery('abc');
      result.current.setPeriod('30d');
    });
    expect(result.current.hasActive).toBe(true);

    act(() => result.current.clear());

    expect(result.current.values).toEqual(PADROES);
    expect(result.current.query).toBe('');
    expect(result.current.period).toBeNull();
    expect(result.current.hasActive).toBe(false);

    // Nada de lixo persistido: a releitura volta aos padrões.
    const { result: relido } = renderHook(() => useTalkXFilterState(CHAVE, PADROES));
    expect(relido.current.values).toEqual(PADROES);
    expect(relido.current.query).toBe('');
    expect(relido.current.period).toBeNull();
    expect(relido.current.hasActive).toBe(false);
  });

  it('(extra) período e busca persistem; custom é válido', () => {
    const { result } = renderHook(() => useTalkXFilterState(CHAVE, PADROES));

    act(() => {
      result.current.setQuery('relatório');
      result.current.setPeriod('custom');
    });

    const { result: relido } = renderHook(() => useTalkXFilterState(CHAVE, PADROES));
    expect(relido.current.query).toBe('relatório');
    expect(relido.current.period).toBe('custom');
    expect(relido.current.hasActive).toBe(true);
  });
});
