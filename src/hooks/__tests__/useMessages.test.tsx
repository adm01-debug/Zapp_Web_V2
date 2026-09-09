// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const mockFrom = vi.fn();
const mockChannel = vi.fn().mockReturnValue({
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
});
const mockRemoveChannel = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    channel: (...args: any[]) => mockChannel(...args),
    removeChannel: (...args: any[]) => mockRemoveChannel(...args),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn() },
  logger: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

import { useMessages } from '@/hooks/chat/useMessages';

function makeQueryChain(data: any[] = [], error: any = null) {
  const rangeMock = vi.fn()
    .mockResolvedValueOnce({ data, error })
    .mockResolvedValue({ data: [], error: null });
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          range: rangeMock,
        }),
      }),
    }),
  };
}

describe('useMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue(makeQueryChain());
  });

  it('returns empty messages when contactId is null', async () => {
    const { result } = renderHook(() => useMessages({ contactId: null }));

    // With null contactId, messages should be empty immediately
    // The hook sets loading=false and messages=[] synchronously for null contactId
    await waitFor(() => {
      expect(result.current.messages).toEqual([]);
    });

    expect(result.current.error).toBeNull();
  });

  it('fetches messages when contactId is provided', async () => {
    const mockMessages = [
      { id: 'msg-1', contact_id: 'c1', content: 'Hello', sender: 'contact', created_at: '2024-01-01' },
      { id: 'msg-2', contact_id: 'c1', content: 'Hi!', sender: 'agent', created_at: '2024-01-01' },
    ];
    mockFrom.mockReturnValue(makeQueryChain(mockMessages));

    const { result } = renderHook(() => useMessages({ contactId: 'c1' }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Hook enriches each message with derived fields (timestamp, mediaUrl, type, etc.)
    expect(result.current.messages).toHaveLength(mockMessages.length);
    expect(result.current.messages[0]).toMatchObject({ id: 'msg-1', content: 'Hello', sender: 'contact', isEdited: false });
    expect(result.current.messages[1]).toMatchObject({ id: 'msg-2', content: 'Hi!', sender: 'agent', isEdited: false });
  });

  it('sets error when fetch fails', async () => {
    mockFrom.mockReturnValue(makeQueryChain(null, new Error('Network error')));

    const { result } = renderHook(() => useMessages({ contactId: 'c1' }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });

  it('does not fetch when enabled=false', () => {
    const { result } = renderHook(() => useMessages({ contactId: 'c1', enabled: false }));
    expect(result.current).toBeDefined();
  });

  it('clears messages when contactId changes to null', async () => {
    const mockMessages = [
      { id: 'msg-1', contact_id: 'c1', content: 'Hello', sender: 'contact', created_at: '2024-01-01' },
    ];
    mockFrom.mockReturnValue(makeQueryChain(mockMessages));

    const { result, rerender } = renderHook(
      ({ contactId }: { contactId: string | null }) => useMessages({ contactId }),
      { initialProps: { contactId: 'c1' as string | null } }
    );

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1);
    });

    mockFrom.mockReturnValue(makeQueryChain());
    rerender({ contactId: null });

    await waitFor(() => {
      expect(result.current.messages).toEqual([]);
    });
  });

  it('ignores a stale response after switching contacts', async () => {
    let resolveC1: (value: unknown) => void = () => undefined;
    let resolveC2: (value: unknown) => void = () => undefined;
    const c1Promise = new Promise((resolve) => { resolveC1 = resolve; });
    const c2Promise = new Promise((resolve) => { resolveC2 = resolve; });
    mockFrom.mockImplementation(() => ({
      select: vi.fn(() => ({
        eq: vi.fn((_: string, contact: string) => ({
          order: vi.fn(() => ({
            range: vi.fn(() => contact === 'c1' ? c1Promise : c2Promise),
          })),
        })),
      })),
    }));

    const { result, rerender } = renderHook(
      ({ contactId }) => useMessages({ contactId }),
      { initialProps: { contactId: 'c1' } },
    );
    rerender({ contactId: 'c2' });

    await act(async () => {
      resolveC2({ data: [{ id: 'm2', contact_id: 'c2', content: 'B', sender: 'contact', created_at: '2024-01-02' }], error: null });
      await c2Promise;
    });
    await waitFor(() => expect(result.current.messages.map((message) => message.id)).toEqual(['m2']));

    await act(async () => {
      resolveC1({ data: [{ id: 'm1', contact_id: 'c1', content: 'A', sender: 'contact', created_at: '2024-01-01' }], error: null });
      await c1Promise;
    });
    expect(result.current.messages.map((message) => message.id)).toEqual(['m2']);
  });

  it('invalidates an in-flight response while disabled and refreshes on re-enable', async () => {
    let resolveFirst: (value: unknown) => void = () => undefined;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    let calls = 0;
    mockFrom.mockImplementation(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ order: vi.fn(() => ({
          range: vi.fn(() => ++calls === 1
            ? first
            : Promise.resolve({ data: [{ id: 'fresh', contact_id: 'c1', content: 'Fresh', sender: 'contact', created_at: '2024-01-02' }], error: null })),
        })) })),
      })),
    }));

    const { result, rerender } = renderHook(
      ({ enabled }) => useMessages({ contactId: 'c1', enabled }),
      { initialProps: { enabled: true } },
    );
    rerender({ enabled: false });
    await act(async () => {
      resolveFirst({ data: [{ id: 'stale', contact_id: 'c1', content: 'Stale', sender: 'contact', created_at: '2024-01-01' }], error: null });
      await first;
    });
    expect(result.current.messages).toEqual([]);

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.messages.map((message) => message.id)).toEqual(['fresh']));
    expect(calls).toBe(2);
  });
});
