/**
 * R2-INB-005 (P1 · Inbox) — efeito observável na lista: conversa ativa que ficou
 * FORA da janela global de mensagens precisa continuar na aba "abertas".
 *
 * Antes da correção a conversa voltava com `messages: []` e o filtro de abertas
 * (`c.messages.length > 0`) empurrava o contato para fora da lista — o operador
 * simplesmente não via a conversa. O teste monta a conversa das duas formas (sem e
 * com o agregado por contato que o serviço agora consulta) e prova o antes/depois
 * dentro do filtro real. Contato sem nenhuma mensagem continua fora (sem inflar).
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: () => false }));

import { useInboxFilters } from '../useInboxFilters';
import { buildConversation, type ContactConversationSummary } from '@/hooks/realtime/realtimeUtils';

const contato = (id: string, nome: string) => ({
  id,
  name: nome,
  phone: '5511999999999',
  email: null,
  created_at: '2026-08-01T10:00:00.000Z',
  updated_at: '2026-10-05T09:00:00.000Z',
  assigned_to: 'p1',
  conversation_status: 'open',
  tags: [],
  queue_id: null,
});

const AGREGADO_DE_B: ContactConversationSummary = {
  unreadCount: 3,
  lastMessage: {
    id: 'b-999',
    contact_id: 'b',
    sender: 'contact',
    content: 'última do contato B',
    created_at: '2026-10-05T08:56:00.000Z',
    is_read: false,
  } as never,
};

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

const listar = (conversations: unknown[]) =>
  renderHook(() => useInboxFilters({ conversations: conversations as never, profileId: 'p1' }), { wrapper })
    .result.current.filteredConversations;

describe('useInboxFilters — conversa fora da janela global (R2-INB-005)', () => {
  it('sem o agregado do banco a conversa de B desaparece da aba de abertas (o defeito)', () => {
    const b = buildConversation(contato('b', 'Contato B') as never, []);

    expect(b.messages).toHaveLength(0);
    expect(listar([b])).toHaveLength(0);
  });

  it('com o agregado por contato ela volta para a aba de abertas, com a contagem real', () => {
    const b = buildConversation(contato('b', 'Contato B') as never, [], AGREGADO_DE_B);

    expect(b.unreadCount).toBe(3);
    const exibidas = listar([b]);
    expect(exibidas.map((c) => c.contact.id)).toEqual(['b']);
    expect(exibidas[0].unreadCount).toBe(3);
    expect(exibidas[0].lastMessage?.content).toBe('última do contato B');
  });

  it('contato sem nenhuma mensagem não entra na aba de abertas', () => {
    const vazio = buildConversation(contato('z', 'Sem histórico') as never, []);

    expect(listar([vazio])).toHaveLength(0);
  });
});
