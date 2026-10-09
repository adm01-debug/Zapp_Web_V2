/**
 * Testes do `contact-bulk.service` (R2-AUTH-013: mutação em lote com feedback fiel).
 *
 * O alvo são as funções REAIS do serviço; a fronteira dublada é o cliente Supabase, e
 * o dublê é FIEL ao PostgREST: um UPDATE **sem** `.select()` não devolve linhas
 * (`data: null`) — é exatamente isso que distingue "mudou" de "0 linhas". Por isso
 * estes testes provam a presença do `.select('id')` no UPDATE: se ele desaparecer, os
 * casos de sucesso viram recusa e ficam vermelhos.
 *
 * Casos cobertos: lista vazia (nada de query), deduplicação, sucesso parcial (RLS),
 * UPDATE sem linhas = recusa (nunca sucesso), erro do SDK em TODOS os ids, erro no
 * SELECT que não vira lista vazia, contato invisível recusado, add/remove de tags,
 * não-mudança sem UPDATE, erro por linha isolado e a medida da fronteira (N+1).
 *
 * Fuso horário não se aplica (não há data). Lote grande/URL do `in()` fica em `it.todo`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));

import {
  applyContactFieldUpdate,
  applyContactTagChange,
  emptyOutcome,
  pendingIds,
} from '@/services/contact-bulk.service';

interface DbResult {
  data?: unknown;
  error?: unknown;
}
interface UpdateCall {
  payload: unknown;
  filters: Record<string, unknown>;
  selectColumns: string | null;
}
interface SelectCall {
  columns: string;
  filters: Record<string, unknown>;
}

let updateQueue: DbResult[] = [];
let selectQueue: DbResult[] = [];
let updateCalls: UpdateCall[] = [];
let selectCalls: SelectCall[] = [];
let tables: string[] = [];

/**
 * Dublê do builder do PostgREST:
 * - `update(payload)` come o próximo resultado da fila e devolve uma cadeia que aceita
 *   `.in()`/`.eq()`/`.select()`;
 * - sem `.select()`, aguardar a cadeia resolve `{ data: null }` (o PostgREST não devolve
 *   linhas sem `select`) — é o que faz o teste provar a linha de produção;
 * - com `.select()`, resolve `{ data, error }` da fila.
 */
function buildUpdateChain(result: DbResult, call: UpdateCall) {
  const chain = {
    in: (column: string, value: unknown) => {
      call.filters[column] = value;
      return chain;
    },
    eq: (column: string, value: unknown) => {
      call.filters[column] = value;
      return chain;
    },
    select: (columns: string) => {
      call.selectColumns = columns;
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
    },
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve({
        data: call.selectColumns ? result.data ?? null : null,
        error: result.error ?? null,
      }).then(onFulfilled, onRejected),
  };
  return chain;
}

function buildSelectChain(result: DbResult, call: SelectCall) {
  const chain = {
    in: (column: string, value: unknown) => {
      call.filters[column] = value;
      return chain;
    },
    eq: (column: string, value: unknown) => {
      call.filters[column] = value;
      return chain;
    },
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(
        onFulfilled,
        onRejected,
      ),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  updateQueue = [];
  selectQueue = [];
  updateCalls = [];
  selectCalls = [];
  tables = [];

  mocks.from.mockImplementation((table: string) => {
    tables.push(table);
    return {
      update: (payload: unknown) => {
        const call: UpdateCall = { payload, filters: {}, selectColumns: null };
        updateCalls.push(call);
        return buildUpdateChain(updateQueue.shift() ?? { data: null, error: null }, call);
      },
      select: (columns: string) => {
        const call: SelectCall = { columns, filters: {} };
        selectCalls.push(call);
        return buildSelectChain(selectQueue.shift() ?? { data: [], error: null }, call);
      },
    };
  });
});

