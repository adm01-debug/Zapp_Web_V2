import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock logger
vi.mock('@/lib/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock useRealtimeMessages type
vi.mock('@/hooks/chat/useRealtimeMessages', () => ({}));

import { useOfflineCache } from '@/hooks/system/useOfflineCache';

function makeConversation(id: string, msgCount = 1) {
  return {
    contact: { id, name: `Contact ${id}`, phone: `+55${id}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    messages: Array.from({ length: msgCount }, (_, i) => ({
      id: `msg-${id}-${i}`,
      content: `Message ${i}`,
      sender: 'contact',
      message_type: 'text',
      created_at: new Date().toISOString(),
      is_read: false,
    })),
    lastMessage: { id: `msg-${id}-0`, content: 'Last', created_at: new Date().toISOString() },
    unreadCount: 1,
  } as any;
}

describe('useOfflineCache', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns conversations directly when online', () => {
    const convs = [makeConversation('1')];
    const { result } = renderHook(() => useOfflineCache(convs, false));

    expect(result.current.conversations).toBe(convs);
    expect(result.current.isOffline).toBe(false);
    expect(result.current.usingCache).toBe(false);
  });

  it('writes cache to localStorage when conversations are available', () => {
    const convs = [makeConversation('1'), makeConversation('2')];
    renderHook(() => useOfflineCache(convs, false));

    const stored = localStorage.getItem('offline_conversations');
    expect(stored).toBeTruthy();

    const parsed = JSON.parse(stored!);
    expect(parsed.data).toHaveLength(2);
    expect(parsed.timestamp).toBeDefined();
  });

  it('trims to 50 conversations and 20 messages', () => {
    const convs = Array.from({ length: 60 }, (_, i) => makeConversation(String(i), 30));
    renderHook(() => useOfflineCache(convs, false));

    const stored = localStorage.getItem('offline_conversations');
    const parsed = JSON.parse(stored!);
    expect(parsed.data).toHaveLength(50);
    expect(parsed.data[0].messages).toHaveLength(20);
  });

  it('does not write cache when loading', () => {
    const convs = [makeConversation('1')];
    renderHook(() => useOfflineCache(convs, true));

    expect(localStorage.getItem('offline_conversations')).toBeNull();
  });

  it('clearCache removes localStorage entry', () => {
    const convs = [makeConversation('1')];
    const { result } = renderHook(() => useOfflineCache(convs, false));

    expect(localStorage.getItem('offline_conversations')).toBeTruthy();

    act(() => {
      result.current.clearCache();
    });

    expect(localStorage.getItem('offline_conversations')).toBeNull();
  });

  it('reads expired cache as null', () => {
    const entry = {
      data: [makeConversation('1')],
      timestamp: Date.now() - (31 * 60 * 1000), // 31 min ago (TTL is 30 min)
    };
    localStorage.setItem('offline_conversations', JSON.stringify(entry));

    const { result } = renderHook(() => useOfflineCache([], true));

    // Expired cache should be removed
    expect(localStorage.getItem('offline_conversations')).toBeNull();
  });

  it('tracks online/offline events', () => {
    const convs = [makeConversation('1')];
    const { result } = renderHook(() => useOfflineCache(convs, false));

    expect(result.current.isOffline).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.isOffline).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.isOffline).toBe(false);
  });
});
