import { describe, it, expect } from 'vitest';
import { CONTACT_TYPES } from '@/utils/whatsappFileTypes';
import { CONTACT_TYPE_CONFIG } from '../contactTypeConfig';
import { ORDERED_CONTACT_TYPE_CONFIGS, VALID_TAB_TYPES } from '../contactTypeOrder';

const canonical = CONTACT_TYPES.map(t => t.value);

describe('contactTypeConfig × CONTACT_TYPES', () => {
  it('CONTACT_TYPE_CONFIG tem exatamente os tipos canônicos', () => {
    expect(Object.keys(CONTACT_TYPE_CONFIG).sort()).toEqual([...canonical].sort());
  });

  it('ORDERED_CONTACT_TYPE_CONFIGS segue a ordem de CONTACT_TYPES', () => {
    expect(ORDERED_CONTACT_TYPE_CONFIGS.map(c => c.type)).toEqual(canonical);
  });

  it('VALID_TAB_TYPES = all + canônicos, sem tipos extintos', () => {
    expect([...VALID_TAB_TYPES].sort()).toEqual(['all', ...canonical].sort());
    for (const extinct of ['lead', 'outros', 'sicoob_gifts']) expect(VALID_TAB_TYPES.has(extinct)).toBe(false);
  });

  it('badge de cada tipo tem cor de texto para os dois temas', () => {
    for (const cfg of Object.values(CONTACT_TYPE_CONFIG)) {
      expect(cfg.badgeClass).toMatch(/(^| )text-\[hsl\(/);
      expect(cfg.badgeClass).toMatch(/ dark:text-\[hsl\(/);
    }
  });
});