describe('emptyOutcome / pendingIds', () => {
  it('emptyOutcome devolve listas NOVAS a cada chamada (mutar uma não afeta a outra)', () => {
    const first = emptyOutcome();
    const second = emptyOutcome();

    first.succeeded.push('c1');
    first.refused.push('c2');
    first.failed.push({ id: 'c3', error: 'x' });

    expect(second).toEqual({ succeeded: [], refused: [], failed: [] });
  });

  it('pendingIds junta recusados e falhos, na ordem (recusados primeiro)', () => {
    expect(
      pendingIds({
        succeeded: ['ok'],
        refused: ['r1', 'r2'],
        failed: [{ id: 'f1', error: 'e' }],
      }),
    ).toEqual(['r1', 'r2', 'f1']);
  });
});

describe('applyContactFieldUpdate', () => {
  it('lista vazia: devolve vazio e NÃO consulta o banco', async () => {
    const outcome = await applyContactFieldUpdate([], { assigned_to: null });

    expect(outcome).toEqual({ succeeded: [], refused: [], failed: [] });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('ids repetidos viram um único alvo no UPDATE', async () => {
    updateQueue.push({ data: [{ id: 'c1' }], error: null });

    await applyContactFieldUpdate(['c1', 'c1', 'c1'], { assigned_to: 'ag-1' });

    expect(tables).toEqual(['contacts']);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload).toEqual({ assigned_to: 'ag-1' });
    expect(updateCalls[0].filters.id).toEqual(['c1']);
  });

  it('só quem o UPDATE devolveu conta como sucesso; o resto é recusa (RLS parcial)', async () => {
    updateQueue.push({ data: [{ id: 'c1' }, { id: 'c3' }], error: null });

    const outcome = await applyContactFieldUpdate(['c1', 'c2', 'c3'], { queue_id: 'q-9' });

    expect(outcome.succeeded).toEqual(['c1', 'c3']);
    expect(outcome.refused).toEqual(['c2']);
    expect(outcome.failed).toEqual([]);
  });

  it('UPDATE que não afetou nenhuma linha (RLS silencioso) é RECUSA, nunca sucesso', async () => {
    updateQueue.push({ data: [], error: null });

    const outcome = await applyContactFieldUpdate(['c1', 'c2'], { queue_id: 'q-1' });

    expect(outcome.succeeded).toEqual([]);
    expect(outcome.refused).toEqual(['c1', 'c2']);
    expect(outcome.failed).toEqual([]);
  });

  it('data nulo do PostgREST também é recusa', async () => {
    updateQueue.push({ data: null, error: null });

    const outcome = await applyContactFieldUpdate(['c1'], { queue_id: 'q-1' });

    expect(outcome).toEqual({ succeeded: [], refused: ['c1'], failed: [] });
  });

  it('erro do SDK marca TODOS os ids como failed, com o mesmo erro, e nada como sucesso', async () => {
    const error = { message: 'permission denied for table contacts', code: '42501' };
    updateQueue.push({ data: null, error });

    const outcome = await applyContactFieldUpdate(['c1', 'c2'], { tags: ['x'] });

    expect(outcome.succeeded).toEqual([]);
    expect(outcome.refused).toEqual([]);
    expect(outcome.failed).toEqual([
      { id: 'c1', error },
      { id: 'c2', error },
    ]);
  });

  it('prova a fronteira: 1 UPDATE com `.in("id")` e `.select("id")` (é o select que distingue mudou de 0 linhas)', async () => {
    updateQueue.push({ data: [{ id: 'c1' }], error: null });

    await applyContactFieldUpdate(['c1', 'c2'], { assigned_to: 'ag-2' });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].selectColumns).toBe('id');
    expect(updateCalls[0].filters.id).toEqual(['c1', 'c2']);
  });
});

