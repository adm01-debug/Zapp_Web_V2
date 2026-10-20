import { describe, it, expect } from 'vitest';
describe('smoke', () => {
  it('rode', () => { console.log('TZ=', Intl.DateTimeFormat().resolvedOptions().timeZone, process.env.TZ); expect(1).toBe(1); });
});
