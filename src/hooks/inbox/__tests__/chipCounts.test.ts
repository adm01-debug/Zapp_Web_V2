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

// ---------- contador com busca / filtros do painel / tipo de contato ----------
//
// Antes: countByChip só olhava contato, adiamento, fila e chip. A lista ainda
// aplicava busca, tipo de contato e o painel Filtros por cima — então bastava
// digitar na busca (ou marcar uma etiqueta) para o número do chip divergir do
// tamanho da lista. Agora a lista e o contador usam o MESMO passesExtraFilters.

interface Combo {
  nome: string;
  search?: string;
  status?: string[];
  tags?: string[];
  agentId?: string | null;
  from?: Date | null;
  to?: Date | null;
  contactType?: string | null;
  queueId?: string | null;
  showAll?: boolean;
}

const conversaMatriz = (
  id: string,
  opts: {
    nome?: string;
    phone?: string;
    email?: string | null;
    status?: string;
    assigned?: string | null;
    unread?: number;
    mensagens?: number;
    tags?: string[];
    queue?: string | null;
    groupCategory?: string | null;
    lastMessageAt?: string | null;
    createdAt?: string;
  } = {},
) => {
  const mensagens = opts.mensagens ?? 1;
  const iso = opts.lastMessageAt ?? null;
  return {
    id,
    unreadCount: opts.unread ?? 0,
    messages: Array.from({ length: mensagens }, (_, i) => ({ id: `m-${id}-${i}` })),
    lastMessage: iso ? { id: `m-${id}-0`, created_at: iso } : null,
    contact: {
      id,
      name: opts.nome ?? `Contato ${id}`,
      phone: opts.phone ?? '5511999999999',
      email: opts.email ?? null,
      created_at: opts.createdAt ?? '2026-10-01T12:00:00.000Z',
      updated_at: iso ?? '2026-10-08T12:00:00.000Z',
      assigned_to: opts.assigned ?? null,
      conversation_status: opts.status ?? 'open',
      tags: opts.tags ?? [],
      queue_id: opts.queue ?? null,
      group_category: opts.groupCategory ?? null,
    },
  };
};

const CONVERSAS_MATRIZ = [
  conversaMatriz('silvestre', { nome: 'Silvestre Alves', assigned: PROFILE_ID, tags: ['vip'], queue: 'q1', lastMessageAt: '2026-10-08T12:00:00.000Z' }),
  conversaMatriz('jose', { nome: 'José Antônio', status: 'waiting', unread: 2, lastMessageAt: '2026-10-05T12:00:00.000Z' }),
  conversaMatriz('grupo', { nome: 'Grupo Orçamentos', phone: '1203630-555', assigned: PROFILE_ID, tags: ['fornecedor'], queue: 'q2', groupCategory: 'orcamentos', lastMessageAt: '2026-10-01T12:00:00.000Z' }),
  conversaMatriz('arquivada', { nome: 'Arquivada Teste', status: 'archived', assigned: 'p2', unread: 1, queue: 'q1', lastMessageAt: '2026-09-20T12:00:00.000Z' }),
  conversaMatriz('resolvida', { nome: 'Resolvida', status: 'resolved', assigned: PROFILE_ID, mensagens: 2, lastMessageAt: '2026-10-10T12:00:00.000Z' }),
  conversaMatriz('sem-msg', { nome: 'Sem Mensagem', assigned: PROFILE_ID, mensagens: 0, lastMessageAt: null, createdAt: '2026-10-03T12:00:00.000Z' }),
  conversaMatriz('aguardando-2', { nome: 'Aguardando Dois', status: 'waiting', assigned: 'p2', lastMessageAt: '2026-10-07T12:00:00.000Z' }),
  conversaMatriz('iris', { nome: 'Iris Duarte', email: 'iris@promo.com', assigned: PROFILE_ID, lastMessageAt: '2026-10-08T18:00:00.000Z' }),
] as never;

const estadoFiltros = (combo: Combo) => ({
  status: combo.status ?? [],
  tags: combo.tags ?? [],
  agentId: combo.agentId ?? null,
  dateRange: { from: combo.from ?? null, to: combo.to ?? null },
});

const optsDoCombo = (combo: Combo) => ({
  search: combo.search ?? null,
  selectedContactType: combo.contactType ?? null,
  filters: estadoFiltros(combo),
  selectedQueueId: combo.queueId ?? null,
  showAll: Boolean(combo.showAll),
});

type Hook = ReturnType<typeof useInboxFilters>;

const aplicarCombo = (result: { current: Hook }, combo: Combo) => {
  act(() => result.current.setSearch(combo.search ?? ''));
  act(() => result.current.setFilters(estadoFiltros(combo)));
  act(() => result.current.handleContactTypeChange(combo.contactType ?? null));
  act(() => result.current.setShowAll(Boolean(combo.showAll)));
  act(() => result.current.setSelectedQueueId(combo.queueId ?? null));
};

const montarMatriz = (snoozedIds?: Set<string>) =>
  renderHook(
    () => useInboxFilters({ conversations: CONVERSAS_MATRIZ, profileId: PROFILE_ID, snoozedIds }),
    { wrapper },
  );

