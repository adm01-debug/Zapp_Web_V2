import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { ConversationContact } from '@/types/chat';

// --- mocks ---------------------------------------------------------------

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  profilesEq: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  useAuth: vi.fn(),
  useUserRole: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: h.toast }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => h.useAuth(),
}));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => h.useUserRole(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => h.rpc(...args),
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: (...a: unknown[]) => ({ maybeSingle: () => h.profilesEq(...a) }) }) };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
  },
}));

import {
  useConversationTicketActions,
  translateTicketActionError,
} from '../useConversationTicketActions';

// --- helpers -------------------------------------------------------------

const CONTACT_ID = 'contact-1';
const MY_PROFILE = 'profile-me';

function makeContact(overrides: Partial<ConversationContact> = {}): ConversationContact {
  return {
    id: CONTACT_ID,
    name: 'Contato Teste',
    phone: '5511999999999',
    assigned_to: null,
    conversation_status: 'waiting',
    queue_id: 'queue-1',
    ...overrides,
  } as ConversationContact;
}

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function mount(contact: ConversationContact) {
  return renderHook(
    ({ c }: { c: ConversationContact }) => useConversationTicketActions(c),
    { initialProps: { c: contact }, wrapper: createWrapper() },
  );
}

const rpcOk = (payload: Record<string, unknown>) => ({ data: { ok: true, ...payload }, error: null });
const rpcErr = (message: string) => ({ data: null, error: { message } });

beforeEach(() => {
  vi.clearAllMocks();
  h.useAuth.mockReturnValue({ profile: { id: MY_PROFILE, name: 'Hugo Atendente' } });
  h.useUserRole.mockReturnValue({ isAdmin: false, isSupervisor: false });
  h.profilesEq.mockResolvedValue({ data: { name: 'Outro Atendente' }, error: null });
});

// --- mutacoes ------------------------------------------------------------

describe('useConversationTicketActions — assumir', () => {
  it('atualiza o contato de forma otimista e confirma com a RPC', async () => {
    h.rpc.mockResolvedValue(rpcOk({ assigned_to: MY_PROFILE, conversation_status: 'open' }));

    const contact = makeContact({ assigned_to: null, conversation_status: 'waiting' });
    const { result } = mount(contact);

    await act(async () => {
      await result.current.assume();
    });

    expect(h.rpc).toHaveBeenCalledWith('assume_conversation', { p_contact_id: CONTACT_ID });
    // otimista: enquanto o servidor nao devolve, a UI ja mostra "Em atendimento"
    await waitFor(() => expect(result.current.assignedTo).toBe(MY_PROFILE));
    expect(result.current.conversationStatus).toBe('open');
    expect(result.current.statusLabel).toBe('Em atendimento por Hugo Atendente');
    expect(h.toast.success).toHaveBeenCalledWith('Conversa assumida');
  });

  it('volta atras quando a RPC falha (rollback do estado otimista)', async () => {
    h.rpc.mockResolvedValue(rpcErr('not_authorized'));

    const contact = makeContact({ assigned_to: null, conversation_status: 'waiting' });
    const { result } = mount(contact);

    await act(async () => {
      await expect(result.current.assume()).rejects.toBeTruthy();
    });

    // sem responsavel de novo, e o erro veio traduzido
    expect(result.current.assignedTo).toBeNull();
    expect(result.current.conversationStatus).toBe('waiting');
    expect(h.toast.error).toHaveBeenCalledWith(
      'Você não tem permissão para esta ação nesta conversa.',
    );
    expect(h.toast.success).not.toHaveBeenCalled();
  });

  it('solta o valor otimista quando o realtime traz o novo responsavel', async () => {
    h.rpc.mockResolvedValue(rpcOk({ assigned_to: MY_PROFILE, conversation_status: 'open' }));

    const { result, rerender } = mount(makeContact({ assigned_to: null, conversation_status: 'waiting' }));

    await act(async () => {
      await result.current.assume();
    });
    expect(result.current.assignedTo).toBe(MY_PROFILE);

    // outro atendente assume antes: o realtime atualiza as props
    rerender({ c: makeContact({ assigned_to: 'profile-other', conversation_status: 'open' }) });

    await waitFor(() => expect(result.current.assignedTo).toBe('profile-other'));
    await waitFor(() =>
      expect(result.current.statusLabel).toBe('Em atendimento por Outro Atendente'),
    );
  });

  it('emite o evento da lista in-memory para refletir o status sem recarregar', async () => {
    h.rpc.mockResolvedValue(rpcOk({ assigned_to: MY_PROFILE, conversation_status: 'open' }));

    const listener = vi.fn();
    window.addEventListener('zapp:contact-status-changed', listener);
    try {
      const { result } = mount(makeContact({ assigned_to: null, conversation_status: 'waiting' }));
      await act(async () => {
        await result.current.assume();
      });

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0] as CustomEvent<{ contactId: string; status: string }>;
      expect(event.detail).toEqual({ contactId: CONTACT_ID, status: 'open' });
    } finally {
      window.removeEventListener('zapp:contact-status-changed', listener);
    }
  });
});

