const recentEvents = new Map<string, number>();
const MAX_RECENT_EVENTS = 2_000;

/** Claims an event once until its own TTL expires, regardless of which hook receives it first. */
export function claimNotificationEvent(key: string, ttlMs = 120_000, now = Date.now()): boolean {
  for (const [eventKey, expiresAt] of recentEvents) {
    if (expiresAt <= now) recentEvents.delete(eventKey);
  }

  const previousExpiry = recentEvents.get(key);
  if (previousExpiry !== undefined && previousExpiry > now) return false;

  // Never evict an unexpired identity merely to make room: that would make a
  // replay look new. Under abnormal event floods, fail closed until entries
  // expire instead of growing memory without a bound.
  if (recentEvents.size >= MAX_RECENT_EVENTS) return false;

  recentEvents.set(key, now + Math.max(0, ttlMs));
  return true;
}
