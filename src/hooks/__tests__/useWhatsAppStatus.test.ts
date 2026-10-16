import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useWhatsAppStatus } from '../integrations/useWhatsAppStatus';

// Mocks: um banco falso mínimo que respeita os filtros (`phone`, `id`, `status`),
// para que nenhum teste passe por um mock que devolve sempre a mesma linha.
const h = vi.hoisted(() => {
  const contacts: Array<{ phone: string; name: string | null; whatsapp_connection_id: string | null }> = [];
  const connections: Array<{ id: string; instance_id: string; status: string }> = [];

  type Filter = { column: string; value: unknown; op: 'eq' | 'in' };

  const matches = (rowValue: unknown, filter: Filter) =>
    filter.op === 'in' ? (filter.value as unknown[]).includes(rowValue) : rowValue === filter.value;

  const mockMaybeSingle = vi.fn((query: { table: string; filters: Filter[] }) => {
    const filterValue = (column: string) => query.filters.find((f) => f.column === column)?.value;

    if (query.table === 'contacts') {
      const phoneFilter = query.filters.find((f) => f.column === 'phone');
      const found = phoneFilter
        ? contacts.find((c) => matches(c.phone, phoneFilter)) ?? null
        : null;
      return Promise.resolve({ data: found, error: null });
    }

    if (query.table === 'whatsapp_connections') {
      const id = filterValue('id');
      const status = filterValue('status');
      const row = connections.find(
        (c) => (id === undefined || c.id === id) && (status === undefined || c.status === status),
      ) ?? null;
      return Promise.resolve({ data: row, error: null });
    }

    return Promise.resolve({ data: null, error: null });
  });

  const mockInvoke = vi.fn();
  return { contacts, connections, mockMaybeSingle, mockInvoke };
});

