/**
 * Testes do `useInboxBulkActions` (ações em massa da caixa de entrada).
 *
 * O alvo é o HOOK REAL. A fronteira dublada é a rede (cliente Supabase), o sistema de
 * desfazer (`useUndoableAction`, que é OUTRO hook — não o alvo) e o toast. O dublê de
 * banco grava a operação, o payload e os filtros de cada chamada, então os casos provam
 * o que o hook manda para o banco, não só o toast.
 *
 * Casos cobertos: estado inicial, modo de seleção (intocabilidade dos Sets),
 * `selectAll` com deduplicação e lista vazia, marcar como lido (filtro por
 * `sender='contact'` + contatos, não lidos e erro), transferência via RPC
 * atômica `transfer_conversation` POR contato (agente/fila, nota ignorada,
 * sucesso parcial e total que rejeitam mantendo a seleção, rejeição crua de
 * rede), arquivamento desfazível (retrato da seleção, restauração por contato,
 * erro, e o SELECT de RLS em `it.fails`), avatares em lote (contadores, resposta
 * sem números, erro `Error` e rejeição não-`Error`), e o `loading` durante a
 * operação.
 *
 * Fuso horário e paginação não se aplicam (não há data nem leitura paginada aqui).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

interface DbResult {
  data?: unknown;
  error?: unknown;
}
interface RecordedCall {
  table: string;
  op: 'select' | 'update';
  payload?: unknown;
  columns?: string;
  filters: Record<string, unknown>;
}
interface UndoOptions {
  successMessage: string;
  undoMessage?: string;
  action: () => Promise<unknown>;
  undoAction: () => Promise<void>;
  onCommit?: () => void;
}

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  execute: vi.fn(),
  invoke: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/hooks/system/useUndoableAction', () => ({
  useUndoableAction: () => ({ execute: mocks.execute }),
}));
// O hook só usa o TIPO `ConversationWithMessages` deste módulo; o dublê evita puxar a
// cadeia de Realtime para dentro do teste.
vi.mock('@/hooks/chat/useRealtimeMessages', () => ({}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc, functions: { invoke: mocks.invoke } },
}));

import { useInboxBulkActions } from '@/hooks/inbox/useInboxBulkActions';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import type { ContactRow } from '@/types/contact';

let updateQueue: DbResult[] = [];
let selectQueue: DbResult[] = [];
let recorded: RecordedCall[] = [];
let updateGate: Promise<void> | null = null;
let lastUndo: UndoOptions | null = null;
// Estado da RPC de transferência: cada `p_contact_id` pode falhar de forma
// independente, então o mapa abaixo permite provar o caminho de sucesso PARCIAL.
let rpcFailures: Record<string, unknown> = {};
let rpcCalls: { name: string; args: Record<string, unknown> }[] = [];

function buildChain(
  call: RecordedCall,
  result: DbResult,
  opts: { delayUntil?: Promise<void> | null } = {},
) {
  const chain = {
    in: (column: string, value: unknown) => {
      call.filters[column] = value;
      return chain;
    },
    eq: (column: string, value: unknown) => {
      call.filters[column] = value;
      return chain;
    },
    // `.select()` devolve a MESMA cadeia promissória: o `delayUntil` (voo
    // controlado) também vale quando o UPDATE pede as linhas de volta.
    select: () => chain,
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
      const base = opts.delayUntil ? opts.delayUntil.then(() => result) : Promise.resolve(result);
      return base.then(onFulfilled, onRejected);
    },
  };
  return chain;
}

// `contacts.id` é uuid, e o lote agora corta id que não é uuid antes de gravar
// (um JID/link direto faria o PostgREST responder 400). Cada rótulo curto do
// teste é, portanto, um uuid estável — os nomes `c1`/`c2`/`c3` seguem os mesmos
// cenários de antes.
const c1 = '11111111-1111-4111-8111-111111111111';
const c2 = '22222222-2222-4222-8222-222222222222';
const c3 = '33333333-3333-4333-8333-333333333333';

function conversation(contactId: string, name = `Contato ${contactId}`): ConversationWithMessages {
  return {
    contact: { id: contactId, name, phone: '+5511900000000' } as unknown as ContactRow,
    messages: [],
    unreadCount: 0,
    lastMessage: null,
  };
}

function renderInbox(convs: ConversationWithMessages[] = []) {
  const refetch = vi.fn();
  const rendered = renderHook(() =>
    useInboxBulkActions({ refetch, filteredConversations: convs }),
  );
  return { ...rendered, refetch };
}

// Igual ao `renderInbox`, mas permite TROCAR a lista filtrada entre renderizações
// (props iniciais + `rerender`), que é o que prova a poda da seleção no filtro.
function renderInboxComFiltro(initial: ConversationWithMessages[]) {
  const refetch = vi.fn();
  const rendered = renderHook(
    ({ convs }: { convs: ConversationWithMessages[] }) =>
      useInboxBulkActions({ refetch, filteredConversations: convs }),
    { initialProps: { convs: initial } },
  );
  return { ...rendered, refetch };
}

function selectIds(result: { current: ReturnType<typeof useInboxBulkActions> }, ids: string[]) {
  if (!result.current.selectionMode) act(() => result.current.toggleSelectionMode());
  for (const id of ids) act(() => result.current.toggleSelection(id));
}

function contactUpdates() {
  return recorded.filter((call) => call.op === 'update' && call.table === 'contacts');
}

beforeEach(() => {
  vi.clearAllMocks();
  updateQueue = [];
  selectQueue = [];
  recorded = [];
  updateGate = null;
  lastUndo = null;
  rpcFailures = {};
  rpcCalls = [];

  mocks.execute.mockImplementation(async (options: UndoOptions) => {
    lastUndo = options;
    await options.action();
  });
  mocks.invoke.mockResolvedValue({ data: { updated: 0, processed: 0 }, error: null });
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
    const failure = rpcFailures[args.p_contact_id as string];
    if (failure) return { data: null, error: failure };
    return { data: `event-${args.p_contact_id as string}`, error: null };
  });

  mocks.from.mockImplementation((table: string) => ({
    update: (payload: unknown) => {
      const call: RecordedCall = { table, op: 'update', payload, filters: {} };
      recorded.push(call);
      return buildChain(call, updateQueue.shift() ?? { data: null, error: null }, {
        delayUntil: updateGate,
      });
    },
    select: (columns: string) => {
      const call: RecordedCall = { table, op: 'select', columns, filters: {} };
      recorded.push(call);
      return buildChain(call, selectQueue.shift() ?? { data: [], error: null });
    },
  }));
});
describe('ADV bulkArchive undo', () => {
  it('ADV1 mistura open/waiting/resolved e falha no passo 2 do resolved: refetch deve ser chamado (UI consistente)', async () => {
    selectQueue.push({ data: [
      { id: c1, conversation_status: 'open' },
      { id: c2, conversation_status: 'waiting' },
      { id: c3, conversation_status: 'resolved' },
    ], error: null });
    const { result, refetch } = renderInbox();
    selectIds(result, [c1, c2, c3]);
    await act(async () => { await result.current.bulkArchive(); });
    refetch.mockClear();
    // updates no undo: [direct open c1] ok, [passo1 c2,c3 open] ok, [waiting c2] ok, [resolved c3] FALHA, [fallback]
    updateQueue.push({ error: null }, { error: null }, { error: null }, { error: { message: 'Invalid conversation_status transition' } }, { error: null });
    let thrown: unknown = null;
    await act(async () => { try { await lastUndo?.undoAction(); } catch (e) { thrown = e; } });
    const restores = contactUpdates().slice(1);
    console.log('ADV1 restores', JSON.stringify(restores.map(r => [r.payload, r.filters])));
    console.log('ADV1 thrown', JSON.stringify(thrown), 'refetch calls', refetch.mock.calls.length);
    expect(refetch).toHaveBeenCalled();
  });

  it('ADV2 o undo não filtra por status atual (archived): conversa reaberta por mensagem nova é forçada de volta a resolved', async () => {
    selectQueue.push({ data: [{ id: c3, conversation_status: 'resolved' }], error: null });
    const { result } = renderInbox();
    selectIds(result, [c3]);
    await act(async () => { await result.current.bulkArchive(); });
    await act(async () => { await lastUndo?.undoAction(); });
    const restores = contactUpdates().slice(1);
    console.log('ADV2 filtros', JSON.stringify(restores.map(r => r.filters)));
    expect(restores.every(r => r.filters.conversation_status === 'archived')).toBe(true);
  });

  it('ADV3 original null vira open (direto, um passo)', async () => {
    selectQueue.push({ data: [{ id: c1, conversation_status: null }], error: null });
    const { result } = renderInbox();
    selectIds(result, [c1]);
    await act(async () => { await result.current.bulkArchive(); });
    await act(async () => { await lastUndo?.undoAction(); });
    const restores = contactUpdates().slice(1);
    expect(restores).toHaveLength(1);
    expect(restores[0].payload).toEqual({ conversation_status: 'open' });
  });

  it('ADV4 erro no SELECT: toast genérico, sem throw e sem UPDATE', async () => {
    selectQueue.push({ data: null, error: { message: 'permission denied for table contacts' } });
    const { result } = renderInbox();
    selectIds(result, [c1]);
    await act(async () => { await result.current.bulkArchive(); });
    expect(mocks.toast.error).toHaveBeenCalledWith('Não foi possível verificar o estado das conversas');
    expect(JSON.stringify(mocks.toast.error.mock.calls)).not.toContain('permission denied');
    expect(contactUpdates()).toHaveLength(0);
  });
});
