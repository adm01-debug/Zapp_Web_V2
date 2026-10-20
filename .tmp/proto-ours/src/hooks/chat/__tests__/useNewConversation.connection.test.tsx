import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Ordem controlada: a lista de conexões pode ficar RETIDA (held) para provar a
// corrida seleção(250/300ms) x conexões — o teste libera quando quiser.
const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  connections: [] as { id: string; name: string }[],
  holdConnections: false,
  heldConnectionCbs: [] as ((v: unknown) => void)[],
  searchResults: [] as Record<string, unknown>[],
  selectFields: [] as string[],
  insertPayloads: [] as Record<string, unknown>[],
  sendOutboundMessage: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock('@/services/outbound-message.service', () => ({
  sendOutboundMessage: (...args: unknown[]) => mocks.sendOutboundMessage(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: (fields?: string) => {
        if (typeof fields === 'string') mocks.selectFields.push(`${table}:${fields}`);
        return {
          // whatsapp_connections: encadeado com .then pelo efeito de conexões.
          // Quando holdConnections=true, o callback fica retido até o teste liberar.
          eq: () => ({
            then: (cb: (v: unknown) => void) => {
              if (mocks.holdConnections) {
                mocks.heldConnectionCbs.push(cb);
                return Promise.resolve();
              }
              return Promise.resolve(cb({ data: mocks.connections, error: null }));
            },
            maybeSingle: async () => ({ data: null, error: null }),
          }),
          // busca de contatos existentes: .or().limit()
          or: () => ({
            limit: async () => ({ data: mocks.searchResults, error: null }),
          }),
        };
      },
      insert: (payload: Record<string, unknown>) => {
        mocks.insertPayloads.push(payload);
        return {
          select: () => ({ single: async () => ({ data: { id: 'novo-id' }, error: null }) }),
        };
      },
    }),
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}));

import { useNewConversation } from '../useNewConversation';

type Hook = ReturnType<typeof useNewConversation>;

async function liberarConexoes() {
  const cbs = [...mocks.heldConnectionCbs];
  mocks.heldConnectionCbs = [];
  await act(async () => {
    for (const cb of cbs) cb({ data: mocks.connections, error: null });
  });
}

function contato(id: string, connectionId: string | null) {
  return {
    id,
    name: `Contato ${id}`,
    phone: `+55119999${id}`,
    avatar_url: null,
    whatsapp_connection_id: connectionId,
  };
}

