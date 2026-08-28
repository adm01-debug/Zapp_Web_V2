import { useState, useEffect, useCallback, useRef } from 'react';
import { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import { getLogger } from '@/lib/logger';

const log = getLogger('OfflineCache');
const CACHE_KEY = 'offline_conversations';
const CACHE_TTL = 1000 * 60 * 30; // 30 min

interface CacheEntry {
  data: ConversationWithMessages[];
  timestamp: number;
}

function readCache(): ConversationWithMessages[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function writeCache(data: ConversationWithMessages[]) {
  // Progressive degradation on quota errors: shrink conversation count and
  // per-conversation message window until it fits, then give up silently.
  const tiers: Array<{ convs: number; msgs: number }> = [
    { convs: 50, msgs: 20 },
    { convs: 30, msgs: 10 },
    { convs: 15, msgs: 5 },
    { convs: 10, msgs: 3 },
  ];
  for (const { convs, msgs } of tiers) {
    try {
      const trimmed = data.slice(0, convs).map(c => ({
        ...c,
        messages: c.messages.slice(-msgs),
      }));
      const entry: CacheEntry = { data: trimmed, timestamp: Date.now() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
      return;
    } catch (e) {
      const isQuota = e instanceof DOMException && (
        e.name === 'QuotaExceededError' || e.code === 22
      );
      if (!isQuota) {
        log.warn('Failed to write offline cache', e);
        return;
      }
      // Free space and try a smaller tier
      try { localStorage.removeItem(CACHE_KEY); } catch { /* noop */ }
    }
  }
  // All tiers failed — drop cache silently to avoid log spam
}

export function useOfflineCache(conversations: ConversationWithMessages[], loading: boolean) {
  const [cachedData, setCachedData] = useState<ConversationWithMessages[] | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const lastWriteRef = useRef(0);

  // Track online/offline status
  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Load cache on mount
  useEffect(() => {
    const cached = readCache();
    if (cached) {
      setCachedData(cached);
      log.info(`Loaded ${cached.length} conversations from offline cache`);
    }
  }, []);

  // Write cache when conversations update (throttled)
  useEffect(() => {
    if (!loading && conversations.length > 0) {
      const now = Date.now();
      if (now - lastWriteRef.current > 10000) { // throttle: max every 10s
        writeCache(conversations);
        lastWriteRef.current = now;
      }
    }
  }, [conversations, loading]);

  // Return cached data when offline and no live data
  const effectiveData = isOffline && loading ? (cachedData || []) : conversations;
  const usingCache = isOffline && loading && !!cachedData;

  const clearCache = useCallback(() => {
    localStorage.removeItem(CACHE_KEY);
    setCachedData(null);
  }, []);

  return {
    conversations: effectiveData,
    isOffline,
    usingCache,
    clearCache,
  };
}
