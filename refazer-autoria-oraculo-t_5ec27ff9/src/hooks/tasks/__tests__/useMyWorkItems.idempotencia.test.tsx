/**
 * IA-047 — comportamento IDEMPOTENTE da criação de tarefa.
 *
 * O que fica provado aqui (e que a mutação derruba):
 *   - dois submits do MESMO clique (mesma `clientTaskId`) geram UM insert só:
 *     o payload carrega `client_task_id` e a segunda chamada reusa a promise em
 *     voo (remover a chave ⇒ 2 inserts e o caso falha);
 *   - a violação de unicidade (23505) é lida como "já criado" (sucesso, sem
 *     toast de erro), enquanto um erro de outra natureza continua sendo erro;
 *   - todo insert carrega uma chave (uuid) — mesmo sem `clientTaskId` explícita.
 *
 * Sem `any` e sem `@ts-nocheck`: o lint-ratchet não aceita dívida nova. O mock
 * do cliente Supabase é o harness compartilhado `@/test/mocks/tarefas`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  supabaseMock as h,
  makeQueryClient,
  makeWrapper,
  resetSupabaseMock,
  setSelectResult,
  setWriteResult,
} from '@/test/mocks/tarefas';

import { useMyWorkItems } from '@/hooks/tasks/useMyWorkItems';

const KEY = '11111111-1111-4111-8111-111111111111';

function setup() {
  setSelectResult({ data: [], error: null });
  const qc = makeQueryClient();
  return renderHook(() => useMyWorkItems(), { wrapper: makeWrapper(qc) });
}

async function ready(view: { result: { current: { isLoading: boolean } } }) {
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
}

describe('useMyWorkItems — idempotência (IA-047)', () => {
  beforeEach(resetSupabaseMock);

  it('duplo submit com a MESMA clientTaskId gera 1 único insert', async () => {
    const { result } = setup();
    await ready({ result });

    await act(async () => {
      const p1 = result.current.create({ title: 'Tarefa IA', contactId: 'c1', clientTaskId: KEY });
      const p2 = result.current.create({ title: 'Tarefa IA', contactId: 'c1', clientTaskId: KEY });
      await Promise.all([p1, p2]);
    });

    // Mutação (remover a chave): o dedupe morre e este número vira 2.
    expect(h.insert).toHaveBeenCalledTimes(1);
    expect(h.insert.mock.calls[0][0]).toMatchObject({ client_task_id: KEY, title: 'Tarefa IA' });
  });

  it('cada insert carrega uma chave (uuid) mesmo sem clientTaskId explícita', async () => {
    const { result } = setup();
    await ready({ result });

    await act(async () => { await result.current.create({ title: 'Sem chave' }); });

    const row = h.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(typeof row.client_task_id).toBe('string');
    expect(String(row.client_task_id).length).toBeGreaterThan(0);
  });

  it('chaves diferentes abrem inserts diferentes (é a chave que deduplica)', async () => {
    const { result } = setup();
    await ready({ result });

    await act(async () => {
      await result.current.create({ title: 'A', clientTaskId: 'k-a' });
      await result.current.create({ title: 'B', clientTaskId: 'k-b' });
    });

    expect(h.insert).toHaveBeenCalledTimes(2);
  });

  it('violação de unicidade (23505) vira "já criado": sucesso, sem toast de erro', async () => {
    setWriteResult({ error: { message: 'duplicate key value violates unique constraint', code: '23505' } });
    const { result } = setup();
    await ready({ result });

    await act(async () => {
      await result.current.create({ title: 'Repetida', clientTaskId: 'k-dup' });
    });

    expect(h.toast.error).not.toHaveBeenCalled();
    expect(h.toast.success).toHaveBeenCalledWith('Tarefa criada');
  });

  it('erro que NÃO é 23505 continua sendo erro (toast genérico)', async () => {
    setWriteResult({ error: { message: 'permission denied', code: '42501' } });
    const { result } = setup();
    await ready({ result });

    await act(async () => {
      await expect(result.current.create({ title: 'X', clientTaskId: 'k-err' })).rejects.toBeTruthy();
    });

    expect(h.toast.error).toHaveBeenCalledWith('Erro ao criar tarefa');
    expect(h.toast.success).not.toHaveBeenCalled();
  });
});
