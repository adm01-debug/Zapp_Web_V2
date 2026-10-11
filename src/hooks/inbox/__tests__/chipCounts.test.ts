/**
 * Contadores dos chips pelas MESMAS regras da lista (countByChip).
 *
 * O defeito: StatusChips.tsx contava por regras próprias ("Resolvidas" = conversa
 * sem mensagem carregada, "Aguardando" = sem responsável), enquanto a lista usa o
 * estado persistido `contacts.conversation_status`. O número do chip divergia do
 * que a lista mostrava ao clicar.
 *
 * Aqui provo:
 * - countByChip conta pelo estado persistido (resolved/waiting/archived reais);
 * - a conversa com 0 mensagens não vira "Resolvida" (regra antiga derrubada);
 * - propriedade de CONSISTÊNCIA: para cada chip, countByChip(...)[chip] é igual ao
 *   length de filteredConversations quando aquele chip está ativo no hook real;
 * - adiadas saem dos dois lados e showAll acompanha a lista.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createElement, type ReactNode } from 'react';

vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: () => false }));

import { useInboxFilters } from '../useInboxFilters';
import { countByChip } from '../chipCounts';
import type { ChipTab } from '@/components/inbox/TicketTabs';

const PROFILE_ID = 'p1';

const conversa = (
  id: string,
  status: string,
  assigned: string | null,
  { mensagens = 1, unread = 0 } = {},
) => ({
  id,
  unreadCount: unread,
  messages: Array.from({ length: mensagens }, (_, i) => ({ id: `m-${id}-${i}` })),
  lastMessage: mensagens > 0 ? { id: `m-${id}-0`, created_at: '2026-10-08T12:00:00.000Z' } : null,
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
  conversa('aberta-minha', 'open', PROFILE_ID),
  conversa('aberta-comun', 'open', 'p2', { unread: 2 }),
  conversa('aberta-sem', 'open', null),
  conversa('aberta-sem-msg', 'open', PROFILE_ID, { mensagens: 0 }), // 0 msgs: NÃO é "resolvida"
  conversa('aguardando', 'waiting', null, { unread: 1 }),
  conversa('resolvida', 'resolved', PROFILE_ID, { mensagens: 3 }), // tem msgs: conta resolvida
  conversa('resolvida-sem-msg', 'resolved', PROFILE_ID, { mensagens: 0 }),
  conversa('arquivada', 'archived', PROFILE_ID, { unread: 1 }),
  conversa('arquivada-sem-msg', 'archived', null, { mensagens: 0 }),
] as never;

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(MemoryRouter, null, children);

const montar = (snoozedIds?: Set<string>) =>
  renderHook(
    () => useInboxFilters({ conversations: CONVERSAS, profileId: PROFILE_ID, snoozedIds }),
    { wrapper },
  );

const CHIPS: ChipTab[] = ['all', 'unread', 'attending', 'waiting', 'resolved', 'archived'];

describe('countByChip — contadores pelas regras da lista', () => {
  beforeEach(() => vi.clearAllMocks());

  it('conta pelo estado persistido, não por "sem mensagens"', () => {
    const counts = countByChip(CONVERSAS, PROFILE_ID);
    // abertas com mensagem (open|waiting): aberta-minha, aberta-comun, aberta-sem, aguardando
    expect(counts.all).toBe(4);
    // não lidas entre as abertas: aberta-comun (2), aguardando (1)
    expect(counts.unread).toBe(2);
    // Em atendimento = responsável é o usuário
    expect(counts.attending).toBe(1);
    // Aguardando = estado 'waiting' (não "sem responsável")
    expect(counts.waiting).toBe(1);
    // Resolvidas = estado 'resolved' — inclui a que TEM mensagens e exclui a
    // aberta sem mensagens que a regra antiga contaria como Resolvida (seriam 3).
    expect(counts.resolved).toBe(2);
    // Arquivadas só no chip Arquivadas (inclusive sem mensagens)
    expect(counts.archived).toBe(2);
  });

  it('exclui adiadas de todos os chips, como a lista', () => {
    const counts = countByChip(CONVERSAS, PROFILE_ID, { snoozedIds: new Set(['aberta-minha', 'arquivada']) });
    expect(counts.all).toBe(3);
    expect(counts.attending).toBe(0);
    expect(counts.archived).toBe(1);
    expect(counts.resolved).toBe(2);
  });

  it('showAll acompanha a lista: Em atendimento passa a ser Todas', () => {
    const comShowAll = countByChip(CONVERSAS, PROFILE_ID, { showAll: true });
    const semShowAll = countByChip(CONVERSAS, PROFILE_ID);
    expect(comShowAll.attending).toBe(comShowAll.all);
    expect(semShowAll.attending).toBe(1);
  });
});

describe('consistência: contador do chip == length da lista com o chip ativo', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(CHIPS)('chip %s bate com filteredConversations', (chip) => {
    const { result } = montar();
    act(() => result.current.setChipTab(chip));

    const counts = countByChip(CONVERSAS, PROFILE_ID);
    expect(counts[chip]).toBe(result.current.filteredConversations.length);
  });

  it('com adiadas, contador e lista continuam iguais', () => {
    const snoozedIds = new Set(['aberta-minha', 'arquivada']);
    const { result } = montar(snoozedIds);
    const counts = countByChip(CONVERSAS, PROFILE_ID, { snoozedIds });

    for (const chip of CHIPS) {
      act(() => result.current.setChipTab(chip));
      expect(counts[chip]).toBe(result.current.filteredConversations.length);
    }
    // a adiada (única conversa atribuída a p1) sai de Em atendimento nos dois lados
    expect(counts.attending).toBe(0);
  });
});