describe('useNewConversation — conexão do contato existente (PK-22 refazer)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.invalidateQueries.mockReset();
    mocks.connections = [];
    mocks.holdConnections = false;
    mocks.heldConnectionCbs = [];
    mocks.searchResults = [];
    mocks.selectFields = [];
    mocks.insertPayloads = [];
    mocks.sendOutboundMessage.mockReset();
    mocks.sendOutboundMessage.mockResolvedValue(undefined);
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('P1: abre sem warning do React e expõe a conexão efetiva sem efeito colateral no seletor', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.connections = [{ id: 'conn-a', name: 'Número A' }];
    const { result } = renderHook(() => useNewConversation(true, vi.fn(), vi.fn()));
    await act(async () => {});

    // Sem setState síncrono no corpo do efeito: nenhum warning do React ao abrir.
    const warnings = consoleError.mock.calls.flat().join('\n');
    expect(warnings).not.toMatch(/flushSync|Cannot update a component|setState/i);
    expect(result.current.connections).toEqual([{ id: 'conn-a', name: 'Número A' }]);

    // A busca traz a coluna da conexão do contato (RLS/tipos: mesma tabela contacts).
    act(() => { result.current.setSearchQuery('Contato'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(mocks.selectFields.some((f) => f.includes('whatsapp_connection_id'))).toBe(true);

    // O hook expõe a conexão efetiva (contato vence o seletor) sem trocar o seletor.
    act(() => { result.current.setSelectedContact(contato('c1', 'conn-a')); });
    expect(result.current.effectiveConnectionId).toBe('conn-a');
    expect(result.current.selectedConnection).toBe('conn-a');

    consoleError.mockRestore();
  });

  it('P2: corrida — contato escolhido antes das conexões carregar envia pela conexão do contato', async () => {
    mocks.holdConnections = true;
    mocks.connections = [{ id: 'conn-tela', name: 'Tela' }];
    const { result } = renderHook(() => useNewConversation(true, vi.fn(), vi.fn()));
    await act(async () => {});

    // Seleção acontece com a lista ainda vazia (corrida): o clique NÃO usa
    // connections[0] do momento — o seletor da sessão fica intacto.
    const c: Hook['selectedContact'] = contato('c2', 'conn-contato');
    act(() => { result.current.setSelectedContact(c); });
    expect(result.current.selectedConnection).toBe('');

    // A lista carrega DEPOIS da seleção com outra conexão como padrão da tela.
    mocks.connections = [
      { id: 'conn-tela', name: 'Tela' },
      { id: 'conn-contato', name: 'Contato' },
    ];
    await liberarConexoes();
    expect(result.current.selectedConnection).toBe('conn-tela');

    act(() => { result.current.setMessageText('Olá'); });
    await act(async () => { await result.current.handleSend(); });

    // Reaplicado no handleSend: a conexão do contato vence o seletor da tela.
    expect(mocks.sendOutboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: 'c2', whatsappConnectionId: 'conn-contato' }),
    );
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });

  it('P2b: contato sem conexão usa o seletor da sessão no envio (sem fallback do clique)', async () => {
    mocks.holdConnections = true;
    const { result } = renderHook(() => useNewConversation(true, vi.fn(), vi.fn()));
    await act(async () => {});

    act(() => { result.current.setSelectedContact(contato('c3', null)); });
    expect(result.current.selectedConnection).toBe('');

    mocks.connections = [{ id: 'conn-a', name: 'A' }];
    await liberarConexoes();

    act(() => { result.current.setMessageText('Oi'); });
    await act(async () => { await result.current.handleSend(); });

    expect(mocks.sendOutboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: 'c3', whatsappConnectionId: 'conn-a' }),
    );
  });

  it('P3: trocar de contato preserva o seletor; conexão do contato caída bloqueia com aviso e não envia', async () => {
    mocks.connections = [
      { id: 'conn-a', name: 'A' },
      { id: 'conn-b', name: 'B' },
    ];
    const { result } = renderHook(() => useNewConversation(true, vi.fn(), vi.fn()));
    await act(async () => {});
    expect(result.current.selectedConnection).toBe('conn-a');

    // O usuário escolheu a conexão B na sessão; trocar de contato NÃO mexe nela.
    act(() => { result.current.setSelectedConnection('conn-b'); });
    act(() => { result.current.setSelectedContact(contato('c4', 'conn-caida')); });
    expect(result.current.selectedConnection).toBe('conn-b');
    // ...mas a efetiva é a do contato (o seletor não troca de número sozinho).
    expect(result.current.effectiveConnectionId).toBe('conn-caida');

    act(() => { result.current.setMessageText('Olá'); });
    await act(async () => { await result.current.handleSend(); });

    // Conexão do contato fora da lista de conectadas: avisa e NÃO envia nem
    // cai para outra conexão (erro 463 do WhatsApp se mandasse por outra).
    expect(mocks.toastError).toHaveBeenCalledWith(
      'A conexão deste contato está desconectada. Reconecte o número para enviar por ele.',
    );
    expect(mocks.sendOutboundMessage).not.toHaveBeenCalled();
  });

  it('P3c: seletor trocado para B depois de escolher contato com conexão A — envio e efetiva continuam A', async () => {
    mocks.connections = [
      { id: 'conn-a', name: 'A' },
      { id: 'conn-b', name: 'B' },
    ];
    const { result } = renderHook(() => useNewConversation(true, vi.fn(), vi.fn()));
    await act(async () => {});

    act(() => { result.current.setSelectedContact(contato('c5', 'conn-a')); });
    // Tentativa de trocar o número no seletor depois de escolher o contato.
    act(() => { result.current.setSelectedConnection('conn-b'); });

    // O seletor da sessão mostra B, mas a efetiva (exibida) continua A...
    expect(result.current.selectedConnection).toBe('conn-b');
    expect(result.current.effectiveConnectionId).toBe('conn-a');

    act(() => { result.current.setMessageText('Olá'); });
    await act(async () => { await result.current.handleSend(); });

    // ...e o envio sai pela conexão do contato, não pela do seletor.
    expect(mocks.sendOutboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: 'c5', whatsappConnectionId: 'conn-a' }),
    );
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });

  it('P3b: modo novo contato envia pela conexão da sessão', async () => {
    mocks.connections = [{ id: 'conn-a', name: 'A' }];
    const { result } = renderHook(() => useNewConversation(true, vi.fn(), vi.fn()));
    await act(async () => {});

    act(() => {
      result.current.setMode('new');
      result.current.setNewPhone('11988887777');
      result.current.setNewName('Novo');
      result.current.setMessageText('Boas-vindas');
    });
    await act(async () => { await result.current.handleSend(); });

    expect(mocks.insertPayloads).toHaveLength(1);
    expect(mocks.insertPayloads[0]).toEqual(
      expect.objectContaining({ phone: '11988887777', whatsapp_connection_id: 'conn-a' }),
    );
    expect(mocks.sendOutboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: 'novo-id', whatsappConnectionId: 'conn-a' }),
    );
  });
});
