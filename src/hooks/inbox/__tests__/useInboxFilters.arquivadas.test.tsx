/**
 * Chip "Arquivadas" (cartão B2, plano PLANO_BADGE_ARQUIVADAS_2026-10-11).
 *
 * O chip (cartão B1) já existe em StatusChips e deriva mainTab/subTab via
 * `setChipTab('archived')` → mainTab 'open', subTab null. Sem tratamento no
 * filtro, o ramo `mainTab === 'open'` exige status open|waiting e a lista
 * ARCHIVED fica vazia. Estes testes provam o comportamento pretendido:
 * - Arquivadas mostra só `conversation_status === 'archived'`;
 * - arquivadas somem de Todas / Não lidas / Em atendimento / Aguardando / Resolvidas;
 * - busca, fila e tipo de contato seguem funcionando por cima;
 * - sem arquivadas, a lista é vazia sem erro.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useInboxFilters } from '../useInboxFilters';
import type { ChipTab } from '@/components/inbox/TicketTabs';

const conversa = (
  id: string,
  status: string,
  assigned: string | null,
  { mensagens = 1, unread = 0, queue = null as string | null } = {}
) => ({
  id,
  unreadCount: unread,
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
    queue_id: queue,
  },
});

const CONVERSAS = [
  conversa('aberta', 'open', 'p1', { unread: 3 }),
  conversa('aguardando', 'waiting', null),
  conversa('resolvida', 'resolved', 'p1', { mensagens: 3 }),
  conversa('arquivada-fila', 'archived', 'p1', { unread: 2, queue: 'q1' }),
  conversa('arquivada-sem-fila', 'archived', null),
];

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

const montar = (conversations = CONVERSAS) =>
  renderHook(() => useInboxFilters({ conversations: conversations as never, profileId: 'p1' }), { wrapper });

const ids = (result: { current: { filteredConversations: Array<{ contact: { id: string } }> } }) =>
  result.current.filteredConversations.map((c) => c.contact.id).sort();

const trocarChip = (result: { current: { setChipTab: (t: ChipTab) => void } }, tab: ChipTab) => {
  act(() => {
    result.current.setChipTab(tab);
  });
};

describe('useInboxFilters — chip Arquivadas (B2)', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('o chip archived mostra só as conversas com conversation_status archived', () => {
    const { result } = montar();
    trocarChip(result, 'archived');
    expect(ids(result)).toEqual(['arquivada-fila', 'arquivada-sem-fila']);
  });

  it('arquivadas NÃO aparecem nos demais chips', () => {
    for (const chip of ['all', 'unread', 'attending', 'waiting', 'resolved'] as ChipTab[]) {
      const { result } = montar();
      trocarChip(result, chip);
      const visiveis = ids(result);
      expect(visiveis.filter((id) => id.startsWith('arquivada'))).toEqual([]);
    }
  });

  it('a busca funciona dentro de Arquivadas', () => {
    const { result } = montar();
    trocarChip(result, 'archived');
    act(() => {
      result.current.setSearch('sem-fila');
    });
    expect(ids(result)).toEqual(['arquivada-sem-fila']);
  });

  it('a fila (queue) continua valendo dentro de Arquivadas', () => {
    const { result } = montar();
    trocarChip(result, 'archived');
    act(() => {
      result.current.setSelectedQueueId('q1');
    });
    expect(ids(result)).toEqual(['arquivada-fila']);
  });

  it('sem arquivadas a lista fica vazia, sem erro', () => {
    const { result } = montar([conversa('aberta', 'open', 'p1'), conversa('resolvida', 'resolved', 'p1', { mensagens: 2 })]);
    trocarChip(result, 'archived');
    expect(ids(result)).toEqual([]);
  });
});
