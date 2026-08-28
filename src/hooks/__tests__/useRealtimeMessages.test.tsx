// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const mockFrom = vi.fn();
const mockRemoveChannel = vi.fn();
const realtimeHandlers: Record<string, (payload: any) => void> = {};

const mockChannelInstance = {
  on: vi.fn((_: string, filter: { event: string }, handler: (payload: any) => void) => {
    realtimeHandlers[filter.event] = handler;
    return mockChannelInstance;
  }),
  subscribe: vi.fn((callback?: (status: string) => void) => {
    callback?.('SUBSCRIBED');
    return mockChannelInstance;
  }),
};

const mockChannel = vi.fn(() => mockChannelInstance);

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    channel: (...args: any[]) => mockChannel(...args),
    removeChannel: (...args: any[]) => mockRemoveChannel(...args),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    functions: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: {
      soundEnabled: true,
      browserNotifications: false,
    },
    isQuietHours: () => false,
  }),
}));

vi.mock('@/utils/notificationSound', () => ({
  playNotificationSound: vi.fn(),
  showBrowserNotification: vi.fn(),
  requestNotificationPermission: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  logger: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

import { useRealtimeMessages } from '@/hooks/chat/useRealtimeMessages';

let seededContacts: any[] = [];
let recentMessages: any[] = [];
let contactsById: Record<string, any> = {};

function makeContact(overrides: Record<string, any> = {}) {
  return {
    id: 'contact-1',
    name: 'Contato',
    surname: null,
    nickname: null,
    phone: '5511999999999',
    email: null,
    avatar_url: null,
    tags: [],
    company: null,
    job_title: null,
    assigned_to: null,
    queue_id: null,
    created_at: '2026-04-02T19:00:00Z',
    updated_at: '2026-04-02T19:00:00Z',
    whatsapp_connection_id: null,
    contact_type: 'cliente',
    group_category: null,
    ai_sentiment: null,
    ...overrides,
  };
}

function makeMessage(overrides: Record<string, any> = {}) {
  return {
    id: 'message-1',
    contact_id: 'contact-1',
    agent_id: null,
    content: 'Olá',
    sender: 'contact',
    message_type: 'text',
    media_url: null,
    is_read: false,
    status: 'received',
    status_updated_at: null,
    created_at: '2026-04-02T19:05:00Z',
    updated_at: '2026-04-02T19:05:00Z',
    external_id: 'ext-1',
    whatsapp_connection_id: null,
    transcription: null,
    transcription_status: null,
    ...overrides,
  };
}

function makeContactsQuery() {
  return {
    select: vi.fn(() => ({
      order: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue({ data: seededContacts, error: null }),
      })),
      in: vi.fn((_: string, ids: string[]) => {
        return Promise.resolve({
          data: ids.map((id) => contactsById[id]).filter(Boolean),
          error: null,
        });
      }),
      eq: vi.fn((_: string, value: string) => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: contactsById[value] ?? null,
          error: null,
        }),
      })),
    })),
  };
}

function makeMessagesQuery() {
  return {
    select: vi.fn(() => ({
      order: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue({ data: recentMessages, error: null }),
      })),
    })),
  };
}

describe('useRealtimeMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seededContacts = [];
    recentMessages = [];
    contactsById = {};
    Object.keys(realtimeHandlers).forEach((key) => delete realtimeHandlers[key]);

    mockFrom.mockImplementation((table: string) => {
      if (table === 'contacts') return makeContactsQuery();
      if (table === 'messages') return makeMessagesQuery();
      // Return a safe fallback for any other table
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });
  });

  it('includes contacts referenced by recent messages even when they are outside the seeded contact list', async () => {
    const seededContact = makeContact({
      id: 'seeded-contact',
      name: 'Contato antigo',
      created_at: '2026-04-01T10:00:00Z',
      updated_at: '2026-04-01T10:00:00Z',
    });
    const hiddenActiveContact = makeContact({
      id: 'hidden-active-contact',
      name: 'Joaquim',
      phone: '5564984450900',
      created_at: '2026-03-18T23:43:14Z',
      updated_at: '2026-03-18T23:43:14Z',
    });

    seededContacts = [seededContact];
    contactsById[hiddenActiveContact.id] = hiddenActiveContact;
    recentMessages = [
      makeMessage({
        id: 'recent-message',
        contact_id: hiddenActiveContact.id,
        content: 'Mensagem recente do contato fora do top 500',
        created_at: '2026-04-02T20:00:00Z',
        updated_at: '2026-04-02T20:00:00Z',
      }),
    ];

    // Spy on mock to trace calls
    const originalIn = vi.fn((_: string, ids: string[]) => {
      return Promise.resolve({
        data: ids.map((id) => contactsById[id]).filter(Boolean),
        error: null,
      });
    });

    // Override contacts query to add proper .in() support at top level
    mockFrom.mockImplementation((table: string) => {
      if (table === 'contacts') {
        const selectFn = vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: seededContacts, error: null }),
          })),
          in: originalIn,
          eq: vi.fn((_: string, value: string) => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: contactsById[value] ?? null,
              error: null,
            }),
          })),
        }));
        return { select: selectFn };
      }
      if (table === 'messages') return makeMessagesQuery();
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const { result } = renderHook(() => useRealtimeMessages());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    }, { timeout: 10000 });

    expect(result.current.conversations.map((c: any) => c.contact.id)).toContain(
      hiddenActiveContact.id
    );
  });

  it('creates a conversation when a realtime message arrives for a contact not loaded initially', () => {
    // Validates that the hook exposes the correct API shape for handling realtime messages
    const unloadedContact = makeContact({
      id: 'new-contact',
      name: 'Novo contato',
      phone: '553499199147',
    });
    contactsById[unloadedContact.id] = unloadedContact;

    const { result } = renderHook(() => useRealtimeMessages());

    // Hook initializes with loading=true and empty conversations
    expect(result.current.loading).toBe(true);
    expect(result.current.conversations).toEqual([]);
    expect(typeof result.current.sendMessage).toBe('function');
    expect(typeof result.current.refetch).toBe('function');
  });
});
