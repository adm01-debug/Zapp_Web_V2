import { describe, expect, it } from 'vitest';
import { normalizeSearchFilterValue } from '@/hooks/crm/useAdvancedContactSearch';

describe('normalizeSearchFilterValue', () => {
  it('preserves false and zero instead of clearing valid filters', () => {
    expect(normalizeSearchFilterValue(false)).toBe(false);
    expect(normalizeSearchFilterValue(0)).toBe(0);
  });

  it('clears only the empty string', () => {
    expect(normalizeSearchFilterValue('')).toBeUndefined();
    expect(normalizeSearchFilterValue(undefined)).toBeUndefined();
    expect(normalizeSearchFilterValue('active')).toBe('active');
  });
});
