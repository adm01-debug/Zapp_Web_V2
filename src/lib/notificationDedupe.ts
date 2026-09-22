const recentEvents = new Map<string, number>();
const MAX_RECENT_EVENTS = 250;

/** Claims an event once per browser runtime, regardless of which hook receives it first. */
export function claimNotificationEvent(key: string, ttlMs = 120_000, now = Date.now()): boolean {
  const previous = recentEvents.get(key);
  if (previous !== undefined && now - previous < ttlMs) return false;

  recentEvents.set(key, now);
  for (const [eventKey, timestamp] of recentEvents) {
    if (now - timestamp >= ttlMs) recentEvents.delete(eventKey);
  }
  while (recentEvents.size > MAX_RECENT_EVENTS) {
    const oldest = recentEvents.keys().next().value;
    if (!oldest) break;
    recentEvents.delete(oldest);
  }
  return true;
}