const COMBOS: Combo[] = [
  { nome: 'sem filtro' },
  { nome: 'busca por nome', search: 'silvestre' },
  { nome: 'busca maiúscula com acento', search: 'JOSÉ' },
  { nome: 'busca por e-mail', search: 'iris@promo.com' },
  { nome: 'busca sem resultado', search: 'zzz-inexistente' },
  { nome: 'tipo individual', contactType: 'individual' },
  { nome: 'tipo grupo', contactType: 'grupo' },
  { nome: 'fila q1', queueId: 'q1' },
  { nome: 'status não lidas', status: ['unread'] },
  { nome: 'status pendentes', status: ['pending'] },
  { nome: 'etiqueta vip', tags: ['vip'] },
  { nome: 'atendente p1', agentId: 'p1' },
  { nome: 'intervalo de datas', from: new Date(2026, 9, 1), to: new Date(2026, 9, 9) },
  { nome: 'intervalo sem "de" (só até)', to: new Date(2026, 9, 9) },
  { nome: 'busca + tipo', search: 'a', contactType: 'individual' },
  { nome: 'fila + tipo grupo', queueId: 'q2', contactType: 'grupo' },
  { nome: 'showAll', showAll: true },
  { nome: 'tudo junto', search: 'o', contactType: 'individual', status: ['read'], tags: ['vip'], agentId: 'p1', from: new Date(2026, 9, 1), to: new Date(2026, 9, 31) },
];

describe('contador com busca/filtros/tipo — matriz de combinações', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it.each(COMBOS)('combinação "$nome": todos os chips batem com a lista', (combo) => {
    const { result } = montarMatriz();
    aplicarCombo(result, combo);

    const counts = countByChip(CONVERSAS_MATRIZ, PROFILE_ID, optsDoCombo(combo));
    for (const chip of CHIPS) {
      act(() => result.current.setChipTab(chip));
      expect(counts[chip], `chip ${chip} em "${combo.nome}"`).toBe(
        result.current.filteredConversations.length,
      );
    }
  });

  it('o hook devolve chipCounts igual ao countByChip e à lista, em cada chip', () => {
    const { result } = montarMatriz();
    const combo: Combo = { nome: 'busca + tipo', search: 'a', contactType: 'individual' };
    aplicarCombo(result, combo);

    const esperado = countByChip(CONVERSAS_MATRIZ, PROFILE_ID, optsDoCombo(combo));
    for (const chip of CHIPS) {
      act(() => result.current.setChipTab(chip));
      expect(result.current.chipCounts[chip]).toBe(esperado[chip]);
      expect(result.current.chipCounts[chip]).toBe(result.current.filteredConversations.length);
    }
  });

  it('busca sem resultado zera todos os chips, sem erro', () => {
    const { result } = montarMatriz();
    aplicarCombo(result, { nome: 'vazio', search: 'zzz-inexistente' });
    for (const chip of CHIPS) {
      expect(result.current.chipCounts[chip]).toBe(0);
    }
  });

  it('busca com acento e maiúscula encontra o nome e recorta só ele', () => {
    const { result } = montarMatriz();
    aplicarCombo(result, { nome: 'acento', search: 'JOSÉ' });
    act(() => result.current.setChipTab('waiting'));
    expect(result.current.filteredConversations.map((c) => c.contact.id)).toEqual(['jose']);
    expect(result.current.chipCounts.waiting).toBe(1);
    // 'Todas' cobre abertas (open|waiting): a busca casou só 'jose', que é waiting.
    expect(result.current.chipCounts.all).toBe(1);
  });

  it('busca por telefone acha a conversa e o contador acompanha', () => {
    const { result } = montarMatriz();
    aplicarCombo(result, { nome: 'telefone', search: '1203630-555' });
    act(() => result.current.setChipTab('all'));
    expect(result.current.filteredConversations.map((c) => c.contact.id)).toEqual(['grupo']);
    expect(result.current.chipCounts.all).toBe(1);
  });

  it('bate com a lista com volume acima da amostra do realtime (SEEDED_CONTACT_LIMIT=500)', () => {
    // A inbox carrega até 500 contatos de uma vez (realtime.service SEEDED_CONTACT_LIMIT);
    // uso 1.200 para a regra não depender de a amostra estar inteira.
    const volume = Array.from({ length: 1200 }, (_, i) =>
      conversaMatriz(`v-${i}`, {
        nome: `Volume ${i} teste`,
        status: i % 3 === 0 ? 'waiting' : 'open',
        assigned: i % 2 === 0 ? PROFILE_ID : 'p2',
        unread: i % 5,
        tags: i % 4 === 0 ? ['vip'] : [],
        lastMessageAt: `2026-10-${String((i % 28) + 1).padStart(2, '0')}T12:00:00.000Z`,
      }),
    ) as never;

    const { result } = renderHook(
      () => useInboxFilters({ conversations: volume, profileId: PROFILE_ID }),
      { wrapper },
    );
    const combo: Combo = { nome: 'volume', search: 'Volume', tags: ['vip'] };
    aplicarCombo(result, combo);

    const counts = countByChip(volume, PROFILE_ID, optsDoCombo(combo));
    for (const chip of CHIPS) {
      act(() => result.current.setChipTab(chip));
      expect(counts[chip]).toBe(result.current.filteredConversations.length);
    }
  });
});