describe('useConversationTicketActions — devolver a fila', () => {
  it('devolve a conversa e volta para "Na fila"', async () => {
    h.rpc.mockResolvedValue(rpcOk({ assigned_to: null, conversation_status: 'waiting' }));

    const contact = makeContact({ assigned_to: MY_PROFILE, conversation_status: 'open' });
    const { result } = mount(contact);

    await act(async () => {
      await result.current.returnToQueue('sem necessidade de atendimento');
    });

    expect(h.rpc).toHaveBeenCalledWith('return_conversation_to_queue', {
      p_contact_id: CONTACT_ID,
      p_reason: 'sem necessidade de atendimento',
    });
    await waitFor(() => expect(result.current.assignedTo).toBeNull());
    expect(result.current.statusLabel).toBe('Na fila');
    expect(h.toast.success).toHaveBeenCalledWith('Conversa devolvida para a fila');
  });

  it('volta atras quando a devolucao falha', async () => {
    h.rpc.mockResolvedValue(rpcErr('concurrent_update'));

    const contact = makeContact({ assigned_to: MY_PROFILE, conversation_status: 'open' });
    const { result } = mount(contact);

    await act(async () => {
      await expect(result.current.returnToQueue()).rejects.toBeTruthy();
    });

    expect(result.current.assignedTo).toBe(MY_PROFILE);
    expect(result.current.conversationStatus).toBe('open');
    expect(h.toast.error).toHaveBeenCalledWith(
      'A conversa mudou enquanto você agia. Tente novamente.',
    );
  });
});

// --- permissoes derivadas ------------------------------------------------

describe('useConversationTicketActions — canAssume/canReturn por papel', () => {
  it('sem responsavel: qualquer agente pode assumir; ninguem devolve a fila', () => {
    const { result } = mount(makeContact({ assigned_to: null, conversation_status: 'waiting' }));
    expect(result.current.canAssume).toBe(true);
    expect(result.current.canReturn).toBe(false);
  });

  it('responsavel sou eu: posso devolver a fila, nao preciso assumir', () => {
    const { result } = mount(makeContact({ assigned_to: MY_PROFILE, conversation_status: 'open' }));
    expect(result.current.canAssume).toBe(false);
    expect(result.current.canReturn).toBe(true);
  });

  it('responsavel e de terceiro: agente nao pode nem assumir nem devolver', () => {
    const { result } = mount(makeContact({ assigned_to: 'profile-other', conversation_status: 'open' }));
    expect(result.current.canAssume).toBe(false);
    expect(result.current.canReturn).toBe(false);
  });

  it('responsavel e de terceiro: supervisor assume por cima e devolve a fila', () => {
    h.useUserRole.mockReturnValue({ isAdmin: false, isSupervisor: true });
    const { result } = mount(makeContact({ assigned_to: 'profile-other', conversation_status: 'open' }));
    expect(result.current.canAssume).toBe(true);
    expect(result.current.canReturn).toBe(true);
  });

  it('responsavel e de terceiro: admin assume por cima e devolve a fila', () => {
    h.useUserRole.mockReturnValue({ isAdmin: true, isSupervisor: false });
    const { result } = mount(makeContact({ assigned_to: 'profile-other', conversation_status: 'open' }));
    expect(result.current.canAssume).toBe(true);
    expect(result.current.canReturn).toBe(true);
  });

  it('conversa encerrada: nao pode assumir nem devolver', () => {
    h.useUserRole.mockReturnValue({ isAdmin: true, isSupervisor: true });
    const { result } = mount(makeContact({ assigned_to: MY_PROFILE, conversation_status: 'resolved' }));
    expect(result.current.canAssume).toBe(false);
    expect(result.current.canReturn).toBe(false);
    expect(result.current.statusLabel).toBe('Encerrada');
  });
});

// --- rotulos e erros -----------------------------------------------------

describe('useConversationTicketActions — rotulo de estado', () => {
  it('open sem responsavel mostra "Aberta"', () => {
    const { result } = mount(makeContact({ assigned_to: null, conversation_status: 'open' }));
    expect(result.current.statusLabel).toBe('Aberta');
  });

  it('responsavel de terceiro resolve o nome em profiles', async () => {
    const { result } = mount(makeContact({ assigned_to: 'profile-other', conversation_status: 'open' }));
    await waitFor(() =>
      expect(result.current.statusLabel).toBe('Em atendimento por Outro Atendente'),
    );
  });
});

describe('translateTicketActionError', () => {
  it('traduz cada token conhecido e cai no generico para o desconhecido', () => {
    expect(translateTicketActionError('already_assigned')).toBe('Outro atendente já assumiu esta conversa.');
    expect(translateTicketActionError('concurrent_assignment')).toBe(
      'Outro atendente assumiu esta conversa antes de você.',
    );
    expect(translateTicketActionError('conversation_not_active')).toBe(
      'Esta conversa já foi encerrada e não pode ser alterada.',
    );
    expect(translateTicketActionError('algum_erro_novo')).toBe(
      'Não foi possível concluir a ação. Tente novamente.',
    );
    expect(translateTicketActionError(null)).toBe(
      'Não foi possível concluir a ação. Tente novamente.',
    );
  });
});
