/**
 * Contato fora da lista (notificação, busca, link) — a ponte do Inbox consultava
 * `contacts` quando o contato selecionado não estava na lista e, em erro, só fazia
 * `log.error` e retornava: a área de chat ficava vazia e muda. Também não havia guarda
 * de UUID: um id malformado ia direto ao banco e virava "sem resultado" indistinguível
 * de contato sem acesso.
 *
 * O contrato aqui: id inválido nunca chega ao banco (vira 'not-found'), falha de
 * transporte publica 'error' com motivo, contato inexistente/sem acesso publica
 * 'not-found', e o sucesso publica a conversa de fallback com status 'idle'.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const UUID_VALIDO = '11111111-1111-1111-1111-111111111111';

const h = vi.hoisted(() => ({
  selectedContactId: '' as string | null,
  from: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('@/hooks/inbox/useInboxUIState', () => ({
  useInboxUIState: () => ({
    selectedContactId: h.selectedContactId,
    setSelectedContactId: vi.fn(),
    soundOn: true,
    setSoundOn: vi.fn(),
    setPendingContactId: vi.fn(),
  }),
}));
vi.mock('@/hooks/chat/useRealtimeMessages', () => ({
  useRealtimeMessages: () => ({
    conversations: [],
    loading: false,
    error: null,
    sendMessage: vi.fn(),
    markAsRead: vi.fn(),
    refetch: vi.fn(),
    newMessageNotification: null,
    dismissNotification: vi.fn(),
    setSelectedContact: vi.fn(),
    setSoundEnabled: vi.fn(),
  }),
}));
vi.mock('@/hooks/integrations/useExternalEvolution', () => ({
  useExternalConversations: () => ({ conversations: [], loading: false, error: null, refetch: vi.fn() }),
  useExternalMessages: () => ({ messages: [], loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/hooks/system/useOfflineCache', () => ({
  useOfflineCache: () => ({ conversations: [], usingCache: false }),
}));
vi.mock('@/hooks/chat/useMessages', () => ({
  useMessages: () => ({
    messages: [], loading: false, error: null, refetch: vi.fn(),
    hasOlder: false, loadingOlder: false, loadOlderMessages: vi.fn(),
  }),
}));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: h.from } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useRealtimeInbox } from '@/hooks/inbox/useRealtimeInbox';

beforeEach(() => {
  vi.clearAllMocks();
  h.selectedContactId = UUID_VALIDO;
  h.from.mockImplementation(() => ({
    select: () => ({ eq: () => ({ maybeSingle: h.maybeSingle }) }),
  }));
});

describe('useRealtimeInbox — contato fora da lista (guarda de UUID e estado de erro)', () => {
  it('id que não é UUID não vai ao banco e vira "não encontrado"', async () => {
    h.selectedContactId = 'nao-e-um-uuid';

    const { result } = renderHook(() => useRealtimeInbox());

    await waitFor(() => expect(result.current.selectedContactFallbackStatus).toBe('not-found'));
    expect(h.from).not.toHaveBeenCalled();
  });

  it('falha de transporte publica erro com motivo em vez de tela vazia', async () => {
    h.maybeSingle.mockResolvedValue({ data: null, error: { message: 'rede fora' } });

    const { result } = renderHook(() => useRealtimeInbox());

    await waitFor(() => expect(result.current.selectedContactFallbackStatus).toBe('error'));
    expect(result.current.selectedContactFallbackError).toBe('Não foi possível carregar o contato.');
  });

  it('contato inexistente ou sem acesso (zero linhas, sem erro) vira "não encontrado"', async () => {
    h.maybeSingle.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useRealtimeInbox());

    await waitFor(() => expect(result.current.selectedContactFallbackStatus).toBe('not-found'));
    expect(result.current.selectedContactFallbackError).toBeNull();
  });

  it('sucesso publica a conversa de fallback e volta ao estado idle', async () => {
    h.maybeSingle.mockResolvedValue({ data: { id: UUID_VALIDO, name: 'Fulano' }, error: null });

    const { result } = renderHook(() => useRealtimeInbox());

    await waitFor(() => expect(result.current.legacyConversation).not.toBeNull());
    expect(result.current.legacyConversation?.contact.id).toBe(UUID_VALIDO);
    expect(result.current.selectedContactFallbackStatus).toBe('idle');
  });
});
