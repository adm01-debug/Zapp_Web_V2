/**
 * Testes do hook unificado de tarefas (Fase B, etapa 21).
 * Cobre: create, remind_in_past, complete + undo, WIP cheio, waiting sem motivo,
 * move com indice (upsert em lote), snooze (minutos e amanha 9h), setReminder,
 * rollback do update otimista e o badge do B6.
 *
 * Sem `any` e sem `@ts-nocheck`: o lint-ratchet nao aceita divida nova, entao as
 * implementacoes dos mocks usam parametros contextuais (o `vi.fn()` sem generico
 * ja tipa os argumentos) e as linhas do banco sao `Record<string, unknown>`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Row = Record<string, unknown>;
type SupabaseResult = { data?: Row[]; error?: unknown };
/** Builder encadeavel e "awaitable" — aceita qualquer ordem de encadeamento. */
type Chainable = Record<string, (...args: unknown[]) => Chainable> & {
  then: (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => Promise<unknown>;
};

// `vi.hoisted`: os factories do vi.mock rodam antes das consts do modulo.
const h = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
  undoToast: vi.fn(),
  auth: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: h.toast }));
vi.mock('@/lib/undoToast', () => ({ undoToast: h.undoToast }));
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => h.auth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => h.from(table),
    channel: (name: string) => h.channel(name),
    removeChannel: (ch: unknown) => h.removeChannel(ch),
  },
}));

import {
  useMyWorkItems,
  useMyWorkItemsBadge,
  workItemsKey,
  workItemsBadgeKey,
  tomorrowAtNine,
} from '@/hooks/tasks/useMyWorkItems';
import type { WorkItem } from '@/hooks/tasks/workItem.types';

const KEY = workItemsKey('u1');

function makeBuilder(result: unknown): Chainable {
  const q = {
    then: (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onOk, onErr),
  } as Chainable;
  for (const m of ['eq', 'neq', 'or', 'not', 'order', 'limit', 'is', 'in']) {
    q[m] = () => q;
  }
  return q;
}

let selectResult: unknown = { data: [], error: null };
let writeResult: unknown = { error: null };

function resetMocks() {
  vi.clearAllMocks();
  selectResult = { data: [], error: null };
  writeResult = { error: null };
  h.auth.mockReturnValue({ profile: { id: 'u1' } });
  h.channel.mockReturnValue({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  });
  h.from.mockImplementation(() => ({
    select: (cols: string) => { h.select(cols); return makeBuilder(selectResult); },
    insert: (row: unknown) => { h.insert(row); return makeBuilder(writeResult); },
    update: (patch: unknown) => { h.update(patch); return makeBuilder(writeResult); },
    upsert: (rows: unknown, opts: unknown) => { h.upsert(rows, opts); return makeBuilder(writeResult); },
  }));
}

function dbRow(over: Row = {}): Row {
  return {
    id: 't1',
    title: 'Ligar para o cliente',
    description: null,
    status: 'todo',
    priority: 'medium',
    due_date: null,
    remind_at: null,
    notified_at: null,
    waiting_reason: null,
    position: 0,
    started_at: null,
    status_changed_at: '2026-09-29T10:00:00.000Z',
    completed_at: null,
    contact_id: null,
    created_by: 'u1',
    assigned_to: 'u1',
    created_at: '2026-09-29T10:00:00.000Z',
    updated_at: '2026-09-29T10:00:00.000Z',
    contact: null,
    ...over,
  };
}

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function setup(items: Row[] = []) {
  selectResult = { data: items, error: null };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = renderHook(() => useMyWorkItems(), { wrapper: makeWrapper(qc) });
  return { ...view, qc };
}

async function ready(view: { result: { current: { isLoading: boolean } } }) {
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
}

describe('useMyWorkItems — Fase B', () => {
  beforeEach(resetMocks);

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
    expect((h.update.mock.calls[0][0] as Row).completed_at).toEqual(expect.any(String));
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
    const upsertRows = h.upsert.mock.calls[0][0] as Row[];
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

    const patch = h.update.mock.calls[0][0] as Row;
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

    const patch = h.update.mock.calls[0][0] as Row;
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
    let falhar: (v: unknown) => void = () => {};
    writeResult = new Promise((resolve) => { falhar = resolve; });

    const { result, qc } = setup([dbRow()]);
    await ready({ result });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    let promessa: Promise<unknown> = Promise.resolve();
    act(() => { promessa = result.current.update('t1', { title: 'Titulo novo' }); });

    // otimista: o cache ja mostra o titulo novo antes de o banco responder
    await waitFor(() => {
      const cache = qc.getQueryData<WorkItem[]>(KEY);
      expect(cache?.[0]?.title).toBe('Titulo novo');
    });

    await act(async () => {
      falhar({ error: { message: 'boom' } });
      await expect(promessa).rejects.toBeTruthy();
    });

    // rollback: voltou exatamente ao que estava
    const cache = qc.getQueryData<WorkItem[]>(KEY);
    expect(cache?.[0]?.title).toBe('Ligar para o cliente');
    expect(h.toast.error).toHaveBeenCalledWith('Erro ao atualizar tarefa');
  });

  it('badge soma atrasadas e avisos ja disparados e nao tratados (uma query)', async () => {
    const agora = Date.now();
    selectResult = {
      data: [
        { id: 'a', due_date: new Date(agora - 86_400_000).toISOString(), remind_at: null, notified_at: null, status: 'todo' },
        { id: 'b', due_date: new Date(agora + 86_400_000).toISOString(), remind_at: new Date(agora - 60_000).toISOString(), notified_at: '2026-09-29T09:00:00.000Z', status: 'todo' },
        { id: 'c', due_date: null, remind_at: new Date(agora - 60_000).toISOString(), notified_at: null, status: 'todo' },
      ],
      error: null,
    };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
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
});
