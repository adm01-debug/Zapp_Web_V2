/**
 * SL-071 (ADR-005, passo 3) — a lista da Inbox obedece o estado PERSISTIDO
 * (`contacts.conversation_status`) por padrão.
 *
 * O defeito: `useFeatureFlag('inbox.status-fsm', false)` nascia `false` (a chave não
 * existe na tabela `feature_flags`), então `useInboxFilters` caía no ramo antigo e
 * derivava o estado de `messages.length` — "Abertas" = tem mensagem, "Resolvidas" =
 * não tem. Nessa regra a conversa encerrada (status `resolved`, que continua com
 * mensagens) voltava para "Abertas" e a aba "Resolvidas" só mostrava quem nunca
 * conversou.
 *
 * O mock da flag devolve `false`, como o banco sem a chave: depois da correção o
 * hook não consulta mais a flag e a lista continua obedecendo o campo persistido.
 * Antes da correção os três primeiros casos falham (a lista derivava de mensagens).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const flag = vi.hoisted(() => ({ useFeatureFlag: vi.fn(() => false) }));
vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: flag.useFeatureFlag }));

import { useInboxFilters } from '../useInboxFilters';

const conversa = (id: string, status: string, assigned: string | null, mensagens = 1) => ({
  id,
  unreadCount: 0,
  messages: Array.from({ length: mensagens }, (_, i) => ({ id: `m-${id}-${i}` })),
  lastMessage: { id: `m-${id}-0`, created_at: '2026-10-08T12:00:00.000Z' },
  contact: {
    id,
    name: `Contato ${id}`,
    phone: '5511999999999',
    email: null,
    created_at: '2026-10-01T12:00:00.000Z',
    updated_at: '2026-10-08T12:00:00.000Z',
    assigned_to: assigned,
    conversation_status: status,
    tags: [],
    queue_id: null,
  },
});

const CONVERSAS = [
  conversa('aberta-com-atendente', 'open', 'p1'),
  conversa('resolvida-com-mensagens', 'resolved', 'p1', 3),
  conversa('aguardando-com-mensagens', 'waiting', null),
  conversa('aberta-sem-atendente', 'open', null),
];

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

const montar = () =>
  renderHook(() => useInboxFilters({ conversations: CONVERSAS as never, profileId: 'p1' }), { wrapper });

const ids = (result: { current: { filteredConversations: Array<{ contact: { id: string } }> } }) =>
  result.current.filteredConversations.map((c) => c.contact.id).sort();

describe('useInboxFilters — o estado persistido é a fonte por padrão (SL-071)', () => {
  beforeEach(() => {
    flag.useFeatureFlag.mockClear();
  });

  it('não consulta mais a flag inbox.status-fsm', () => {
    montar();
    expect(flag.useFeatureFlag).not.toHaveBeenCalled();
  });

  it('"Abertas / Em atendimento" são as conversas open|waiting atribuídas a mim', () => {
    const { result } = montar();
    expect(ids(result)).toEqual(['aberta-com-atendente']);
  });

  it('"Aguardando" é o estado waiting — não "sem atendente"', () => {
    const { result } = montar();
    act(() => {
      result.current.setChipTab('waiting');
    });
    expect(ids(result)).toEqual(['aguardando-com-mensagens']);
  });

  it('"Resolvidas" é o estado resolved, mesmo com mensagens na conversa', () => {
    const { result } = montar();
    act(() => {
      result.current.setChipTab('resolved');
    });
    expect(ids(result)).toEqual(['resolvida-com-mensagens']);
  });
});
