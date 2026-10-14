/**
 * Testes do `useInboxBulkActions` (ações em massa da caixa de entrada).
 *
 * O alvo é o HOOK REAL. A fronteira dublada é a rede (cliente Supabase), o sistema de
 * desfazer (`useUndoableAction`, que é OUTRO hook — não o alvo) e o toast. O dublê de
 * banco grava a operação, o payload e os filtros de cada chamada, então os casos provam
 * o que o hook manda para o banco, não só o toast.
 *
 * Casos cobertos: estado inicial, modo de seleção (intocabilidade dos Sets),
 * `selectAll` com deduplicação e lista vazia, marcar como lido (contatos, não lidos e
 * erro), transferência (agente/fila, mensagem ignorada, sem seleção, erro), arquivamento
 * desfazível (retrato da seleção, restauração por contato, erro, e o SELECT de RLS em
 * `it.fails`), avatares em lote (contadores, resposta sem números, erro `Error` e
 * rejeição não-`Error`), e o `loading` durante a operação.
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
  message: string;
  icon?: string;
  onUndo: () => Promise<void>;
  delay?: number;
}

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  undoToast: vi.fn(),
  invoke: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));
// O desfazer em si (lib) é OUTRO módulo, não o alvo: aqui gravamos a última
// chamada para poder disparar o `onUndo` na mão e provar o que ele reverte.
vi.mock('@/lib/undoToast', () => ({ undoToast: mocks.undoToast }));
// O hook só usa o TIPO `ConversationWithMessages` deste módulo; o dublê evita puxar a
// cadeia de Realtime para dentro do teste.
vi.mock('@/hooks/chat/useRealtimeMessages', () => ({}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mocks.from, functions: { invoke: mocks.invoke }, rpc: mocks.rpc },
}));

import { useInboxBulkActions } from '@/hooks/inbox/useInboxBulkActions';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import type { ContactRow } from '@/types/contact';

let updateQueue: DbResult[] = [];
let recorded: RecordedCall[] = [];
let updateGate: Promise<void> | null = null;
let lastUndo: UndoOptions | null = null;
let rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
/** Erros por nome de RPC, consumidos em ordem (um por chamada). */
let rpcErrors = new Map<string, unknown[]>();

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
    select: () => {
      const base = opts.delayUntil ? opts.delayUntil.then(() => result) : Promise.resolve(result);
      return base.then((r) => ({ data: r.data ?? null, error: r.error ?? null }));
    },
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
      const base = opts.delayUntil ? opts.delayUntil.then(() => result) : Promise.resolve(result);
      return base.then(onFulfilled, onRejected);
    },
  };
  return chain;
}

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
  recorded = [];
  updateGate = null;
  lastUndo = null;
  rpcCalls = [];
  rpcErrors = new Map();

  // O desfazer é capturado, não acionado: os casos chamam `onUndo` na mão.
  mocks.undoToast.mockImplementation((options: UndoOptions) => {
    lastUndo = options;
  });
  mocks.invoke.mockResolvedValue({ data: { updated: 0, processed: 0 }, error: null });
  mocks.rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
    const queued = rpcErrors.get(name);
    const error = queued && queued.length > 0 ? queued.shift() : null;
    return Promise.resolve({ data: null, error });
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
      return buildChain(call, { data: [], error: null });
    },
  }));
});

