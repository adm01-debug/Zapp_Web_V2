import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useWhatsAppStatus, __resetStatusIndisponivelParaTestes } from '../integrations/useWhatsAppStatus';

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
              // Fallback (P0-1): lista ordenada de conexões vivas, filtrada no hook
              // para nunca cair na conexão de teste do E2E. O mock de linha única
              // vira lista de 0/1 item.
              return {
                order: () => ({
                  limit: async () => {
                    const r = await mockMaybeSingle();
                    return { data: r?.data ? [r.data] : [], error: r?.error ?? null };
                  },
                }),
              };
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
    __resetStatusIndisponivelParaTestes();
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

  // ========== P0-1: conexão de teste do E2E nunca é fallback ==========
  it('ignora a conexão de teste do E2E no fallback (sem conexão real → erro)', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null })
      .mockResolvedValueOnce({ data: null })
      .mockResolvedValueOnce({ data: { id: 'e2e', instance_id: 'E2E_FIXTURE', name: '[E2E] Conexão WhatsApp Teste' } });

    const { result } = renderHook(() => useWhatsAppStatus('+5511999999999'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBe('Sem conexão WhatsApp disponível');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  // ========== STATUS OPCIONAL: 404/403/notSupported (console de produção 12/11) ==========
  const statusCalls = () => mockInvoke.mock.calls.filter(([fn]) => fn === 'evolution-api/find-status-messages').length;
  const comConexao = () => mockMaybeSingle
    .mockResolvedValueOnce({ data: { whatsapp_connection_id: 'conn1' } })
    .mockResolvedValueOnce({ data: { instance_id: 'inst-status' } });

  it.each([
    ['404 (Edge sem a rota)', { data: null, error: { name: 'FunctionsHttpError', context: { status: 404 } } }],
    ['403 (sem papel)', { data: null, error: { name: 'FunctionsHttpError', context: { status: 403 } } }],
    ['notSupported (Evolution GO)', { data: { success: false, notSupported: true }, error: null }],
  ])('%s: lista vazia, sem erro, e não chama de novo nesta sessão', async (_rotulo, resposta) => {
    mockInvoke.mockImplementation(async (fn: string) =>
      fn === 'evolution-api/find-status-messages' ? resposta : { data: {}, error: null });

    comConexao();
    const primeiro = renderHook(() => useWhatsAppStatus('5511999999999'));
    await waitFor(() => expect(primeiro.result.current.loading).toBe(false));
    expect(primeiro.result.current.statusMessages).toEqual([]);
    expect(primeiro.result.current.error).toBeNull();
    expect(statusCalls()).toBe(1);
    primeiro.unmount();

    // Outro contato na mesma instância: nada de nova chamada (nem 404 no console).
    comConexao();
    const segundo = renderHook(() => useWhatsAppStatus('5511988887777'));
    await waitFor(() => expect(segundo.result.current.loading).toBe(false));
    expect(segundo.result.current.statusMessages).toEqual([]);
    expect(statusCalls()).toBe(1);
  });

  it('falha passageira (500) não trava: a próxima abertura tenta de novo', async () => {
    mockInvoke.mockImplementation(async (fn: string) =>
      fn === 'evolution-api/find-status-messages'
        ? { data: null, error: { name: 'FunctionsHttpError', context: { status: 500 } } }
        : { data: {}, error: null });

    comConexao();
    const primeiro = renderHook(() => useWhatsAppStatus('5511999999999'));
    await waitFor(() => expect(primeiro.result.current.loading).toBe(false));
    expect(primeiro.result.current.error).toBeNull();
    primeiro.unmount();

    comConexao();
    const segundo = renderHook(() => useWhatsAppStatus('5511999999999'));
    await waitFor(() => expect(segundo.result.current.loading).toBe(false));
    expect(statusCalls()).toBe(2);
  });
});
