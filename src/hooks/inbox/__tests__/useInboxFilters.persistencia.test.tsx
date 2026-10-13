/**
 * Persistência dos filtros da Inbox (chave `inbox_filters_v2`).
 *
 * O defeito: `useInboxFilters` guardava a aba (chip), a fila e o tipo de contato
 * só em estado, então cada recarga da página voltava tudo ao padrão — a Inbox
 * abria em "Em atendimento", sem a fila nem o tipo que o usuário escolheu. Pior:
 * se a aba escolhida ficasse vazia (o dado mudou desde a última visita), a tela
 * abria vazia mesmo havendo conversas em Abertos.
 *
 * Aqui provo:
 * - a escolha de aba/fila/tipo sobrevive à recarga (localStorage);
 * - a URL tem prioridade e valor inválido é ignorado (e removido da URL);
 * - payload inválido no storage é descartado sem derrubar a tela;
 * - o fallback de primeira carga: aba vazia volta para Abertos; "Em atendimento"
 *   vazio com "Aguardando" > 0 troca para "Aguardando";
 * - a busca NÃO é persistida (privacidade: pode conter telefone/nome).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useInboxFilters } from '../useInboxFilters';
import type { ChipTab } from '@/components/inbox/TicketTabs';

vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: () => false }));

const STORAGE_KEY = 'inbox_filters_v2';
const FILA = '11111111-1111-4111-8111-111111111111';

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
  conversa('aberta-minha', 'open', 'p1'),
  conversa('aguardando', 'waiting', null),
  conversa('resolvida', 'resolved', 'p1', { mensagens: 3 }),
];

const SO_ABERTAS = [conversa('aberta-minha', 'open', 'p1'), conversa('aberta-outra', 'open', 'p1')];
const SO_AGUARDANDO = [
  conversa('aguardando', 'waiting', null),
  conversa('aguardando-2', 'waiting', null),
];

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

const montar = (conversations: unknown[] = CONVERSAS) =>
  renderHook(() => useInboxFilters({ conversations: conversations as never, profileId: 'p1' }), {
    wrapper,
  });

const guardar = (value: unknown) => window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));

const guardado = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');

const definirUrl = (search: string) => window.history.replaceState(null, '', `/${search}`);

describe('useInboxFilters — persistência da aba, fila e tipo (inbox_filters_v2)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    definirUrl('');
  });

  it('sem nada guardado abre em Em atendimento (regressão)', () => {
    const { result } = montar();
    expect(result.current.chipTab).toBe<ChipTab>('attending');
    expect(result.current.mainTab).toBe('open');
    expect(result.current.subTab).toBe('attending');
  });

  it('recarrega com a aba guardada', () => {
    guardar({ chipTab: 'resolved' });
    const { result } = montar();
    expect(result.current.chipTab).toBe<ChipTab>('resolved');
    expect(result.current.mainTab).toBe('resolved');
    expect(result.current.subTab).toBeNull();
  });

  it('recarrega com a fila e o tipo guardados', () => {
    guardar({ queueId: FILA, contactType: 'individual' });
    const { result } = montar();
    expect(result.current.selectedQueueId).toBe(FILA);
    expect(result.current.selectedContactType).toBe('individual');
  });

  it('grava aba, fila e tipo a cada escolha — e nunca a busca', () => {
    const { result } = montar();

    act(() => result.current.setChipTab('waiting'));
    act(() => result.current.handleContactTypeChange('grupo'));
    act(() => result.current.setSelectedQueueId(FILA));
    act(() => result.current.setSearch('5511999999999'));

    expect(guardado()).toEqual({ chipTab: 'waiting', queueId: FILA, contactType: 'grupo' });
    expect(Object.keys(guardado())).not.toContain('search');
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toContain('5511999999999');
  });

  it('valor inválido na URL é ignorado e sai da URL', () => {
    definirUrl('?chip=banana&queue=nao-e-uuid&type=NAOValido!');

    const { result } = montar();

    expect(result.current.chipTab).toBe<ChipTab>('attending');
    expect(result.current.selectedQueueId).toBeNull();
    expect(result.current.selectedContactType).toBeNull();
    expect(window.location.search).not.toContain('chip=');
    expect(window.location.search).not.toContain('queue=');
    expect(window.location.search).not.toContain('type=');
  });

  it('valor válido na URL vence o valor guardado', () => {
    guardar({ chipTab: 'resolved' });
    definirUrl('?chip=waiting');

    const { result } = montar();

    expect(result.current.chipTab).toBe<ChipTab>('waiting');
  });

  it('payload inválido no storage é descartado (aba, fila e tipo)', () => {
    guardar({ chipTab: 'banana', queueId: 'x', contactType: 'Com Espaço' });

    const { result } = montar();

    expect(result.current.chipTab).toBe<ChipTab>('attending');
    expect(result.current.selectedQueueId).toBeNull();
    expect(result.current.selectedContactType).toBeNull();
  });

  it('fallback: aba Resolvidas restaurada e vazia volta para Abertos', () => {
    guardar({ chipTab: 'resolved' });

    const { result } = montar(SO_ABERTAS);

    expect(result.current.chipTab).toBe<ChipTab>('attending');
  });

  it('fallback: Em atendimento vazio com Aguardando > 0 vai para Aguardando', () => {
    guardar({ chipTab: 'attending' });

    const { result } = montar(SO_AGUARDANDO);

    expect(result.current.chipTab).toBe<ChipTab>('waiting');
  });

  it('fallback preserva a escolha manual depois da primeira carga', () => {
    const { result } = montar(SO_ABERTAS);

    act(() => result.current.setChipTab('resolved'));
    // A lista de resolvidas está vazia; o fallback já rodou e não atropela a escolha.
    expect(result.current.chipTab).toBe<ChipTab>('resolved');
  });
});
