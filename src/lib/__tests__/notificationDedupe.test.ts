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

  it('does not evict an unexpired identity after more than 250 other events', () => {
    expect(claimNotificationEvent('capacity:first', 120_000, 40_000)).toBe(true);
    for (let index = 0; index < 300; index += 1) {
      expect(claimNotificationEvent(`capacity:${index}`, 120_000, 40_001)).toBe(true);
    }
    expect(claimNotificationEvent('capacity:first', 120_000, 40_002)).toBe(false);
  });

  it('honors each entry own TTL when callers use different windows', () => {
    expect(claimNotificationEvent('mixed:long', 120_000, 50_000)).toBe(true);
    expect(claimNotificationEvent('mixed:short', 100, 50_000)).toBe(true);
    expect(claimNotificationEvent('mixed:cleanup', 100, 50_200)).toBe(true);
    expect(claimNotificationEvent('mixed:long', 120_000, 50_201)).toBe(false);
  });

  it('fails closed instead of growing without limit or evicting a live identity', () => {
    for (let index = 0; index < 2_000; index += 1) {
      expect(claimNotificationEvent(`overflow:${index}`, 120_000, 1_000_000)).toBe(true);
    }
    expect(claimNotificationEvent('overflow:rejected', 120_000, 1_000_000)).toBe(false);
    expect(claimNotificationEvent('overflow:0', 120_000, 1_000_000)).toBe(false);
    expect(claimNotificationEvent('overflow:after-expiry', 120_000, 1_120_001)).toBe(true);
  });
});
