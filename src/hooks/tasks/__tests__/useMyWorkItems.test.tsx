/**
 * Testes do hook unificado de tarefas (Fase B, etapa 21).
 * Cobre: create, remind_in_past, complete + undo, WIP cheio, waiting sem motivo,
 * move com indice (upsert em lote), snooze (minutos e amanha 9h), setReminder,
 * rollback do update otimista, badge do B6 e o mapeamento do contato.
 *
 * Sem `any` e sem `@ts-nocheck`: o lint-ratchet nao aceita divida nova. O mock do
 * cliente Supabase vive em `@/test/mocks/tarefas`, compartilhado com o teste do
 * `TasksModule` (mesmo harness, sem duplicacao).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  supabaseMock as h,
  makeQueryClient,
  makeTaskRow,
  makeWrapper,
  resetSupabaseMock,
  setSelectResult,
  setWriteResult,
  getUltimaLeitura,
} from '@/test/mocks/tarefas';

import {
  useMyWorkItems,
  useMyWorkItemsBadge,
  workItemsKey,
  workItemsBadgeKey,
  tomorrowAtNine,
  DONE_WINDOW_DAYS,
} from '@/hooks/tasks/useMyWorkItems';
import type { WorkItem } from '@/hooks/tasks/workItem.types';

const KEY = workItemsKey('u1');
const dbRow = makeTaskRow;

function setup(items: Record<string, unknown>[] = []) {
  setSelectResult({ data: items, error: null });
  const qc = makeQueryClient();
  const view = renderHook(() => useMyWorkItems(), { wrapper: makeWrapper(qc) });
  return { ...view, qc };
}

async function ready(view: { result: { current: { isLoading: boolean } } }) {
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
}

describe('useMyWorkItems — Fase B', () => {
  beforeEach(resetSupabaseMock);

  it('create envia created_by e assigned_to do perfil autenticado', async () => {
    const { result } = setup();
    await ready({ result });
    await act(async () => { await result.current.create({ title: 'Nova tarefa' }); });

    expect(h.insert).toHaveBeenCalledTimes(1);
    expect(h.insert.mock.calls[0][0]).toMatchObject({
      title: 'Nova tarefa',
      created_by: 'u1',
      assigned_to: 'u1',
      status: 'backlog',
      priority: 'medium',
    });
    expect(h.toast.success).toHaveBeenCalledWith('Tarefa criada');
  });

  it('create recusa aviso no passado (remind_in_past) sem tocar no banco', async () => {
    const { result } = setup();
    await ready({ result });
    const passado = new Date(Date.now() - 10 * 60_000).toISOString();

    await act(async () => {
      await expect(result.current.create({ title: 'X', remindAt: passado })).rejects.toMatchObject({
        blocked: 'remind_in_past',
      });
    });
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.toast.error).toHaveBeenCalledWith('O horario do aviso ja passou');
  });

  it('complete move para done e oferece undo', async () => {
    const { result } = setup([dbRow()]);
    await ready({ result });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => { await result.current.complete(result.current.items[0]); });

    expect(h.update.mock.calls[0][0]).toMatchObject({ status: 'done' });
    expect((h.update.mock.calls[0][0] as Record<string, unknown>).completed_at).toEqual(expect.any(String));
    expect(h.undoToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Tarefa concluida' })
    );
  });

  it('move bloqueia com Fazendo cheio sem chamar o banco', async () => {
    const rows = [
      dbRow({ id: 'd1', status: 'doing' }),
      dbRow({ id: 'd2', status: 'doing' }),
      dbRow({ id: 'd3', status: 'doing' }),
      dbRow({ id: 't1', status: 'todo' }),
    ];
    const { result } = setup(rows);
    await ready({ result });
    await waitFor(() => expect(result.current.items).toHaveLength(4));

    const item = result.current.items.find((i) => i.id === 't1')!;
    await act(async () => {
      await expect(result.current.move(item, 'doing')).rejects.toMatchObject({ blocked: 'wip_full' });
    });

    expect(h.update).not.toHaveBeenCalled();
    expect(h.toast.error).toHaveBeenCalledWith(expect.stringContaining('Limite de Fazendo'));
  });

  it('move para waiting sem motivo bloqueia sem chamar o banco', async () => {
    const { result } = setup([dbRow()]);
    await ready({ result });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      await expect(result.current.move(result.current.items[0], 'waiting')).rejects.toMatchObject({
        blocked: 'waiting_reason_required',
      });
    });
    expect(h.update).not.toHaveBeenCalled();
  });

  it('move com index persiste a ordem das duas colunas num unico upsert', async () => {
    const rows = [
      dbRow({ id: 'a', status: 'todo', position: 0 }),
      dbRow({ id: 'b', status: 'todo', position: 1 }),
      dbRow({ id: 'c', status: 'doing', position: 0 }),
      dbRow({ id: 'm', status: 'todo', position: 2 }),
    ];
    const { result } = setup(rows);
    await ready({ result });
    await waitFor(() => expect(result.current.items).toHaveLength(4));

    const item = result.current.items.find((i) => i.id === 'm')!;
    await act(async () => { await result.current.move(item, 'doing', { index: 0 }); });

    expect(h.update.mock.calls[0][0]).toMatchObject({ status: 'doing' });
    expect(h.upsert).toHaveBeenCalledTimes(1);
    const upsertRows = h.upsert.mock.calls[0][0] as Record<string, unknown>[];
    expect(h.upsert.mock.calls[0][1]).toEqual({ onConflict: 'id' });
    // destino (doing) renumerado com o item movido na frente
    expect(upsertRows[0]).toMatchObject({ id: 'm', position: 0 });
    expect(upsertRows[1]).toMatchObject({ id: 'c', position: 1 });
    // origem (todo) renumerada sem o item movido
    expect(upsertRows[2]).toMatchObject({ id: 'a', position: 0 });
    expect(upsertRows[3]).toMatchObject({ id: 'b', position: 1 });
    // title/created_by viajam para o upsert nao esbarrar nos NOT NULL
    expect(upsertRows[0].title).toBe('Ligar para o cliente');
    expect(upsertRows[0].created_by).toBe('u1');
  });

  it('snooze(30) empurra remind_at e zera notified_at', async () => {
    const { result } = setup([dbRow({ notified_at: '2026-09-29T09:00:00.000Z' })]);
    await ready({ result });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    const antes = Date.now();
    await act(async () => { await result.current.snooze(result.current.items[0], 30); });

    const patch = h.update.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.notified_at).toBeNull();
    const alvo = new Date(String(patch.remind_at)).getTime();
    expect(alvo).toBeGreaterThanOrEqual(antes + 29 * 60_000);
    expect(alvo).toBeLessThanOrEqual(Date.now() + 31 * 60_000);
  });

  it("snooze('tomorrow9') agenda amanha as 09:00 locais", async () => {
    const { result } = setup([dbRow()]);
    await ready({ result });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => { await result.current.snooze(result.current.items[0], 'tomorrow9'); });

    const patch = h.update.mock.calls[0][0] as Record<string, unknown>;
    const alvo = new Date(String(patch.remind_at));
    const esperado = tomorrowAtNine();
    expect(alvo.getHours()).toBe(9);
    expect(alvo.getMinutes()).toBe(0);
    expect(alvo.getDate()).toBe(esperado.getDate());
  });

  it('setReminder recusa horario no passado alem da tolerancia', async () => {
    const { result } = setup([dbRow()]);
    await ready({ result });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    const passado = new Date(Date.now() - 5 * 60_000).toISOString();
    await act(async () => {
      await expect(result.current.setReminder(result.current.items[0], passado)).rejects.toMatchObject({
        blocked: 'remind_in_past',
      });
    });
    expect(h.update).not.toHaveBeenCalled();
  });

  it('update otimista aplica no cache e volta ao anterior quando o banco falha', async () => {
    setWriteResult({ error: { message: 'boom' } });
    const { result, qc } = setup([dbRow()]);
    await ready({ result });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    // espia as duas vias do cache: `setQueriesData` (patch otimista) e
    // `setQueryData` (restauracao do snapshot no onError)
    const patchOtimista = vi.spyOn(qc, 'setQueriesData');
    const restauracao = vi.spyOn(qc, 'setQueryData');

    await act(async () => {
      await expect(result.current.update('t1', { title: 'Titulo novo' })).rejects.toBeTruthy();
    });

    // otimista: o updater aplicado ao estado anterior produz o titulo novo
    const updaters = patchOtimista.mock.calls.map(([, u]) => u as (o: unknown) => unknown);
    const antes = [dbRow() as unknown as WorkItem];
    expect(updaters.some((u) => JSON.stringify(u(antes)).includes('Titulo novo'))).toBe(true);
    // A restauracao tem que devolver o snapshot ORIGINAL para o cache. So
    // `toHaveBeenCalled()` era vacuoso: `setQueriesData` chama `setQueryData`
    // internamente (queryClient.js), entao o proprio patch otimista satisfazia
    // o espiao — e o refetch do `onSettled` repunha o valor. Sem esta checagem
    // de valor, anular o rollback deixava a suite inteira verde.
    const restaurouValorOriginal = restauracao.mock.calls.some((args) => {
      const valor = args[1] as Array<{ title?: string }> | undefined;
      return Array.isArray(valor) && valor[0]?.title === 'Ligar para o cliente';
    });
    expect(restaurouValorOriginal).toBe(true);

    // rollback: voltou exatamente ao que estava
    const cache = qc.getQueryData<WorkItem[]>(KEY);
    expect(cache?.[0]?.title).toBe('Ligar para o cliente');
    expect(h.toast.error).toHaveBeenCalledWith('Erro ao atualizar tarefa');
  });

  it('badge soma atrasadas e avisos ja disparados e nao tratados (uma query)', async () => {
    const agora = Date.now();
    setSelectResult({
      data: [
        { id: 'a', due_date: new Date(agora - 86_400_000).toISOString(), remind_at: null, notified_at: null, status: 'todo' },
        { id: 'b', due_date: new Date(agora + 86_400_000).toISOString(), remind_at: new Date(agora - 60_000).toISOString(), notified_at: '2026-09-29T09:00:00.000Z', status: 'todo' },
        { id: 'c', due_date: null, remind_at: new Date(agora - 60_000).toISOString(), notified_at: null, status: 'todo' },
      ],
      error: null,
    });
    const qc = makeQueryClient();
    const { result } = renderHook(() => useMyWorkItemsBadge(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current).toBe(2));
    // 2 round-trips viraram 1
    expect(h.select).toHaveBeenCalledTimes(1);
    expect(h.select.mock.calls[0][0]).toBe('id,due_date,remind_at,notified_at,status');
    expect(workItemsBadgeKey('u1')).toEqual(['work-items-badge', 'u1']);
  });

  it('create coloca o item no topo da coluna (position = min - 1)', async () => {
    const { result } = setup([
      dbRow({ id: 'a', status: 'backlog', position: 5 }),
      dbRow({ id: 'b', status: 'todo', position: 0 }),
    ]);
    await ready({ result });
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    await act(async () => { await result.current.create({ title: 'Topo' }); });

    expect(h.insert.mock.calls[0][0]).toMatchObject({ status: 'backlog', position: 4 });
  });

  it('mapeia o contato embutido no join para item.contact (etapa 13)', async () => {
    const row = dbRow({
      contact_id: 'ff9a9634-0000-0000-0000-000000000000',
      contact: { id: 'ff9a9634-0000-0000-0000-000000000000', name: 'Maria Souza', phone: '+5511999999999', avatar_url: null },
    });
    const { result } = setup([row]);
    await ready({ result });

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0].contact?.name).toBe('Maria Souza');
    expect(result.current.items[0].contact?.phone).toBe('+5511999999999');
    // a query pede o join por FK explicita (uma unica ida ao banco)
    expect(String(h.select.mock.calls[0][0])).toContain('contact:contacts!conversation_tasks_contact_id_fkey');
  });

  it('snooze e complete invalidam o badge (etapa 19: badge cai a 0)', async () => {
    const { result, qc } = setup([dbRow()]);
    await ready({ result });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    const spy = vi.spyOn(qc, 'invalidateQueries');
    await act(async () => { await result.current.snooze(result.current.items[0], 60); });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['work-items-badge', 'u1'] });

    spy.mockClear();
    await act(async () => { await result.current.complete(result.current.items[0]); });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['work-items-badge', 'u1'] });
  });

  it('a query limita done a 30 dias, inclui done sem carimbo e exclui cancelled (B13)', async () => {
    const { result } = setup();
    await ready({ result });

    const leitura = getUltimaLeitura();
    expect(leitura).not.toBeNull();

    const filtros = (leitura?.or.mock.calls ?? []).map((c) => String(c[0]));
    const or = filtros.find((f) => f.includes('status.neq.done')) ?? '';

    // done so entra nos ultimos DONE_WINDOW_DAYS dias...
    expect(or).toContain('status.neq.done');
    const corteIso = or.split('completed_at.gte.')[1]?.split(',')[0] ?? '';
    expect(corteIso).not.toBe('');
    const dias = (Date.now() - new Date(corteIso).getTime()) / 86_400_000;
    expect(dias).toBeGreaterThan(DONE_WINDOW_DAYS - 0.01);
    expect(dias).toBeLessThan(DONE_WINDOW_DAYS + 0.01);

    // ...mas `done` legado sem carimbo de conclusao continua visivel (o trigger
    // de estado so grava completed_at em UPDATE);
    expect(or).toContain('completed_at.is.null');

    // cancelled fica de fora por padrao.
    expect(leitura?.not).toHaveBeenCalledWith('status', 'eq', 'cancelled');
  });

  // --- R2-MOD-053: Desfazer (undo) tem de restaurar TODO o estado ------------
  // O trigger do banco zera remind_at/notified_at ao entrar em done/cancelled
  // (supabase/migrations/20260928140000_tasks_unify_reminders_kanban.sql). O
  // undo precisa reescrever esses campos a partir do snapshot; sem isso o alarme
  // some e o toast anuncia sucesso antes de a escrita confirmar.

  /** `onUndo` da enesima chamada a `undoToast` (mensagem + callback). */
  function undoDe(indice = 0): () => Promise<void> {
    const arg = h.undoToast.mock.calls[indice][0] as { onUndo: () => Promise<void> };
    return arg.onUndo;
  }

  it('cancelar e desfazer restaura status, carimbo e o alarme anterior (#421)', async () => {
    const original = dbRow({
      id: 't1',
      status: 'todo',
      remind_at: '2026-10-07T12:00:00.000Z',
      notified_at: null,
    });
    const { result } = setup([original]);
    await ready({ result });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    setWriteResult({ data: [{ id: 't1' }], error: null });
    await act(async () => { await result.current.cancel(result.current.items[0]); });

    const undo = undoDe();
    await act(async () => { await undo(); });

    // calls[0] = cancelamento (status cancelled); calls[1] = reversao.
    const patch = h.update.mock.calls[1][0] as Record<string, unknown>;
    expect(patch).toMatchObject({
      status: 'todo',
      completed_at: null,
      remind_at: '2026-10-07T12:00:00.000Z',
      notified_at: null,
    });
  });

  it('concluir e desfazer devolve ao estado anterior (doing) e restaura o alarme (#421)', async () => {
    const original = dbRow({
      id: 't1',
      status: 'doing',
      started_at: '2026-10-06T09:00:00.000Z',
      remind_at: '2026-10-07T12:00:00.000Z',
    });
    const { result } = setup([original]);
    await ready({ result });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    setWriteResult({ data: [{ id: 't1' }], error: null });
    await act(async () => { await result.current.complete(result.current.items[0]); });

    const undo = undoDe();
    await act(async () => { await undo(); });

    // calls[0] = conclusao (status done); calls[1] = reversao ao estado anterior.
    const patch = h.update.mock.calls[1][0] as Record<string, unknown>;
    expect(patch).toMatchObject({
      status: 'doing',
      completed_at: null,
      remind_at: '2026-10-07T12:00:00.000Z',
    });
  });

  it('desfazer que nao afeta nenhuma linha falha em vez de passar como sucesso (#421)', async () => {
    const original = dbRow({ id: 't1', status: 'todo', remind_at: '2026-10-07T12:00:00.000Z' });
    const { result } = setup([original]);
    await ready({ result });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => { await result.current.cancel(result.current.items[0]); });
    const undo = undoDe();

    // RLS/where sem match: a escrita nao muda nada (0 linhas) mas nao lanca erro.
    setWriteResult({ data: [], error: null });
    await act(async () => {
      await expect(undo()).rejects.toBeTruthy();
    });
  });

  it('desfazer com erro do banco propaga a falha (nao passa como sucesso) (#421)', async () => {
    const original = dbRow({ id: 't1', status: 'todo' });
    const { result } = setup([original]);
    await ready({ result });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => { await result.current.cancel(result.current.items[0]); });
    const undo = undoDe();

    setWriteResult({ data: null, error: { message: 'permission denied', code: '42501' } });
    await act(async () => {
      await expect(undo()).rejects.toMatchObject({ message: 'permission denied' });
    });
  });
});
