/**
 * Contrato do hook `useDensity` (src/hooks/ui/useDensity.ts).
 *
 * O hook é o dono de dois efeitos observáveis no navegador:
 *  1. o atributo `data-density` no `<html>` — é ele que a folha
 *     `src/styles/accessibility.css` usa para trocar o tamanho do texto
 *     (ver `src/styles/__tests__/densityTextSize.test.ts`); e
 *  2. o cache `localStorage['ui-density']`, que devolve a escolha do usuário
 *     no próximo boot.
 *
 * Aqui se prova o comportamento REAL do hook (não o CSS): cada modo precisa
 * chegar ao `<html>` e ao cache, o `setDensity` precisa valer na hora e o
 * `cycleDensity` precisa percorrer a ordem confortável → compacto → denso.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDensity } from '../useDensity';

const CHAVE = 'ui-density';

describe('useDensity', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-density');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('abre no modo confortável e aplica o atributo no <html>', () => {
    const { result } = renderHook(() => useDensity());

    expect(result.current.density).toBe('comfortable');
    expect(document.documentElement.getAttribute('data-density')).toBe('comfortable');
    expect(localStorage.getItem(CHAVE)).toBe('comfortable');
  });

  it('lê no boot o modo gravado no cache do navegador', () => {
    localStorage.setItem(CHAVE, 'dense');

    const { result } = renderHook(() => useDensity());

    expect(result.current.density).toBe('dense');
    expect(document.documentElement.getAttribute('data-density')).toBe('dense');
  });

  it('setDensity leva a escolha para o estado, para o <html> e para o cache', () => {
    const { result } = renderHook(() => useDensity());

    act(() => result.current.setDensity('compact'));

    expect(result.current.density).toBe('compact');
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
    expect(localStorage.getItem(CHAVE)).toBe('compact');
  });

  it('cycleDensity percorre confortável → compacto → denso → confortável', () => {
    const { result } = renderHook(() => useDensity());

    act(() => result.current.cycleDensity());
    expect(result.current.density).toBe('compact');
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');

    act(() => result.current.cycleDensity());
    expect(result.current.density).toBe('dense');
    expect(document.documentElement.getAttribute('data-density')).toBe('dense');

    act(() => result.current.cycleDensity());
    expect(result.current.density).toBe('comfortable');
    expect(document.documentElement.getAttribute('data-density')).toBe('comfortable');
    expect(localStorage.getItem(CHAVE)).toBe('comfortable');
  });

  it('localStorage bloqueado não derruba o hook: cai no confortável', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage bloqueado');
    });

    const { result } = renderHook(() => useDensity());

    expect(result.current.density).toBe('comfortable');
    expect(document.documentElement.getAttribute('data-density')).toBe('comfortable');
  });
});
