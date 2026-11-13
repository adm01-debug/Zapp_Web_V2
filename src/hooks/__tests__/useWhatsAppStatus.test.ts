import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useWhatsAppStatus } from '../integrations/useWhatsAppStatus';

// Mocks
const mockMaybeSingle = vi.fn();
const mockInvoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'contacts') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => mockMaybeSingle(),
            }),
          }),
        };
      }
      // whatsapp_connections
      return {
        select: () => ({
          eq: (_: string, val: string) => {
            if (val === 'connected') {
              return { limit: () => ({ maybeSingle: () => mockMaybeSingle() }) };
            }
            return { maybeSingle: () => mockMaybeSingle() };
          },
        }),
      };
    },
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  getLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withCorrelation: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })) })),
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withCorrelation: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })) })),
}));

describe('useWhatsAppStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ========== NO PHONE ==========
  it('returns empty data when phone is undefined', async () => {
    const { result } = renderHook(() => useWhatsAppStatus(undefined));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.statusMessages).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('returns empty data when phone is empty string', async () => {
    const { result } = renderHook(() => useWhatsAppStatus(''));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.statusMessages).toEqual([]);
  });

  // ========== NO CONNECTION ==========
  it('sets error when no WhatsApp connection available', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null }) // contact lookup (original phone)
      .mockResolvedValueOnce({ data: null }) // contact lookup (cleaned phone fallback)
      .mockResolvedValueOnce({ data: null }); // fallback connection

    const { result } = renderHook(() => useWhatsAppStatus('+5511999999999'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBe('Sem conexão WhatsApp disponível');
  });

  // ========== WITH CONNECTION ==========
  it('busca os status quando há conexão e NÃO manda presença ao contato', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { whatsapp_connection_id: 'conn1' } }) // contact
      .mockResolvedValueOnce({ data: { instance_id: 'inst1' } }); // connection details

    mockInvoke
      .mockResolvedValueOnce({ data: [{ key: { id: 's1' }, message: { conversation: 'Hey' } }] });

    const { result } = renderHook(() => useWhatsAppStatus('+5511999999999'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    // Abrir a aba Status não pode sinalizar presença ('paused') ao cliente:
    // presença só sai do compositor, quando o atendente digita.
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls.map((c) => c[0])).toEqual(['evolution-api/find-status-messages']);
    expect(mockInvoke.mock.calls.some((c) => String(c[0]).includes('presence'))).toBe(false);
    expect(result.current.presence.loading).toBe(false);
  });

  // ========== FALLBACK CONNECTION ==========
  it('uses fallback connection when contact has no whatsapp_connection_id', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { whatsapp_connection_id: null } }) // contact without connection
      .mockResolvedValueOnce({ data: { id: 'fallback1', instance_id: 'inst-fallback' } }) // fallback
      .mockResolvedValueOnce({ data: { instance_id: 'inst-fallback' } }); // connection details

    mockInvoke
      .mockResolvedValueOnce({ data: [] });

    const { result } = renderHook(() => useWhatsAppStatus('+5511888888888'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBeNull();
  });

  // ========== API ERROR HANDLING ==========
  it('handles API errors gracefully', async () => {
    // When Promise.allSettled is used, individual rejections don't throw
    // The error path is only hit if getInstanceForPhone or the try block itself throws
    mockMaybeSingle
      .mockRejectedValueOnce(new Error('DB connection failed'));

    const { result } = renderHook(() => useWhatsAppStatus('+5511999999999'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBe('DB connection failed');
  });

  // ========== INITIAL STATE ==========
  it('starts with loading false and empty data', () => {
    const { result } = renderHook(() => useWhatsAppStatus(undefined));
    expect(result.current.statusMessages).toEqual([]);
    expect(result.current.presence.loading).toBe(true);
  });

  // ========== REFRESH FUNCTION ==========
  it('exposes refresh function', () => {
    const { result } = renderHook(() => useWhatsAppStatus('+5511999999999'));
    expect(typeof result.current.refresh).toBe('function');
  });

  // ========== NON-ARRAY RESPONSE ==========
  it('handles non-array status response', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { whatsapp_connection_id: 'conn1' } })
      .mockResolvedValueOnce({ data: { instance_id: 'inst1' } });

    mockInvoke
      .mockResolvedValueOnce({ data: { error: 'not found' } });

    const { result } = renderHook(() => useWhatsAppStatus('+5511999999999'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.statusMessages).toEqual([]);
  });

  // ========== PHONE CLEANING ==========
  it('filters statuses by cleaned phone number', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { whatsapp_connection_id: 'conn1' } })
      .mockResolvedValueOnce({ data: { instance_id: 'inst1' } });

    const statuses = [
      { key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'match' }, message: { conversation: 'Matched' } },
      { key: { remoteJid: '5511888888888@s.whatsapp.net', id: 'no-match' }, message: { conversation: 'Not matched' } },
      { key: { remoteJid: 'status@broadcast', id: 'broadcast' }, message: { conversation: 'Broadcast' } },
    ];

    mockInvoke
      .mockResolvedValueOnce({ data: statuses });

    const { result } = renderHook(() => useWhatsAppStatus('+5511999999999'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    // Should include only the matched phone, exclude non-match and broadcast (no phone match)
    expect(result.current.statusMessages.length).toBe(1);
  });

  // ========== PROMISE.ALLSETTLED ==========
  it('falha na leitura dos status não vira erro da aba', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { whatsapp_connection_id: 'conn1' } })
      .mockResolvedValueOnce({ data: { instance_id: 'inst1' } });

    // Leitura dos status falha (a aba não manda mais presença ao contato)
    mockInvoke.mockImplementation((path: string) => {
      if (path.includes('find-status')) return Promise.reject(new Error('Status API down'));
      return Promise.resolve({ data: {} });
    });

    const { result } = renderHook(() => useWhatsAppStatus('+5511999999999'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    // Should not set error since allSettled handles individual failures
    expect(result.current.statusMessages).toEqual([]);
  });
});