describe('applyContactTagChange', () => {
  it('lista vazia: devolve vazio e NÃO consulta o banco', async () => {
    const outcome = await applyContactTagChange([], { add: ['vip'] });

    expect(outcome).toEqual({ succeeded: [], refused: [], failed: [] });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('erro no SELECT vira failed para todos os ids e NENHUM UPDATE (o erro não vira lista vazia de tags)', async () => {
    const error = { message: 'rls select', code: '42501' };
    selectQueue.push({ data: null, error });

    const outcome = await applyContactTagChange(['c1', 'c2'], { add: ['vip'] });

    expect(outcome).toEqual({
      succeeded: [],
      refused: [],
      failed: [
        { id: 'c1', error },
        { id: 'c2', error },
      ],
    });
    expect(updateCalls).toEqual([]);
  });

  it('contato invisível no SELECT é RECUSADO e não recebe UPDATE', async () => {
    selectQueue.push({ data: [{ id: 'c1', tags: ['vip'] }], error: null });
    updateQueue.push({ data: [{ id: 'c1' }], error: null });

    const outcome = await applyContactTagChange(['c1', 'c2'], { add: ['novo'] });

    expect(tables).toEqual(['contacts', 'contacts']);
    expect(selectCalls[0].columns).toBe('id, tags');
    expect(selectCalls[0].filters.id).toEqual(['c1', 'c2']);
    expect(outcome.refused).toEqual(['c2']);
    expect(outcome.succeeded).toEqual(['c1']);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].filters.id).toBe('c1');
  });

  it('ids repetidos viram um único alvo no SELECT e no UPDATE', async () => {
    selectQueue.push({ data: [{ id: 'c1', tags: null }], error: null });
    updateQueue.push({ data: [{ id: 'c1' }], error: null });

    await applyContactTagChange(['c1', 'c1'], { add: ['vip'] });

    expect(selectCalls).toHaveLength(1);
    expect(selectCalls[0].filters.id).toEqual(['c1']);
    expect(updateCalls).toHaveLength(1);
  });

  it('adicionar tag preserva as atuais', async () => {
    selectQueue.push({ data: [{ id: 'c1', tags: ['vip', 'lead'] }], error: null });
    updateQueue.push({ data: [{ id: 'c1' }], error: null });

    await applyContactTagChange(['c1'], { add: ['novo'] });

    expect(updateCalls[0].payload).toEqual({ tags: ['vip', 'lead', 'novo'] });
    expect(updateCalls[0].selectColumns).toBe('id');
  });

  it('tags nulas (malformado/legado) são tratadas como lista vazia', async () => {
    selectQueue.push({ data: [{ id: 'c1', tags: null }], error: null });
    updateQueue.push({ data: [{ id: 'c1' }], error: null });

    await applyContactTagChange(['c1'], { add: ['vip'] });

    expect(updateCalls[0].payload).toEqual({ tags: ['vip'] });
  });

  it('remover tag tira só a pedida e preserva as demais', async () => {
    selectQueue.push({ data: [{ id: 'c1', tags: ['vip', 'lead', 'spam'] }], error: null });
    updateQueue.push({ data: [{ id: 'c1' }], error: null });

    await applyContactTagChange(['c1'], { remove: ['lead'] });

    expect(updateCalls[0].payload).toEqual({ tags: ['vip', 'spam'] });
  });

  it('adicionar tag que já existe não dispara UPDATE (nenhuma mudança real)', async () => {
    selectQueue.push({ data: [{ id: 'c1', tags: ['vip'] }], error: null });

    const outcome = await applyContactTagChange(['c1'], { add: ['vip'] });

    expect(updateCalls).toEqual([]);
    expect(outcome).toEqual({ succeeded: [], refused: [], failed: [] });
  });

  it('remover tag de contato sem tags não dispara UPDATE', async () => {
    selectQueue.push({ data: [{ id: 'c1', tags: null }], error: null });

    const outcome = await applyContactTagChange(['c1'], { remove: ['vip'] });

    expect(updateCalls).toEqual([]);
    expect(outcome.succeeded).toEqual([]);
  });

  it('tags duplicadas no banco são normalizadas no UPDATE', async () => {
    selectQueue.push({ data: [{ id: 'c1', tags: ['vip', 'vip'] }], error: null });
    updateQueue.push({ data: [{ id: 'c1' }], error: null });

    await applyContactTagChange(['c1'], { add: ['lead'] });

    expect(updateCalls[0].payload).toEqual({ tags: ['vip', 'lead'] });
  });

  it('UPDATE de 0 linhas (RLS) é RECUSA, não sucesso', async () => {
    selectQueue.push({ data: [{ id: 'c1', tags: [] }], error: null });
    updateQueue.push({ data: [], error: null });

    const outcome = await applyContactTagChange(['c1'], { add: ['vip'] });

    expect(outcome).toEqual({ succeeded: [], refused: ['c1'], failed: [] });
  });

  it('SELECT sem erro mas com data nulo trata todos como invisíveis (recusados)', async () => {
    selectQueue.push({ data: null, error: null });

    const outcome = await applyContactTagChange(['c1'], { add: ['vip'] });

    expect(outcome).toEqual({ succeeded: [], refused: ['c1'], failed: [] });
    expect(updateCalls).toEqual([]);
  });

  it('UPDATE sem erro e com data nulo também é recusa (0 linhas afetadas)', async () => {
    selectQueue.push({ data: [{ id: 'c1', tags: [] }], error: null });
    updateQueue.push({ data: null, error: null });

    const outcome = await applyContactTagChange(['c1'], { add: ['vip'] });

    expect(outcome).toEqual({ succeeded: [], refused: ['c1'], failed: [] });
  });

  it('erro no UPDATE de um contato não derruba os demais (isolamento por linha)', async () => {
    selectQueue.push({
      data: [
        { id: 'c1', tags: [] },
        { id: 'c2', tags: [] },
      ],
      error: null,
    });
    const error = { message: 'rls update' };
    updateQueue.push({ data: null, error });
    updateQueue.push({ data: [{ id: 'c2' }], error: null });

    const outcome = await applyContactTagChange(['c1', 'c2'], { add: ['vip'] });

    expect(outcome.failed).toEqual([{ id: 'c1', error }]);
    expect(outcome.succeeded).toEqual(['c2']);
    expect(outcome.refused).toEqual([]);
    expect(updateCalls).toHaveLength(2);
  });

  it('a soma soma adicionados E removidos na MESMA chamada', async () => {
    selectQueue.push({ data: [{ id: 'c1', tags: ['vip', 'spam'] }], error: null });
    updateQueue.push({ data: [{ id: 'c1' }], error: null });

    await applyContactTagChange(['c1'], { add: ['lead'], remove: ['spam'] });

    expect(updateCalls[0].payload).toEqual({ tags: ['vip', 'lead'] });
  });

  it('fronteira medida: 1 SELECT + 1 UPDATE por contato alterado (não é um UPDATE em lote)', async () => {
    selectQueue.push({
      data: [
        { id: 'c1', tags: [] },
        { id: 'c2', tags: [] },
        { id: 'c3', tags: [] },
      ],
      error: null,
    });
    updateQueue.push({ data: [{ id: 'c1' }], error: null });
    updateQueue.push({ data: [{ id: 'c2' }], error: null });
    updateQueue.push({ data: [{ id: 'c3' }], error: null });

    const outcome = await applyContactTagChange(['c1', 'c2', 'c3'], { add: ['vip'] });

    expect(selectCalls).toHaveLength(1);
    expect(updateCalls).toHaveLength(3);
    expect(updateCalls.map((c) => c.filters.id)).toEqual(['c1', 'c2', 'c3']);
    expect(outcome.succeeded).toEqual(['c1', 'c2', 'c3']);
  });

  it.todo(
    'lote grande (ex.: 2.000 ids) é fatiado em blocos — hoje o `.in("id")` vai numa URL só, que o PostgREST estoura em lotes grandes',
  );
});
