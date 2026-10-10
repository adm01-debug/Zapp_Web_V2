import { describe, expect, it } from 'vitest';
import { parseCRMIntegrationBuildFlag } from '../externalClient';

describe('CRM integration build flag', () => {
  it('fails closed unless the value is exactly true', () => {
    expect(parseCRMIntegrationBuildFlag('true')).toBe(true);
    for (const value of [undefined, null, '', 'false', 'TRUE', true, 1]) {
      expect(parseCRMIntegrationBuildFlag(value)).toBe(false);
    }
  });
});
