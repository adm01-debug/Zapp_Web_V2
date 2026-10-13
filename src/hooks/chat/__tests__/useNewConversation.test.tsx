import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  /** Grafias devolvidas pela busca por variante de telefone. */
  candidates: [] as { id: string; name: string; phone: string | null }[],
  lookupError: null as null | { message: string },
  /** Filtros `.or(...)` montados pelo hook (registra as variantes consultadas). */
  orFilters: [] as string[],
  insertPayloads: [] as Record<string, unknown>[],
  sendOutboundMessage: vi.fn(),
  /** Promessa da Edge Function de avatar (controlada para provar não-bloqueio). */
  avatarPromise: null as null | Promise<unknown>,
  avatarCalls: 0,
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
      select: () => ({
        // usado pelo useEffect de conexões (whatsapp_connections): encadeado com .eq().then
        eq: () => ({
          then: (cb: (v: unknown) => void) => cb({ data: [] }),
        }),
        or: (filter: string) => {
          mocks.orFilters.push(filter);
          return {
            // busca da lista (searchQuery): .or().limit()
            limit: async () => ({ data: [], error: null }),
            // busca de candidatos por variante: .or().order().limit()
            order: () => ({
              limit: async () => ({ data: mocks.candidates, error: mocks.lookupError }),
            }),
          };
        },
      }),
      insert: (payload: Record<string, unknown>) => {
        mocks.insertPayloads.push(payload);
        return {
          select: () => ({
            single: async () => ({
              data: { id: 'novo-id', name: payload.name },
              error: null,
            }),
          }),
        };
      },
    }),
    functions: {
      invoke: () => {
        mocks.avatarCalls += 1;
        return mocks.avatarPromise ?? Promise.resolve({ data: null, error: null });
      },
    },
  },
}));

import { useNewConversation } from '../useNewConversation';

function startSend(
  phone: string,
  name: string,
  onStarted = vi.fn(),
  onClose = vi.fn(),
) {
  const { result } = renderHook(() => useNewConversation(true, onStarted, onClose));
  act(() => {
    result.current.setMode('new');
    result.current.setNewPhone(phone);
    result.current.setNewName(name);
    result.current.setMessageText('Olá');
  });
  return { result, onStarted, onClose };
}

describe('useNewConversation — criação de contato e invalidação de contadores', () => {
  beforeEach(() => {
    mocks.invalidateQueries.mockReset();
    mocks.candidates = [];
    mocks.lookupError = null;
    mocks.orFilters = [];
    mocks.insertPayloads = [];
    mocks.sendOutboundMessage.mockReset();
    mocks.sendOutboundMessage.mockResolvedValue(undefined);
    mocks.avatarPromise = null;
    mocks.avatarCalls = 0;
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  it('cria contato com telefone normalizado, consulta todas as variantes, invalida os contadores e envia a mensagem', async () => {
    const { result, onStarted, onClose } = startSend('(11) 99999-0000', 'Fulano de Teste');

    await act(async () => {
      await result.current.handleSend();
    });

    // payload do insert: telefone canônico (DDD + 9º dígito) + nome + connection null
    expect(mocks.insertPayloads).toHaveLength(1);
    expect(mocks.insertPayloads[0]).toEqual(expect.objectContaining({
      name: 'Fulano de Teste',
      phone: '11999990000',
      whatsapp_connection_id: null,
    }));

    // a checagem de duplicidade consultou as variantes (E.164, 55…, sem o 9º dígito)
    const lookupFilter = mocks.orFilters.find((f) => f.includes('phone.eq.'));
    expect(lookupFilter).toBeTruthy();
    expect(lookupFilter).toContain('phone.eq.11999990000');
    expect(lookupFilter).toContain('phone.eq.1199990000');
    expect(lookupFilter).toContain('phone.eq.5511999990000');

    // invalida as queries agregadas (via invalidateContactsAggregates)
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['contacts-kpi'] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['contacts-type-counts'] });

    // envia a mensagem para o contato criado e fecha o fluxo
    expect(mocks.sendOutboundMessage).toHaveBeenCalledWith(expect.objectContaining({
      contactId: 'novo-id',
      content: 'Olá',
      messageType: 'text',
      whatsappConnectionId: null,
    }));
    expect(onStarted).toHaveBeenCalledWith('novo-id');
    expect(onClose).toHaveBeenCalledOnce();
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });

  it('não cria duplicata quando o contato já existe em variante SEM o nono dígito', async () => {
    // base real guarda 10 dígitos (celular antigo sem o 9) — a variante precisa casar
    mocks.candidates = [{ id: 'existente', name: 'Contato Existente', phone: '1199990000' }];
    const { result, onStarted, onClose } = startSend('(11) 99999-0000', 'Outro Nome');

    await act(async () => {
      await result.current.handleSend();
    });

    expect(mocks.insertPayloads).toHaveLength(0);
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
    expect(mocks.sendOutboundMessage).not.toHaveBeenCalled();
    expect(onStarted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith('Já existe um contato com este número: Contato Existente');
  });

  it('recusa número que não normaliza e não cria contato', async () => {
    const { result } = startSend('123', 'Nome');

    await act(async () => {
      await result.current.handleSend();
    });

    expect(mocks.insertPayloads).toHaveLength(0);
    expect(mocks.sendOutboundMessage).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith('Número de telefone inválido');
  });

  it('não espera o avatar: o envio conclui com a Edge Function de avatar pendente', async () => {
    // promessa que nunca resolve — se o hook a aguardasse, handleSend travaria
    mocks.avatarPromise = new Promise(() => {});
    const { result, onStarted, onClose } = startSend('(11) 99999-0000', 'Fulano');

    await act(async () => {
      await result.current.handleSend();
    });

    expect(mocks.avatarCalls).toBeGreaterThan(0);
    expect(onStarted).toHaveBeenCalledWith('novo-id');
    expect(onClose).toHaveBeenCalledOnce();
    expect(mocks.sendOutboundMessage).toHaveBeenCalledOnce();
  });

  it('falha do envio avisa que o contato FICOU criado (sem órfão silencioso)', async () => {
    mocks.sendOutboundMessage.mockRejectedValue(new Error('sem conexão'));
    const { result, onClose } = startSend('(11) 99999-0000', 'Fulano');

    await act(async () => {
      await result.current.handleSend();
    });

    expect(mocks.insertPayloads).toHaveLength(1);
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Contato "Fulano" criado, mas a mensagem não foi enviada.',
    );
    // o fluxo não fecha como sucesso
    expect(onClose).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
});
