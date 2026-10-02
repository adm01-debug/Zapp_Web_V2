import { describe, expect, it, beforeEach, vi } from 'vitest';
import { DEFAULT_OPEN_SECTIONS, getStoredSidebarState, saveSidebarState } from '../sidebarSections';

const NEW_KEY = 'contact-sidebar-accordion-state@v2';
const OLD_KEY = 'contact-details-accordion-state';

describe('sidebarSections — migração do localStorage (etapa 44)', () => {
  beforeEach(() => localStorage.clear());

  it('storage antigo só com seções que não existem mais → default (3 abertas)', () => {
    localStorage.setItem(OLD_KEY, JSON.stringify(['info', 'tags']));
    expect(getStoredSidebarState()).toEqual(['professional', 'personal', 'singu']);
  });

  it('storage antigo com valor válido sobrevive e migra para a chave nova', () => {
    localStorage.setItem(OLD_KEY, JSON.stringify(['personal']));
    expect(getStoredSidebarState()).toEqual(['personal']);
    expect(localStorage.getItem(NEW_KEY)).toBe(JSON.stringify(['personal']));
  });

  it('chave nova tem precedência sobre a antiga', () => {
    localStorage.setItem(OLD_KEY, JSON.stringify(['personal']));
    localStorage.setItem(NEW_KEY, JSON.stringify(['singu']));
    expect(getStoredSidebarState()).toEqual(['singu']);
  });

  it('sem nada gravado → default', () => {
    expect(getStoredSidebarState()).toEqual(DEFAULT_OPEN_SECTIONS);
  });

  it('JSON corrompido → default', () => {
    localStorage.setItem(NEW_KEY, '{quebrado');
    expect(getStoredSidebarState()).toEqual(DEFAULT_OPEN_SECTIONS);
  });

  it('storage indisponível → default', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(getStoredSidebarState()).toEqual(DEFAULT_OPEN_SECTIONS);
    getItem.mockRestore();
  });

  it('saveSidebarState grava na chave nova e não explode sem storage', () => {
    saveSidebarState(['professional']);
    expect(localStorage.getItem(NEW_KEY)).toBe(JSON.stringify(['professional']));
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => saveSidebarState(['personal'])).not.toThrow();
    setItem.mockRestore();
  });
});
