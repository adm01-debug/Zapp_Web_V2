/**
 * R2-INB-029 — adiar conversa precisa ter efeito operacional e retomada na Inbox.
 *
 * `useConversationActions.snoozeConversation` grava `conversation_snoozes` e expõe
 * `snoozedIds`/`isSnoozed`, mas a lista ativa da Inbox (`useInboxFilters.filteredConversations`,
 * renderizada pela sidebar) não consumia esse estado: adiar confirmava o toast e a conversa
 * continuava na listagem, sem retomada quando o prazo expirava.
 *
 * Este teste compõe os dois hooks reais como a Inbox compõe (a lista recebe `snoozedIds` da
 * ação) e prova o efeito imediatamente após adiar e a retomada após o prazo — lendo o número
 * do código de produção, não de um fixture.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

// O hook consulta uma flag de feature (que exige AuthProvider); aqui ela não importa.
vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: () => false }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/undoToast', () => ({ undoToast: vi.fn() }));

function resultChain(result: Record<string, unknown>) {
  const obj: Record<string, unknown> = {};
  obj.eq = vi.fn(() => obj);
  obj.gt = vi.fn(() => obj);
  obj.order = vi.fn(() => obj);
  obj.single = vi.fn(() => obj);
  obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

const PROFILE_ID = 'profile-1';
let snoozeRows: Array<{ contact_id: string; snooze_until: string }> = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return { select: vi.fn(() => resultChain({ data: { id: 'profile-1' }, error: null })) };
      }
      if (table === 'conversation_snoozes') {
        return {
          select: vi.fn(() => resultChain({ data: snoozeRows, error: null })),
          delete: vi.fn(() => resultChain({ error: null })),
          insert: vi.fn(() => resultChain({ error: null })),
        };
      }
      if (table === 'pinned_conversations') {
        return {
          select: vi.fn(() => resultChain({ data: [], error: null })),
          insert: vi.fn(() => resultChain({ error: null })),
          delete: vi.fn(() => resultChain({ error: null })),
        };
      }
      if (table === 'favorite_contacts') {
        return {
          select: vi.fn(() => resultChain({ data: [], error: null })),
          insert: vi.fn(() => resultChain({ error: null })),
          delete: vi.fn(() => resultChain({ error: null })),
        };
      }
      return { select: vi.fn(() => resultChain({ data: [], error: null })) };
    }),
  },
}));

import { useConversationActions } from '@/hooks/chat/useConversationActions';
import { useInboxFilters } from '@/hooks/inbox/useInboxFilters';

const conversa = (id: string) => ({
  id,
  unreadCount: 0,
  messages: [{ id: `m-${id}` }],
  lastMessage: { id: `m-${id}`, created_at: '2026-09-24T12:00:00.000Z' },
  contact: {
    id,
    name: `Contato ${id}`,
    phone: '5511999999999',
    email: null,
    created_at: '2026-09-24T12:00:00.000Z',
    updated_at: '2026-09-24T12:00:00.000Z',
    assigned_to: PROFILE_ID,
    conversation_status: 'open',
    tags: [],
    queue_id: null,
  },
});

const conversations = [conversa('a'), conversa('b')] as never;

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

// Monta os dois hooks como a Inbox os compõe: a lista recebe o estado de adiamento da ação.
function renderInbox() {
  return renderHook(
    () => {
      const actions = useConversationActions();
      const filters = useInboxFilters({
        conversations,
        profileId: PROFILE_ID,
        snoozedIds: actions.snoozedIds,
      });
      return { actions, filters };
    },
    { wrapper },
  );
}

const idsNaLista = (r: { current: { filters: { filteredConversations: Array<{ contact: { id: string } }> } } }) =>
  r.current.filters.filteredConversations.map((c) => c.contact.id).sort();

describe('useInboxFilters — consumo do adiamento (R2-INB-029)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snoozeRows = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sai da lista ao adiar e volta sozinha quando o prazo expira', async () => {
    const { result } = renderInbox();
    await waitFor(() => expect(result.current.actions.profileId).toBe(PROFILE_ID));

    // Antes de adiar: as duas conversas estão na lista ativa.
    expect(idsNaLista(result)).toEqual(['a', 'b']);

    // Congela o relógio só depois do profileId carregar (waitFor usa timers reais).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T12:00:00.000Z'));

    await act(async () => {
      await result.current.actions.snoozeConversation('a', '1h');
    });

    // Efeito operacional imediato: a conversa adiada sai da listagem.
    expect(idsNaLista(result)).toEqual(['b']);

    // Retomada: passado o prazo, volta à lista sem recarregar nada.
    await act(async () => {
      vi.advanceTimersByTime(60 * 60 * 1000 + 2000);
    });

    expect(idsNaLista(result)).toEqual(['a', 'b']);
  });
});
