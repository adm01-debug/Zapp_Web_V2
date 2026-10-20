import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      track: vi.fn(),
      untrack: vi.fn(),
      unsubscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  },
}));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { useTypingPresence } from '@/hooks/chat/useTypingPresence';

describe('useTypingPresence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with empty typing users', () => {
    const { result } = renderHook(() => useTypingPresence({
      conversationId: 'conv-1',
      currentUserId: 'user-1',
      currentUserName: 'Agent',
    }));
    expect(result.current.typingUsers).toEqual([]);
  });

  it('exposes handleTypingStop function', () => {
    const { result } = renderHook(() => useTypingPresence({
      conversationId: 'conv-1',
    }));
    expect(typeof result.current.handleTypingStop).toBe('function');
  });

  it('exposes handleTypingStart function', () => {
    const { result } = renderHook(() => useTypingPresence({
      conversationId: 'conv-1',
    }));
    expect(typeof result.current.handleTypingStart).toBe('function');
  });

  it('isContactTyping defaults to false', () => {
    const { result } = renderHook(() => useTypingPresence({
      conversationId: 'conv-1',
    }));
    expect(result.current.isContactTyping).toBe(false);
  });

  it('handles missing currentUserId with defaults', () => {
    const { result } = renderHook(() => useTypingPresence({
      conversationId: 'conv-1',
    }));
    expect(result.current).toBeDefined();
  });
});