describe('useInboxBulkActions — seleção', () => {
  it('estado inicial: fora do modo de seleção, sem ids e sem loading', () => {
    const { result } = renderInbox();

    expect(result.current.selectionMode).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.bulkLoading).toBe(false);
    expect(result.current.fetchingAvatars).toBe(false);
  });

  it('toggleSelectionMode liga e, ao desligar, limpa a seleção', () => {
    const { result } = renderInbox();

    act(() => result.current.toggleSelectionMode());
    expect(result.current.selectionMode).toBe(true);

    act(() => result.current.toggleSelection('c1'));
    expect(result.current.selectedIds.has('c1')).toBe(true);

    act(() => result.current.toggleSelectionMode());
    expect(result.current.selectionMode).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('toggleSelection alterna o id e devolve um Set NOVO (não muta o anterior)', () => {
    const { result } = renderInbox();

    act(() => result.current.toggleSelection('c1'));
    const antes = result.current.selectedIds;

    act(() => result.current.toggleSelection('c2'));
    expect(antes.has('c2')).toBe(false);
    expect(result.current.selectedIds).toEqual(new Set(['c1', 'c2']));

    act(() => result.current.toggleSelection('c2'));
    expect(result.current.selectedIds).toEqual(new Set(['c1']));
  });

  it('selectAll entra no modo de seleção, pega todos os contatos e DEDUPLICA', () => {
    const { result } = renderInbox([
      conversation('c1'),
      conversation('c2'),
      conversation('c1'),
    ]);

    act(() => result.current.selectAll());

    expect(result.current.selectionMode).toBe(true);
    expect(result.current.selectedIds).toEqual(new Set(['c1', 'c2']));
    expect(mocks.toast.success).toHaveBeenCalledWith('2 conversa(s) selecionada(s)');
  });

  it('selectAll com a lista vazia avisa zero e não seleciona nada', () => {
    const { result } = renderInbox();

    act(() => result.current.selectAll());

    expect(result.current.selectedIds.size).toBe(0);
    expect(mocks.toast.success).toHaveBeenCalledWith('0 conversa(s) selecionada(s)');
  });

  it('selectAll já dentro do modo de seleção re-seleciona tudo sem sair do modo', () => {
    const { result } = renderInbox([conversation('c1'), conversation('c2')]);

    act(() => result.current.selectAll());
    act(() => result.current.toggleSelection('c1'));
    expect(result.current.selectedIds).toEqual(new Set(['c2']));

    // Já está em selectionMode: cai no ramo "não precisa ligar de novo".
    act(() => result.current.selectAll());

    expect(result.current.selectionMode).toBe(true);
    expect(result.current.selectedIds).toEqual(new Set(['c1', 'c2']));
  });

  it('clearSelection limpa os ids e sai do modo de seleção', () => {
    const { result } = renderInbox([conversation('c1')]);
    act(() => result.current.selectAll());

    act(() => result.current.clearSelection());

    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.selectionMode).toBe(false);
  });
});

