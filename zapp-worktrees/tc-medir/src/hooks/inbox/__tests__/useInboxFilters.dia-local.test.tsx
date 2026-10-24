/**
 * R3-03 — o preset de data da inbox usa o dia **local do navegador** e não alarga a janela.
 *
 * O componente grava `dateRange.from = startOfDay(dia)` e `dateRange.to = endOfDay(dia)`. O fim do
 * dia local (23:59:59.999 em UTC-3) cai no **dia UTC seguinte**, então
 * `toISOString().split('T')[0]` serializava `dateTo` um dia à frente e, na volta, `parseISO` +
 * `endOfDay` alargava o filtro em um dia inteiro — nunca escondia nada, só mostrava a mais.
 *
 * Âncora: 30/09/2026 22:30 em São Paulo. O defeito é de borda de dia (não depende da hora atual),
 * mas a âncora é a mesma da série para ficar comparável.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { startOfDay, endOfDay, parseISO } from 'date-fns';
import { localDayKey, parseDayKey } from '@/lib/localDay';
// O hook consulta uma flag de feature (que exige AuthProvider); aqui ela não importa.
vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: () => false }));

import { useInboxFilters } from '../useInboxFilters';

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const AGORA = new Date(2026, 8, 30, 22, 30, 0); // 30/09/2026 22:30 local
const DIA = '2026-09-30';

// 30/09 12:00 local -> dentro do dia escolhido
// 01/10 10:00 local -> DIA SEGUINTE: nao pode aparecer no filtro de um dia so
const DENTRO = '2026-09-30T12:00:00';
const FORA = '2026-10-01T10:00:00';

const conversa = (id: string, criadaEm: string) => ({
  id,
  unreadCount: 0,
  messages: [{ id: `m-${id}` }],
  lastMessage: { id: `m-${id}`, created_at: criadaEm },
  contact: {
    id,
    name: `Contato ${id}`,
    phone: '5511999999999',
    email: null,
    created_at: criadaEm,
    updated_at: criadaEm,
    assigned_to: 'p1',
    conversation_status: 'open',
    tags: [],
    queue_id: null,
  },
});

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

const montar = () =>
  renderHook(() => useInboxFilters({ conversations: [conversa('dentro', DENTRO), conversa('fora', FORA)] as never, profileId: 'p1' }), { wrapper });

describe('useInboxFilters — janela de data no fuso do navegador', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(AGORA);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it(`filtro de um dia só não pega o dia seguinte (TZ=${TZ})`, () => {
    const { result } = montar();

    act(() => {
      result.current.setFilters({
        status: [],
        tags: [],
        agentId: null,
        dateRange: { from: startOfDay(parseDayKey(DIA) as Date), to: endOfDay(parseDayKey(DIA) as Date) },
      });
    });

    // a janela efetiva depois do round-trip pela URL
    expect(localDayKey(result.current.filters.dateRange.from)).toBe(DIA);
    expect(localDayKey(result.current.filters.dateRange.to)).toBe(DIA);

    // e o efeito observável: a conversa do dia seguinte fica fora
    expect(result.current.filteredConversations.map((c) => c.contact.id).sort()).toEqual(['dentro']);
  });

  it('o preset "hoje" grava o mesmo dia local em from e to', () => {
    const { result } = montar();
    const hoje = new Date();

    act(() => {
      result.current.setFilters({
        status: [],
        tags: [],
        agentId: null,
        dateRange: { from: startOfDay(hoje), to: endOfDay(hoje) },
      });
    });

    expect(localDayKey(result.current.filters.dateRange.from)).toBe('2026-09-30');
    expect(localDayKey(result.current.filters.dateRange.to)).toBe('2026-09-30');
    expect(window.location.search).not.toContain('to=2026-10-01');
  });

  it('intervalo de vários dias preserva as duas pontas', () => {
    const { result } = montar();

    act(() => {
      result.current.setFilters({
        status: [],
        tags: [],
        agentId: null,
        dateRange: {
          from: startOfDay(parseDayKey('2026-09-28') as Date),
          to: endOfDay(parseDayKey('2026-09-30') as Date),
        },
      });
    });

    expect(localDayKey(result.current.filters.dateRange.from)).toBe('2026-09-28');
    expect(localDayKey(result.current.filters.dateRange.to)).toBe('2026-09-30');
    // 30/09 12:00 está dentro; 01/10 10:00 continua fora
    expect(result.current.filteredConversations.map((c) => c.contact.id).sort()).toEqual(['dentro']);
  });

  it('sem data, os dois parâmetros continuam vazios (não regride)', () => {
    const { result } = montar();

    act(() => {
      result.current.setFilters({ status: [], tags: [], agentId: null, dateRange: { from: null, to: null } });
    });

    expect(result.current.filters.dateRange.from).toBeNull();
    expect(result.current.filters.dateRange.to).toBeNull();
    expect(result.current.filteredConversations.map((c) => c.contact.id).sort()).toEqual(['dentro', 'fora']);
  });
});
