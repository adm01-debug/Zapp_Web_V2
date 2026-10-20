import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

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
  } as unknown as ConversationWithMessages;
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

/**
 * R2-INB-015 (#311) — cache offline válido era abandonado assim que a carga
 * falhava. O fallback só existia enquanto `loading` era true; sem conexão a
 * busca falha e `loading=false` zerava a lista, descartando um cache ainda
 * válido ("aparece e desaparece") e deixando a conversa selecionada vazia.
 * Os testes abaixo fixam o contrato: cache offline sustenta a leitura inclusive
 * DEPOIS que a carga termina, e os dados ao vivo o substituem (recuperação
 * explícita).
 */
describe('useOfflineCache — o cache offline sobrevive à falha de carga (R2-INB-015)', () => {
  function seedValidCache(id: string) {
    localStorage.setItem('offline_conversations', JSON.stringify({ data: [makeConversation(id)], timestamp: Date.now() }));
  }

  it('usa o cache offline depois que a carga termina (loading=false, sem dados ao vivo)', () => {
    seedValidCache('c1');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    const { result } = renderHook(() => useOfflineCache([], false));

    expect(result.current.isOffline).toBe(true);
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0].contact.id).toBe('c1');
    expect(result.current.usingCache).toBe(true);
  });

  it('não abandona o cache quando a carga falhou e a lista ao vivo veio vazia', () => {
    seedValidCache('c9');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    const { result } = renderHook(() => useOfflineCache([], false));

    // O ponteiro tem de continuar apontando para o cache: antes o array caía para [].
    expect(result.current.conversations).not.toBeNull();
    expect(result.current.conversations[0]).toMatchObject({ contact: { id: 'c9' } });
  });

  it('dados ao vivo reassumem a tela offline (recuperação explícita, sem cache)', () => {
    seedValidCache('cache-1');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const aoVivo = [makeConversation('vivo-1')];

    const { result } = renderHook(() => useOfflineCache(aoVivo, false));

    expect(result.current.conversations).toBe(aoVivo);
    expect(result.current.usingCache).toBe(false);
  });

  it('nunca usa o cache quando está online, mesmo com a lista vazia', () => {
    seedValidCache('c1');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

    const { result } = renderHook(() => useOfflineCache([], false));

    expect(result.current.conversations).toEqual([]);
    expect(result.current.usingCache).toBe(false);
  });
});