describe('useInboxBulkActions — bulkMarkAsRead', () => {
  it('sem seleção não toca o banco', async () => {
    const { result } = renderInbox();

    await act(async () => {
      await result.current.bulkMarkAsRead();
    });

    expect(recorded).toEqual([]);
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it('marca só as mensagens NÃO lidas e RECEBIDAS dos contatos selecionados e recarrega', async () => {
    updateQueue.push({ data: [{ contact_id: 'c1' }, { contact_id: 'c2' }], error: null });
    const { result, refetch } = renderInbox();
    selectIds(result, ['c1', 'c2']);

    await act(async () => {
      await result.current.bulkMarkAsRead();
    });

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      table: 'messages',
      op: 'update',
      payload: { is_read: true },
      filters: { contact_id: ['c1', 'c2'], is_read: false, sender: 'contact' },
    });
    expect(mocks.toast.success).toHaveBeenCalledWith('2 conversa(s) marcada(s) como lida(s)');
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.bulkLoading).toBe(false);
  });

  it('a contagem anunciada é a das linhas ALTERADAS, não a dos contatos selecionados', async () => {
    // Três selecionados, mas só um tinha mensagem não lida de contato no banco.
    updateQueue.push({ data: [{ contact_id: 'c2' }], error: null });
    const { result, refetch } = renderInbox();
    selectIds(result, ['c1', 'c2', 'c3']);

    await act(async () => {
      await result.current.bulkMarkAsRead();
    });

    expect(mocks.toast.success).toHaveBeenCalledWith('1 conversa(s) marcada(s) como lida(s)');
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('nenhuma linha alterada: avisa sem dizer que marcou e não recarrega tudo', async () => {
    updateQueue.push({ data: [], error: null });
    const { result, refetch } = renderInbox();
    selectIds(result, ['c1']);

    await act(async () => {
      await result.current.bulkMarkAsRead();
    });

    expect(mocks.toast.info).toHaveBeenCalledWith('Nenhuma mensagem não lida nesses contatos');
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(refetch).not.toHaveBeenCalled();
    // Nada mudou: a seleção continua de pé para o operador tentar outra ação.
    expect(result.current.selectedIds.has('c1')).toBe(true);
  });

  it('erro do banco (RLS): avisa, mantém a seleção e não recarrega', async () => {
    updateQueue.push({ data: null, error: { message: 'permission denied', code: '42501' } });
    const { result, refetch } = renderInbox();
    selectIds(result, ['c1']);

    await act(async () => {
      await result.current.bulkMarkAsRead();
    });

    expect(mocks.toast.error).toHaveBeenCalledWith('Erro ao marcar como lido');
    expect(refetch).not.toHaveBeenCalled();
    expect(result.current.selectedIds.has('c1')).toBe(true);
    expect(result.current.bulkLoading).toBe(false);
  });

  it('bulkLoading liga enquanto a operação está em voo e volta a false no fim', async () => {
    updateQueue.push({ data: [{ contact_id: 'c1' }], error: null });
    let release: (() => void) | undefined;
    updateGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { result, refetch } = renderInbox();
    selectIds(result, ['c1']);

    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = result.current.bulkMarkAsRead();
      await Promise.resolve();
    });
    expect(result.current.bulkLoading).toBe(true);

    await act(async () => {
      release?.();
      await pending;
    });
    expect(result.current.bulkLoading).toBe(false);
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('useInboxBulkActions — bulkTransfer', () => {
  it('sem seleção não toca o banco', async () => {
    const { result } = renderInbox();

    await act(async () => {
      await result.current.bulkTransfer('agent', 'ag-2');
    });

    expect(rpcCalls).toEqual([]);
  });

  it('agente: transfere CADA contato pela RPC (sem UPDATE cru) e recarrega', async () => {
    const { result, refetch } = renderInbox();
    selectIds(result, ['c1', 'c2']);

    await act(async () => {
      await result.current.bulkTransfer('agent', 'ag-2');
    });

    expect(recorded).toEqual([]);
    expect(rpcCalls).toEqual([
      { name: 'transfer_conversation', args: { p_contact_id: 'c1', p_to_agent_id: 'ag-2', p_to_queue_id: null, p_note: null } },
      { name: 'transfer_conversation', args: { p_contact_id: 'c2', p_to_agent_id: 'ag-2', p_to_queue_id: null, p_note: null } },
    ]);
    expect(mocks.toast.success).toHaveBeenCalledWith('2 contato(s) transferido(s)');
    expect(result.current.selectedIds.size).toBe(0);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('fila: preenche p_to_queue_id e deixa p_to_agent_id nulo', async () => {
    const { result } = renderInbox();
    selectIds(result, ['c1']);

    await act(async () => {
      await result.current.bulkTransfer('queue', 'q-7');
    });

    expect(rpcCalls[0]).toEqual({
      name: 'transfer_conversation',
      args: { p_contact_id: 'c1', p_to_agent_id: null, p_to_queue_id: 'q-7', p_note: null },
    });
  });

  it('a mensagem opcional vai para a RPC como p_note (é o recado da transferência)', async () => {
    const { result } = renderInbox();
    selectIds(result, ['c1']);

    await act(async () => {
      await result.current.bulkTransfer('agent', 'ag-2', 'recado do operador');
    });

    expect(rpcCalls[0].args.p_note).toBe('recado do operador');
  });

  it('mensagem em branco vira null (não grava nota vazia na trilha)', async () => {
    const { result } = renderInbox();
    selectIds(result, ['c1']);

    await act(async () => {
      await result.current.bulkTransfer('agent', 'ag-2', '   ');
    });

    expect(rpcCalls[0].args.p_note).toBeNull();
  });

  it('falha em um contato e sucesso no outro: anuncia a contagem real e recarrega', async () => {
    rpcErrors.set('transfer_conversation', [{ message: 'rls' }]);
    const { result, refetch } = renderInbox();
    selectIds(result, ['c1', 'c2']);

    await act(async () => {
      await result.current.bulkTransfer('queue', 'q-1');
    });

    // Primeira chamada falhou, segunda passou — a ordem é a da seleção.
    expect(rpcCalls).toHaveLength(2);
    expect(mocks.toast.error).toHaveBeenCalledWith('1 contato(s) transferido(s); 1 falhou(aram)');
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.bulkLoading).toBe(false);
  });

  it('erro em TODOS os contatos: avisa o erro e mantém a seleção', async () => {
    rpcErrors.set('transfer_conversation', [{ message: 'rls' }]);
    const { result, refetch } = renderInbox();
    selectIds(result, ['c1']);

    await act(async () => {
      await result.current.bulkTransfer('queue', 'q-1');
    });

    expect(mocks.toast.error).toHaveBeenCalledWith('Erro ao transferir contatos');
    expect(result.current.selectedIds.has('c1')).toBe(true);
    expect(refetch).not.toHaveBeenCalled();
    expect(result.current.bulkLoading).toBe(false);
  });
});

describe('useInboxBulkActions — bulkArchive', () => {
  it('arquiva cada contato pela RPC set_conversation_status e NÃO mexe em assigned_to', async () => {
    const { result, refetch } = renderInbox();
    selectIds(result, ['c1', 'c2']);

    await act(async () => {
      await result.current.bulkArchive();
    });

    // O caminho do banco é a RPC (o mesmo do individual e do chip Arquivadas).
    expect(rpcCalls).toEqual([
      { name: 'set_conversation_status', args: { p_contact_id: 'c1', p_next: 'archived' } },
      { name: 'set_conversation_status', args: { p_contact_id: 'c2', p_next: 'archived' } },
    ]);
    // Nenhum UPDATE cru em contacts: o responsável (assigned_to) não é tocado.
    expect(recorded).toEqual([]);
    expect(mocks.undoToast).toHaveBeenCalledTimes(1);
    expect(lastUndo?.message).toBe('2 contato(s) arquivado(s)');
    expect(result.current.selectedIds.size).toBe(0);
    expect(refetch).toHaveBeenCalledTimes(1);

    // O desfazer REABRE (p_next: 'open') exatamente quem foi arquivado.
    await act(async () => {
      await lastUndo?.onUndo();
    });

    expect(rpcCalls.slice(2)).toEqual([
      { name: 'set_conversation_status', args: { p_contact_id: 'c1', p_next: 'open' } },
      { name: 'set_conversation_status', args: { p_contact_id: 'c2', p_next: 'open' } },
    ]);
    expect(contactUpdates()).toEqual([]);
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it('sem seleção não chama RPC nem oferece desfazer', async () => {
    const { result } = renderInbox();

    await act(async () => {
      await result.current.bulkArchive();
    });

    expect(rpcCalls).toEqual([]);
    expect(mocks.undoToast).not.toHaveBeenCalled();
  });

  it('falha em uma conversa: a contagem é a REAL e o desfazer só reabre o que arquivou', async () => {
    rpcErrors.set('set_conversation_status', [{ message: 'rls' }]);
    const { result, refetch } = renderInbox();
    selectIds(result, ['c1', 'c2']);

    await act(async () => {
      await result.current.bulkArchive();
    });

    expect(lastUndo?.message).toBe('1 de 2 contato(s) arquivado(s)');
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(result.current.selectedIds.size).toBe(0);

    await act(async () => {
      await lastUndo?.onUndo();
    });

    // Só o c2 foi arquivado (o c1 falhou), então só o c2 é reaberto.
    expect(rpcCalls.slice(2)).toEqual([
      { name: 'set_conversation_status', args: { p_contact_id: 'c2', p_next: 'open' } },
    ]);
  });

  it('erro em todas as conversas: avisa, mantém a seleção e não oferece desfazer', async () => {
    rpcErrors.set('set_conversation_status', [{ message: 'rls update' }]);
    const { result, refetch } = renderInbox();
    selectIds(result, ['c1']);

    await act(async () => {
      await result.current.bulkArchive();
    });

    expect(mocks.toast.error).toHaveBeenCalledWith('Erro ao arquivar contatos');
    expect(mocks.undoToast).not.toHaveBeenCalled();
    expect(refetch).not.toHaveBeenCalled();
    expect(result.current.selectedIds.has('c1')).toBe(true);
    expect(result.current.bulkLoading).toBe(false);
  });

  it('usa o retrato da seleção do momento da chamada: mudar a seleção durante a janela de desfazer não troca o alvo', async () => {
    const { result } = renderInbox();
    selectIds(result, ['c1']);
    await act(async () => {
      await result.current.bulkArchive();
    });
    expect(rpcCalls.map((c) => c.args.p_contact_id)).toEqual(['c1']);

    // Durante a janela de 5 s o operador mexe na seleção — o alvo já está congelado.
    act(() => result.current.toggleSelection('c2'));
    expect(result.current.selectedIds).toEqual(new Set(['c2']));

    await act(async () => {
      await lastUndo?.onUndo();
    });

    const reabertos = rpcCalls.filter((c) => c.args.p_next === 'open');
    expect(reabertos).toEqual([
      { name: 'set_conversation_status', args: { p_contact_id: 'c1', p_next: 'open' } },
    ]);
  });

  it('não faz SELECT prévio dos contatos (nada de janela em que um SELECT falho silencia o desfazer)', async () => {
    const { result } = renderInbox();
    selectIds(result, ['c1']);

    await act(async () => {
      await result.current.bulkArchive();
    });

    expect(recorded.filter((call) => call.op === 'select')).toEqual([]);
    expect(mocks.undoToast).toHaveBeenCalledTimes(1);
  });
});

describe('useInboxBulkActions — handleBatchFetchAvatars', () => {
  it('sucesso: anuncia os contadores devolvidos pela função e recarrega', async () => {
    mocks.invoke.mockResolvedValue({ data: { updated: 5, processed: 8 }, error: null });
    const { result, refetch } = renderInbox();

    await act(async () => {
      await result.current.handleBatchFetchAvatars();
    });

    expect(mocks.invoke).toHaveBeenCalledWith('batch-fetch-avatars');
    expect(mocks.toast.success).toHaveBeenCalledWith('5 avatares atualizados de 8 contatos.');
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(result.current.fetchingAvatars).toBe(false);
  });

  it('resposta sem contadores (data nulo) anuncia 0 de 0, sem quebrar', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: null });
    const { result } = renderInbox();

    await act(async () => {
      await result.current.handleBatchFetchAvatars();
    });

    expect(mocks.toast.success).toHaveBeenCalledWith('0 avatares atualizados de 0 contatos.');
  });

  it('erro da função (Error) mostra a mensagem do erro e não recarrega', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error('falha na função') });
    const { result, refetch } = renderInbox();

    await act(async () => {
      await result.current.handleBatchFetchAvatars();
    });

    expect(mocks.toast.error).toHaveBeenCalledWith('Erro ao buscar avatares: falha na função');
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(refetch).not.toHaveBeenCalled();
    expect(result.current.fetchingAvatars).toBe(false);
  });

  it('rejeição que não é Error (dado malformado) cai no rótulo "Erro desconhecido"', async () => {
    mocks.invoke.mockRejectedValue('boom');
    const { result } = renderInbox();

    await act(async () => {
      await result.current.handleBatchFetchAvatars();
    });

    expect(mocks.toast.error).toHaveBeenCalledWith('Erro ao buscar avatares: Erro desconhecido');
    expect(result.current.fetchingAvatars).toBe(false);
  });

  it('fetchingAvatars liga durante a busca e volta a false no fim', async () => {
    let release: ((value: unknown) => void) | undefined;
    mocks.invoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const { result } = renderInbox();

    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = result.current.handleBatchFetchAvatars();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.fetchingAvatars).toBe(true));

    await act(async () => {
      release?.({ data: { updated: 1, processed: 1 }, error: null });
      await pending;
    });
    expect(result.current.fetchingAvatars).toBe(false);
  });
});
