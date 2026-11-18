import { describe, it, expect, beforeEach } from 'vitest';
import { CONTACT_DETAIL_SECTIONS, DEFAULT_OPEN_SECTIONS, getStoredAccordionState } from '../contactDetailSections';

const KEY = 'contact-details-accordion-state';

describe('contactDetailSections — catálogo sem seções movidas para as abas', () => {
  beforeEach(() => localStorage.clear());

  it('localStorage antigo com seções removidas devolve só as válidas', () => {
    localStorage.setItem(KEY, JSON.stringify(['info', 'commercial-summary', 'stats']));
    expect(getStoredAccordionState()).toEqual(['info']);
  });

  it('localStorage só com valores removidos cai no DEFAULT_OPEN_SECTIONS', () => {
    localStorage.setItem(KEY, JSON.stringify(['commercial-summary', 'purchases', 'stats']));
    expect(getStoredAccordionState()).toEqual(DEFAULT_OPEN_SECTIONS);
    expect(DEFAULT_OPEN_SECTIONS).toEqual(['info', 'whatsapp-status', 'tags']);
  });

  it('o catálogo não contém commercial-summary, purchases nem stats', () => {
    const values = CONTACT_DETAIL_SECTIONS.map((s) => s.value);
    expect(values).not.toContain('commercial-summary');
    expect(values).not.toContain('purchases');
    expect(values).not.toContain('stats');
  });
});
