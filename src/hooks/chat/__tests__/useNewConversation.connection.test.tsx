import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  connections: [] as { id: string; name: string }[],
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
    from: () => ({
      select: (fields?: string) => {
        if (typeof fields === 'string') mocks.selectFields.push(fields);
        return {
          // whatsapp_connections: encadeado com .then pelo efeito de conexões
          // contacts (duplicidade por telefone): .maybeSingle()
          eq: () => ({
            then: (cb: (v: unknown) => void) => cb({ data: mocks.connections, error: null }),
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

async function buscar(result: { current: ReturnType<typeof useNewConversation> }, termo: string) {
  act(() => { result.current.setSearchQuery(termo); });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}

describe('useNewConversation — conexão de um contato existente', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.invalidateQueries.mockReset();
    mocks.connections = [];
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

  it('envia pela conexão do PRÓPRIO contato, não pela conexão padrão da tela', async () => {
    // duas conexões conectadas; a tela mostra "B" como padrão (primeira da lista)
    mocks.connections = [{ id: 'conexao-b', name: 'Conexão B' }, { id: 'conexao-a', name: 'Conexão A' }];
    // o contato procurado chegou por "A" (é a conexão dele)
    mocks.searchResults = [
      { id: 'contato-1', name: 'Ana', phone: '5511999990000', avatar_url: null, whatsapp_connection_id: 'conexao-a' },
    ];

    const { result } = renderHook(() => useNewConversation(true, vi.fn(), vi.fn()));
    await act(async () => {});
    expect(result.current.selectedConnection).toBe('conexao-b');

    await buscar(result, 'Ana');
    expect(result.current.contacts).toHaveLength(1);

    act(() => {
      result.current.setSelectedContact(result.current.contacts[0]);
      result.current.setMessageText('Olá');
    });
    await act(async () => { await result.current.handleSend(); });

    // a conexão do contato vence o seletor da tela (evita o erro 463)
    expect(mocks.sendOutboundMessage).toHaveBeenCalledWith(expect.objectContaining({
      contactId: 'contato-1',
      whatsappConnectionId: 'conexao-a',
    }));
    // e o seletor passa a MOSTRAR de qual número a mensagem sai
    expect(result.current.selectedConnection).toBe('conexao-a');
    // a busca precisa TRAZER a conexão do contato, senão a escolha não tem de onde sair
    expect(mocks.selectFields).toContain('id, name, phone, avatar_url, whatsapp_connection_id');
  });

  it('avisa e não troca de número quando a conexão do contato está desconectada', async () => {
    // só "B" está conectada; o contato chegou por "X", que caiu
    mocks.connections = [{ id: 'conexao-b', name: 'Conexão B' }];
    mocks.searchResults = [
      { id: 'contato-3', name: 'Carla', phone: '5511777770000', avatar_url: null, whatsapp_connection_id: 'conexao-x' },
    ];

    const { result } = renderHook(() => useNewConversation(true, vi.fn(), vi.fn()));
    await act(async () => {});

    await buscar(result, 'Carla');
    act(() => {
      result.current.setSelectedContact(result.current.contacts[0]);
      result.current.setMessageText('Olá');
    });
    await act(async () => { await result.current.handleSend(); });

    // nenhum envio por outro número; aviso explícito e compositor liberado
    expect(mocks.sendOutboundMessage).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      'A conexão deste contato está desconectada. Reconecte o número para enviar por ele.',
    );
    expect(result.current.isSending).toBe(false);
  });

  it('mantém a conexão padrão quando o contato existente não tem conexão própria', async () => {
    mocks.connections = [{ id: 'conexao-b', name: 'Conexão B' }];
    mocks.searchResults = [
      { id: 'contato-2', name: 'Bruno', phone: '5511888880000', avatar_url: null, whatsapp_connection_id: null },
    ];

    const { result } = renderHook(() => useNewConversation(true, vi.fn(), vi.fn()));
    await act(async () => {});

    await buscar(result, 'Bruno');
    act(() => {
      result.current.setSelectedContact(result.current.contacts[0]);
      result.current.setMessageText('Olá');
    });
    await act(async () => { await result.current.handleSend(); });

    expect(mocks.sendOutboundMessage).toHaveBeenCalledWith(expect.objectContaining({
      contactId: 'contato-2',
      whatsappConnectionId: 'conexao-b',
    }));
    // sem conexão própria, o seletor segue na padrão da tela — nenhuma troca silenciosa
    expect(result.current.selectedConnection).toBe('conexao-b');
  });

  it('usa a conexão escolhida na tela para um contato novo', async () => {
    mocks.connections = [{ id: 'conexao-b', name: 'Conexão B' }];

    const { result } = renderHook(() => useNewConversation(true, vi.fn(), vi.fn()));
    await act(async () => {});
    expect(result.current.selectedConnection).toBe('conexao-b');

    act(() => {
      result.current.setMode('new');
      result.current.setSelectedConnection('conexao-a'); // usuário troca para A
      result.current.setNewPhone('(11) 91111-2222');
      result.current.setNewName('Novo Contato');
      result.current.setMessageText('Olá');
    });
    await act(async () => { await result.current.handleSend(); });

    // o contato nasce na conexão escolhida e a mensagem sai por ela
    expect(mocks.insertPayloads[0]).toEqual(expect.objectContaining({
      name: 'Novo Contato',
      phone: '11911112222',
      whatsapp_connection_id: 'conexao-a',
    }));
    expect(mocks.sendOutboundMessage).toHaveBeenCalledWith(expect.objectContaining({
      contactId: 'novo-id',
      whatsappConnectionId: 'conexao-a',
    }));
  });

  it('trava o seletor no número do contato: trocar para B é ignorado com aviso e o envio sai por A', async () => {
    mocks.connections = [{ id: 'conexao-b', name: 'Conexão B' }, { id: 'conexao-a', name: 'Conexão A' }];
    mocks.searchResults = [
      { id: 'contato-1', name: 'Ana', phone: '5511999990000', avatar_url: null, whatsapp_connection_id: 'conexao-a' },
    ];

    const { result } = renderHook(() => useNewConversation(true, vi.fn(), vi.fn()));
    await act(async () => {});

    await buscar(result, 'Ana');
    act(() => {
      result.current.setSelectedContact(result.current.contacts[0]);
    });
    expect(result.current.selectedConnection).toBe('conexao-a');
    expect(result.current.connectionLocked).toBe(true);

    // usuário tenta trocar o seletor para B depois de escolher o contato
    act(() => {
      result.current.setSelectedConnection('conexao-b');
    });

    // a troca é ignorada: a tela continua mostrando A (nunca B sem avisar)
    expect(result.current.selectedConnection).toBe('conexao-a');
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Este contato já tem um número próprio. A mensagem sai por ele.',
    );

    act(() => {
      result.current.setMessageText('Olá');
    });
    await act(async () => { await result.current.handleSend(); });

    expect(mocks.sendOutboundMessage).toHaveBeenCalledWith(expect.objectContaining({
      contactId: 'contato-1',
      whatsappConnectionId: 'conexao-a',
    }));
  });

  it('desselecionar restaura a escolha anterior em vez de voltar a connections[0]', async () => {
    mocks.connections = [{ id: 'conexao-b', name: 'Conexão B' }, { id: 'conexao-c', name: 'Conexão C' }];
    mocks.searchResults = [
      { id: 'contato-1', name: 'Ana', phone: '5511999990000', avatar_url: null, whatsapp_connection_id: 'conexao-a' },
    ];

    const { result } = renderHook(() => useNewConversation(true, vi.fn(), vi.fn()));
    await act(async () => {});
    expect(result.current.selectedConnection).toBe('conexao-b');

    // usuário escolhe C antes de selecionar qualquer contato
    act(() => {
      result.current.setSelectedConnection('conexao-c');
    });
    expect(result.current.selectedConnection).toBe('conexao-c');

    // ao escolher o contato travado, o seletor vai a A…
    await buscar(result, 'Ana');
    act(() => {
      result.current.setSelectedContact(result.current.contacts[0]);
    });
    expect(result.current.selectedConnection).toBe('conexao-a');

    // …e ao desselecionar volta a C (a escolha anterior), não a B (connections[0])
    act(() => {
      result.current.setSelectedContact(null);
    });
    expect(result.current.selectedConnection).toBe('conexao-c');
    expect(result.current.connectionLocked).toBe(false);
  });

  it('contato sem conexão própria não sobrescreve a escolha da tela', async () => {
    mocks.connections = [{ id: 'conexao-b', name: 'Conexão B' }, { id: 'conexao-c', name: 'Conexão C' }];
    mocks.searchResults = [
      { id: 'contato-2', name: 'Bruno', phone: '5511888880000', avatar_url: null, whatsapp_connection_id: null },
    ];

    const { result } = renderHook(() => useNewConversation(true, vi.fn(), vi.fn()));
    await act(async () => {});

    act(() => {
      result.current.setSelectedConnection('conexao-c');
    });

    await buscar(result, 'Bruno');
    act(() => {
      result.current.setSelectedContact(result.current.contacts[0]);
    });

    // sem conexão própria, o seletor preserva a escolha do usuário (C)
    expect(result.current.selectedConnection).toBe('conexao-c');
    expect(result.current.connectionLocked).toBe(false);
  });
});