interface QueryChain {
  select: () => QueryChain;
  eq: (column: string, value: unknown) => QueryChain;
  in: (column: string, value: unknown[]) => QueryChain;
  limit: () => QueryChain;
  maybeSingle: () => unknown;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const filters: Array<{ column: string; value: unknown; op: 'eq' | 'in' }> = [];
      const query: QueryChain = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters.push({ column, value, op: 'eq' });
          return query;
        },
        in: (column: string, value: unknown[]) => {
          filters.push({ column, value, op: 'in' });
          return query;
        },
        limit: () => query,
        maybeSingle: () => h.mockMaybeSingle({ table, filters }),
      };
      return query;
    },
    functions: {
      invoke: (...args: unknown[]) => h.mockInvoke(...args),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const seedContact = (phone: string, whatsapp_connection_id: string | null, name: string | null = null) => {
  h.contacts.push({ phone, name, whatsapp_connection_id });
};

const seedConnection = (id: string, instance_id: string, status = 'connected') => {
  h.connections.push({ id, instance_id, status });
};

describe('useWhatsAppStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.contacts.length = 0;
    h.connections.length = 0;
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
    const { result } = renderHook(() => useWhatsAppStatus('5511999999999'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBe('Sem conexão WhatsApp disponível');
    expect(h.mockInvoke).not.toHaveBeenCalled();
  });

  // O contato tem conexao, mas ela nao esta `connected`: antes o hook pegava
  // qualquer conexao conectada; agora isso nao pode acontecer (item 3 do cartao).
  it('does not use a connection that is not connected', async () => {
    seedContact('5511999999999', 'conn1');
    seedConnection('conn1', 'inst1', 'connecting');

    const { result } = renderHook(() => useWhatsAppStatus('5511999999999'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBe('Sem conexão WhatsApp disponível');
    expect(result.current.instanceName).toBeNull();
    expect(h.mockInvoke).not.toHaveBeenCalled();
  });

  // Antes o hook caia numa conexao conectada qualquer quando o contato nao tinha
  // `whatsapp_connection_id`; o item 3 do cartao proibe isso.
  it('does not use a fallback connection when the contact has no whatsapp_connection_id', async () => {
    seedContact('5511999999999', null);
    seedConnection('conn-other', 'inst-other');

    const { result } = renderHook(() => useWhatsAppStatus('5511999999999'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBe('Sem conexão WhatsApp disponível');
    expect(result.current.instanceName).toBeNull();
    expect(h.mockInvoke).not.toHaveBeenCalled();
  });

  // ========== WITH CONNECTION ==========
  it('fetches status and never sends presence when connection exists', async () => {
    seedContact('5511999999999', 'conn1');
    seedConnection('conn1', 'inst1');

    h.mockInvoke.mockResolvedValueOnce({
      data: [{ key: { remoteJid: '5511999999999@s.whatsapp.net', id: 's1' }, message: { conversation: 'Hey' } }],
      error: null,
    });

    const { result } = renderHook(() => useWhatsAppStatus('5511999999999'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // So a leitura do status: abrir os stories nao fala nada para o contato.
    expect(h.mockInvoke).toHaveBeenCalledTimes(1);
    const [functionName] = h.mockInvoke.mock.calls[0] as unknown as [string, unknown];
    expect(functionName).toBe('evolution-api/find-status-messages');
    expect(h.mockInvoke.mock.calls.some(([name]) => String(name).includes('send-chat-presence'))).toBe(false);
  });

  // ========== API ERROR HANDLING ==========
  it('handles API errors gracefully', async () => {
    h.mockMaybeSingle.mockRejectedValueOnce(new Error('DB connection failed'));

    const { result } = renderHook(() => useWhatsAppStatus('5511999999999'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBe('DB connection failed');
  });

  // ========== INITIAL STATE ==========
  it('starts with loading false and empty data', () => {
    const { result } = renderHook(() => useWhatsAppStatus(undefined));
    expect(result.current.statusMessages).toEqual([]);
    // Sem telefone não há presença a carregar (título do cartão: presença
    // não fica carregando para sempre).
    expect(result.current.presence.loading).toBe(false);
  });

  // ========== REFRESH FUNCTION ==========
  it('exposes refresh function', () => {
    const { result } = renderHook(() => useWhatsAppStatus('5511999999999'));
    expect(typeof result.current.refresh).toBe('function');
  });

  // ========== NON-ARRAY RESPONSE ==========
  it('handles non-array status response', async () => {
    seedContact('5511999999999', 'conn1');
    seedConnection('conn1', 'inst1');

    h.mockInvoke.mockResolvedValueOnce({ data: { error: 'not found' }, error: null });

    const { result } = renderHook(() => useWhatsAppStatus('5511999999999'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.statusMessages).toEqual([]);
  });

  // ========== PHONE CLEANING ==========
  it('filters statuses by cleaned phone number', async () => {
    seedContact('5511999999999', 'conn1');
    seedConnection('conn1', 'inst1');

    const statuses = [
      { key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'match' }, message: { conversation: 'Matched' } },
      { key: { remoteJid: '5511888888888@s.whatsapp.net', id: 'no-match' }, message: { conversation: 'Not matched' } },
      { key: { remoteJid: 'status@broadcast', id: 'broadcast' }, message: { conversation: 'Broadcast' } },
    ];

    h.mockInvoke.mockResolvedValueOnce({ data: statuses, error: null });

    const { result } = renderHook(() => useWhatsAppStatus('5511999999999'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    // Should include only the matched phone, exclude non-match and broadcast (no phone match)
    expect(result.current.statusMessages.length).toBe(1);
  });

  // ========== STATUS API FALHOU ==========
  it('handles a failing status call without breaking', async () => {
    seedContact('5511999999999', 'conn1');
    seedConnection('conn1', 'inst1');

    h.mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('Status API down') });

    const { result } = renderHook(() => useWhatsAppStatus('5511999999999'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.statusMessages).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  // ========== CORRIDA / TROCA DE TELEFONE ==========
  it('ignores a late response from the previous phone', async () => {
    seedContact('5511999999999', 'conn-a');
    seedConnection('conn-a', 'inst-a');
    seedContact('5511888888888', 'conn-b');
    seedConnection('conn-b', 'inst-b');

    let resolveOld: (value: { data: unknown; error: null }) => void = () => {};
    const oldResponse = new Promise<{ data: unknown; error: null }>((resolve) => {
      resolveOld = resolve;
    });
    let resolveNew: (value: { data: unknown; error: null }) => void = () => {};
    const newResponse = new Promise<{ data: unknown; error: null }>((resolve) => {
      resolveNew = resolve;
    });

    h.mockInvoke.mockImplementationOnce(() => oldResponse).mockImplementationOnce(() => newResponse);

    const { result, rerender } = renderHook(({ phone }: { phone: string }) => useWhatsAppStatus(phone), {
      initialProps: { phone: '5511999999999' },
    });

    await waitFor(() => expect(h.mockInvoke).toHaveBeenCalledTimes(1));

    rerender({ phone: '5511888888888' });
    await waitFor(() => expect(h.mockInvoke).toHaveBeenCalledTimes(2));

    // A resposta do telefone NOVO chega primeiro...
    await act(async () => {
      resolveNew({
        data: [{ key: { remoteJid: '5511888888888@s.whatsapp.net', id: 'new' }, message: { conversation: 'new' } }],
        error: null,
      });
    });
    await waitFor(() => expect(result.current.statusMessages.map((m) => m.key?.id ?? m.id)).toEqual(['new']));

    // ...e a do telefone ANTIGO, que estava em voo, chega depois e e descartada.
    await act(async () => {
      resolveOld({
        data: [{ key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'old' }, message: { conversation: 'old' } }],
        error: null,
      });
    });

    expect(result.current.statusMessages.map((m) => m.key?.id ?? m.id)).toEqual(['new']);
    expect(result.current.loading).toBe(false);
  });

  it('clears the previous phone status when the phone changes', async () => {
    seedContact('5511999999999', 'conn-a');
    seedConnection('conn-a', 'inst-a');
    seedContact('5511888888888', 'conn-b');
    seedConnection('conn-b', 'inst-b');

    h.mockInvoke
      .mockResolvedValueOnce({
        data: [{ key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'a1' }, message: { conversation: 'a1' } }],
        error: null,
      })
      .mockImplementationOnce(() => new Promise(() => {}));

    const { result, rerender } = renderHook(({ phone }: { phone: string }) => useWhatsAppStatus(phone), {
      initialProps: { phone: '5511999999999' },
    });

    await waitFor(() => expect(result.current.statusMessages.map((m) => m.key?.id ?? m.id)).toEqual(['a1']));

    rerender({ phone: '5511888888888' });

    // O telefone novo ainda esta carregando: o status do anterior sai da tela.
    await waitFor(() => expect(result.current.statusMessages).toEqual([]));
  });

  // ========== NONO DÍGITO NA BUSCA DO CONTATO (item 3 do cartão) ==========
  // A coluna certa na tabela certa é `contacts.phone`: o número pode estar
  // salvo com o 9 e ser buscado sem (ou o inverso) — a mesma linha tem de ser
  // encontrada nos dois sentidos, senão o status some da tela.
  it('finds the contact when stored with the 9th digit but searched without it', async () => {
    seedContact('5511988888888', 'conn1');
    seedConnection('conn1', 'inst1');

    h.mockInvoke.mockResolvedValueOnce({
      data: [{ key: { remoteJid: '551188888888@s.whatsapp.net', id: 's1' }, message: { conversation: 'Hey' } }],
      error: null,
    });

    const { result } = renderHook(() => useWhatsAppStatus('551188888888'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.instanceName).toBe('inst1');
    expect(h.mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('finds the contact when stored without the 9th digit but searched with it', async () => {
    seedContact('551188888888', 'conn1');
    seedConnection('conn1', 'inst1');

    h.mockInvoke.mockResolvedValueOnce({
      data: [{ key: { remoteJid: '5511988888888@s.whatsapp.net', id: 's1' }, message: { conversation: 'Hey' } }],
      error: null,
    });

    const { result } = renderHook(() => useWhatsAppStatus('5511988888888'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.instanceName).toBe('inst1');
    expect(h.mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('finds a contact stored clean when called with a formatted number', async () => {
    seedContact('5511999999999', 'conn1');
    seedConnection('conn1', 'inst1');

    h.mockInvoke.mockResolvedValueOnce({
      data: [{ key: { remoteJid: '5511999999999@s.whatsapp.net', id: 's1' }, message: { conversation: 'Oi' } }],
      error: null,
    });

    const { result } = renderHook(() => useWhatsAppStatus('+55 (11) 99999-9999'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.instanceName).toBe('inst1');
    expect(result.current.statusMessages).toHaveLength(1);
  });

  // ========== PUSHNAME NÃO É IDENTIDADE (item 4 do cartão) ==========
  it('ignores pushName and returns an empty list when only the name matches', async () => {
    seedContact('5511999999999', 'conn1', 'Maria Silva');
    seedConnection('conn1', 'inst1');

    h.mockInvoke.mockResolvedValueOnce({
      data: [
        {
          key: { remoteJid: '5511888888888@s.whatsapp.net', id: 'same-name' },
          pushName: 'Maria Silva',
          message: { conversation: 'Same name, foreign number' },
        },
        {
          key: { remoteJid: '5511777777777@s.whatsapp.net', id: 'stranger' },
          pushName: 'Zé ninguém',
          message: { conversation: 'Not ours' },
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useWhatsAppStatus('5511999999999'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.statusMessages).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  // ========== ERRO 409 DA EDGE VIRA ERRO EXIBIDO (item 4 do cartão) ==========
  it('surfaces the 409 session message as the displayed error', async () => {
    seedContact('5511999999999', 'conn1');
    seedConnection('conn1', 'inst1');

    const apiMessage = 'A sessão do WhatsApp está com credenciais inconsistentes';
    h.mockInvoke.mockResolvedValueOnce({
      data: { error: true, status: 409, message: apiMessage },
      error: null,
    });

    const { result } = renderHook(() => useWhatsAppStatus('5511999999999'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.statusMessages).toEqual([]);
    expect(result.current.error).toBe(apiMessage);
  });

  // ========== PRESENÇA NÃO FICA CARREGANDO PARA SEMPRE (título do cartão) ==========
  it('resets presence loading when there is no connection', async () => {
    const { result } = renderHook(() => useWhatsAppStatus('5511999999999'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Sem conexão WhatsApp disponível');
    expect(result.current.presence).toEqual({ isOnline: false, lastSeen: null, loading: false });
  });

  it('resets presence loading when the fetch fails', async () => {
    h.mockMaybeSingle.mockRejectedValueOnce(new Error('DB connection failed'));

    const { result } = renderHook(() => useWhatsAppStatus('5511999999999'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('DB connection failed');
    expect(result.current.presence).toEqual({ isOnline: false, lastSeen: null, loading: false });
  });
});
