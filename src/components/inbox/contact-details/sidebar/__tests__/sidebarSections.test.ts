import { describe, expect, it, beforeEach, vi } from 'vitest';
import { DEFAULT_OPEN_SECTIONS, getStoredSidebarState, saveSidebarState } from '../sidebarSections';

const NEW_KEY = 'contact-sidebar-accordion-state@v2';
const OLD_KEY = 'contact-details-accordion-state';

describe('sidebarSections — migração do localStorage (etapa 44)', () => {
  beforeEach(() => localStorage.clear());

  it('storage antigo só com seções que não existem mais → default (seções atuais abertas)', () => {
    localStorage.setItem(OLD_KEY, JSON.stringify(['info', 'tags']));
    expect(getStoredSidebarState()).toEqual(DEFAULT_OPEN_SECTIONS);
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

  it('"recolher tudo" grava [] e o vazio persiste na reabertura', () => {
    saveSidebarState([]);
    expect(getStoredSidebarState()).toEqual([]);
  });

  it('chave nova com valor desconhecido → default (não vira "tudo fechado")', () => {
    localStorage.setItem(NEW_KEY, JSON.stringify(['info']));
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

  // Seção nova "Inteligência comercial" (2026-10-12): passa a ser um valor
  // conhecido, sem mexer na chave de storage nem na preferência já salva.
  it('a seção nova intelligence é conhecida e persiste ao reabrir', () => {
    saveSidebarState(['intelligence']);
    expect(getStoredSidebarState()).toEqual(['intelligence']);
  });

  it('preferência salva antes da seção nova sobrevive intacta', () => {
    localStorage.setItem(NEW_KEY, JSON.stringify(['professional', 'singu']));
    expect(getStoredSidebarState()).toEqual(['professional', 'singu']);
  });
});
