import { describe, expect, it } from 'vitest';
import { claimNotificationEvent } from '@/lib/notificationDedupe';

describe('claimNotificationEvent', () => {
  it('allows the first consumer and rejects a replay inside the TTL', () => {
    expect(claimNotificationEvent('event:first', 1_000, 10_000)).toBe(true);
    expect(claimNotificationEvent('event:first', 1_000, 10_500)).toBe(false);
  });

  it('allows the same stable identity again after the TTL', () => {
    expect(claimNotificationEvent('event:ttl', 1_000, 20_000)).toBe(true);
    expect(claimNotificationEvent('event:ttl', 1_000, 21_000)).toBe(true);
  });

  it('does not collapse independent event identities', () => {
    expect(claimNotificationEvent('event:a', 1_000, 30_000)).toBe(true);
    expect(claimNotificationEvent('event:b', 1_000, 30_000)).toBe(true);
  });
});
