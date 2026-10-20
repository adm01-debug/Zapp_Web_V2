/**
 * Linha do tempo de SLA por contato — `useContactSlaTimeline`.
 *
 * O sujeito é o hook REAL; a dublagem é a fronteira de rede (`supabase.from`), que grava
 * as operações/filtros e responde o que o teste manda. Fica provado que: os marcos saem das
 * linhas gravadas (nada inferido de mensagem), o prazo vem da hierarquia de SLA do contato,
 * o filtro de tipo não refaz a leitura, erro de leitura vira falha (nunca lista curta
 * passando por completa) e sem contato não há leitura.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  ops: [] as Array<{ table: string; filters: unknown[][] }>,
  tables: {} as Record<string, { data: unknown; error: unknown }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, filters: [] as unknown[][] };
      h.ops.push(entry);

      const builder: Record<string, unknown> = {};
      const mesmo = () => builder;
      builder.select = () => mesmo();
      builder.order = (...a: unknown[]) => {
        entry.filters.push(['order', ...a]);
        return mesmo();
      };
      builder.eq = (...a: unknown[]) => {
        entry.filters.push(['eq', ...a]);
        return mesmo();
      };
      builder.in = (...a: unknown[]) => {
        entry.filters.push(['in', ...a]);
        return mesmo();
      };
      builder.range = (...a: unknown[]) => {
        entry.filters.push(['range', ...a]);
        return mesmo();
      };
      builder.limit = (...a: unknown[]) => {
        entry.filters.push(['limit', ...a]);
        return mesmo();
      };
      builder.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) =>
        Promise.resolve(h.tables[table] ?? { data: [], error: null }).then(ok, falhou);
      return builder;
    },
  },
}));

import { useContactSlaTimeline } from '../useContactSlaTimeline';
import type { SlaTimelineFilters } from '@/lib/slaTimeline';

const T0 = Date.parse('2026-10-12T10:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

const REGRA_CONTATO = {
  id: 'rule-c1',
  name: 'Ouro do contato',
  first_response_minutes: 2,
  resolution_minutes: 10,
  contact_id: 'c1',
  company: null,
  job_title: null,
  contact_type: null,
  queue_id: null,
  agent_id: null,
};

const linhaSla = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  first_message_at: iso(T0),
  first_response_at: iso(T0 + 90_000),
  resolved_at: iso(T0 + 20 * 60_000),
  first_response_breached: false,
  resolution_breached: false,
  ...over,
});

function setup(initialProps: { id: string | null; filters?: SlaTimelineFilters }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  const rendered = renderHook(
    (props: { id: string | null; filters?: SlaTimelineFilters }) =>
      useContactSlaTimeline(props.id, props.filters),
    { wrapper, initialProps },
  );
  return { ...rendered, queryClient };
}

const opsDe = (table: string) => h.ops.filter((o) => o.table === table);

// A consulta só nasce habilitada quando o prazo aplicável resolve, então a chave com
// limites nulos fica pendente no cache: aqui só interessa o estado da consulta REAL.
const estadoDaTimeline = (queryClient: QueryClient) => {
  const consultas = queryClient
    .getQueryCache()
    .getAll()
    .filter((q) => q.queryKey[0] === 'contact-sla-timeline' && q.queryKey[2] !== null);
  return consultas[consultas.length - 1]?.state.status;
};

beforeEach(() => {
  h.ops = [];
  h.tables = {};
  vi.clearAllMocks();
});

describe('useContactSlaTimeline — marcos reais', () => {
  function comUmaConversa() {
    h.tables.sla_rules = { data: [REGRA_CONTATO], error: null };
    h.tables.conversation_sla = { data: [linhaSla()], error: null };
    h.tables.conversation_events = {
      data: [{ id: 'e1', event_type: 'transfer', created_at: iso(T0 + 5 * 60_000) }],
      error: null,
    };
  }

  it('monta os marcos das linhas gravadas, do mais recente para o mais antigo', async () => {
    comUmaConversa();
    const { result } = setup({ id: 'c1' });

    await waitFor(() => expect(result.current.milestones.length).toBe(4));

    expect(result.current.milestones.map((m) => m.kind)).toEqual([
      'resolution',
      'transfer',
      'first_response',
      'opened',
    ]);
    expect(result.current.limitsReady).toBe(true);
    expect(result.current.incomplete).toBe(false);
  });

  it('aplica o prazo da hierarquia do contato (2min), não o padrão do sistema', async () => {
    comUmaConversa();
    const { result } = setup({ id: 'c1' });

    await waitFor(() => expect(result.current.milestones.length).toBe(4));

    // 90s de 120s = 75%: com o padrão de 5min seria "no prazo"; com a regra do contato é risco.
    const primeiraResposta = result.current.milestones.find((m) => m.kind === 'first_response');
    expect(primeiraResposta).toMatchObject({ durationMs: 90_000, status: 'warning', limitMinutes: 2 });

    // 20min de 10min de resolução: estourado.
    expect(result.current.milestones.find((m) => m.kind === 'resolution')?.status).toBe('breached');
  });

  it('lê só o contato pedido e só os eventos de transferência do TR1', async () => {
    comUmaConversa();
    const { result } = setup({ id: 'c1' });
    await waitFor(() => expect(result.current.milestones.length).toBe(4));

    const slaFiltros = opsDe('conversation_sla')[0].filters;
    expect(slaFiltros).toContainEqual(['eq', 'contact_id', 'c1']);

    const eventoIn = opsDe('conversation_events')[0].filters.find((f) => f[0] === 'in');
    expect(eventoIn?.[1]).toBe('event_type');
    expect(eventoIn?.[2]).toEqual(
      expect.arrayContaining(['transfer', 'queue_transfer', 'overload_reassign', 'absence_reassign']),
    );
  });
});

describe('useContactSlaTimeline — filtro', () => {
  it('troca de filtro sem refazer a leitura', async () => {
    h.tables.sla_rules = { data: [REGRA_CONTATO], error: null };
    h.tables.conversation_sla = { data: [linhaSla()], error: null };
    h.tables.conversation_events = {
      data: [{ id: 'e1', event_type: 'transfer', created_at: iso(T0 + 5 * 60_000) }],
      error: null,
    };

    const { result, rerender } = setup({ id: 'c1', filters: { kinds: ['transfer'] } });
    await waitFor(() => expect(result.current.milestones.length).toBe(1));
    expect(result.current.milestones[0].kind).toBe('transfer');
    expect(opsDe('conversation_sla')).toHaveLength(1);

    rerender({ id: 'c1', filters: { kinds: ['resolution'] } });
    await waitFor(() => expect(result.current.milestones[0]?.kind).toBe('resolution'));
    expect(opsDe('conversation_sla')).toHaveLength(1);
  });
});

describe('useContactSlaTimeline — falha e ausência de contato', () => {
  it('erro de leitura de conversation_sla vira falha, não lista curta', async () => {
    h.tables.sla_rules = { data: [REGRA_CONTATO], error: null };
    h.tables.conversation_sla = {
      data: null,
      error: { message: 'permission denied for table conversation_sla' },
    };
    h.tables.conversation_events = { data: [], error: null };

    const { result, queryClient } = setup({ id: 'c1' });

    await waitFor(() => expect(estadoDaTimeline(queryClient)).toBe('error'));
    expect(result.current.milestones).toEqual([]);
  });

  it('erro na leitura de eventos também vira falha', async () => {
    h.tables.sla_rules = { data: [REGRA_CONTATO], error: null };
    h.tables.conversation_sla = { data: [linhaSla()], error: null };
    h.tables.conversation_events = { data: null, error: { message: 'permission denied' } };

    const { queryClient } = setup({ id: 'c1' });
    await waitFor(() => expect(estadoDaTimeline(queryClient)).toBe('error'));
  });

  it('sem contato não há leitura nenhuma', async () => {
    const { result } = setup({ id: null });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.milestones).toEqual([]);
    expect(opsDe('conversation_sla')).toHaveLength(0);
    expect(opsDe('conversation_events')).toHaveLength(0);
  });
});
