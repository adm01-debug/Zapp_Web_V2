import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

type Row = Record<string, unknown>;
interface TableConfig { rows: Row[]; error: { message: string } | null }
interface QueryLog { table: string; filters: Array<{ op: string; col: string; val: unknown }> }

const h = vi.hoisted(() => ({
  tables: {} as Record<string, TableConfig>,
  queries: [] as QueryLog[],
}));

/**
 * Stub de PostgREST: conta/filtra como o backend real (o filtro por status é
 * aplicado à fixture), em vez de devolver sempre o mesmo valor. É o que permite
 * provar que a leitura com o status errado devolve zero.
 */
vi.mock('@/integrations/supabase/client', () => {
  const makeBuilder = (table: string) => {
    const filters: QueryLog['filters'] = [];
    h.queries.push({ table, filters });

    const cfg = (): TableConfig => h.tables[table] ?? { rows: [], error: null };

    const matching = () =>
      cfg().rows.filter((row) =>
        filters.every((f) => {
          const value = row[f.col];
          if (f.op === 'eq') return value === f.val;
          if (f.op === 'in') return (f.val as unknown[]).includes(value);
          if (f.op === 'gte') return String(value) >= String(f.val);
          return true;
        }),
      );

    const result = () => {
      const { error } = cfg();
      if (error) return { data: null, count: null, error };
      const rows = matching();
      return { data: rows, count: rows.length, error: null };
    };

    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => { filters.push({ op: 'eq', col, val }); return builder; },
      in: (col: string, val: unknown) => { filters.push({ op: 'in', col, val }); return builder; },
      gte: (col: string, val: unknown) => { filters.push({ op: 'gte', col, val }); return builder; },
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => {
        const { error } = cfg();
        return Promise.resolve({ data: error ? null : (matching()[0] ?? null), error });
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return builder;
  };

  return { supabase: { from: (table: string) => makeBuilder(table) } };
});

import { useNextBestAction, OPEN_TASK_STATUSES } from '@/hooks/chat/useNextBestAction';

const CONTACT = 'c1';

function emptyTables() {
  h.tables = {
    messages: { rows: [], error: null },
    conversation_tasks: { rows: [], error: null },
    conversation_sla: { rows: [], error: null },
    conversation_memory: { rows: [], error: null },
  };
  h.queries = [];
}

async function render(contactId = CONTACT) {
  const hook = renderHook(() => useNextBestAction(contactId, 'Maria Silva'));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook.result.current.actions;
}

describe('useNextBestAction', () => {
  beforeEach(() => {
    emptyTables();
  });

  it('conta como abertas as tarefas do domínio atual do quadro (todo/doing/waiting) e ignora done/cancelled', async () => {
    h.tables.conversation_tasks = {
      rows: [
        { id: 't1', contact_id: CONTACT, status: 'todo' },
        { id: 't2', contact_id: CONTACT, status: 'doing' },
        { id: 't3', contact_id: CONTACT, status: 'waiting' },
        { id: 't4', contact_id: CONTACT, status: 'done' },
        { id: 't5', contact_id: CONTACT, status: 'cancelled' },
      ],
      error: null,
    };

    const actions = await render();

    expect(actions.some(a => a.type === 'complete_tasks' && a.label === 'Completar 3 tarefa(s)')).toBe(true);
    expect(actions.some(a => a.type === 'upsell')).toBe(false);
    expect(OPEN_TASK_STATUSES).toEqual(['backlog', 'todo', 'doing', 'waiting']);
  });

  it('consulta conversation_tasks pelo domínio de status atual, não pelo extinto "pending"', async () => {
    await render();

    const taskQuery = h.queries.find(q => q.table === 'conversation_tasks');
    expect(taskQuery).toBeDefined();

    const statusFilter = taskQuery?.filters.find(f => f.col === 'status');
    expect(statusFilter).toBeDefined();
    expect(statusFilter?.op).toBe('in');
    expect(statusFilter?.val).toEqual(expect.arrayContaining(['backlog', 'todo', 'doing', 'waiting']));
    expect(statusFilter?.val).not.toContain('pending');
  });

  it('falha de leitura vira aviso explícito e nunca "sem ações urgentes"', async () => {
    const failure = { message: 'permission denied' };
    h.tables = {
      messages: { rows: [], error: failure },
      conversation_tasks: { rows: [], error: failure },
      conversation_sla: { rows: [], error: failure },
      conversation_memory: { rows: [], error: failure },
    };

    const actions = await render();

    expect(actions.some(a => a.type === 'data_unavailable')).toBe(true);
    expect(actions.some(a => a.type === 'upsell')).toBe(false);
    expect(actions.some(a => a.type === 'data_unavailable' && a.priority === 'high')).toBe(true);
  });

  it('erro em uma fonte não apaga as ações das fontes que responderam, mas mantém o aviso', async () => {
    h.tables = {
      messages: {
        rows: [
          {
            id: 'm1',
            contact_id: CONTACT,
            sender: 'contact',
            created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
          },
        ],
        error: null,
      },
      conversation_tasks: { rows: [], error: { message: 'timeout' } },
      conversation_sla: { rows: [], error: null },
      conversation_memory: { rows: [], error: null },
    };

    const actions = await render();

    expect(actions.some(a => a.type === 'respond')).toBe(true);
    expect(actions.some(a => a.type === 'data_unavailable')).toBe(true);
    expect(actions.some(a => a.type === 'upsell')).toBe(false);
  });

  it('contato sem pendência e sem falha continua recebendo a sugestão de oportunidade', async () => {
    const actions = await render();

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('upsell');
  });
});
