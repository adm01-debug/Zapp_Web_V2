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
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/hooks/system/useUndoableAction', () => ({
  useUndoableAction: () => ({ execute: mocks.execute }),
}));
// O hook só usa o TIPO `ConversationWithMessages` deste módulo; o dublê evita puxar a
// cadeia de Realtime para dentro do teste.
vi.mock('@/hooks/chat/useRealtimeMessages', () => ({}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mocks.from, functions: { invoke: mocks.invoke } },
}));

import { useInboxBulkActions } from '@/hooks/inbox/useInboxBulkActions';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import type { ContactRow } from '@/types/contact';

let updateQueue: DbResult[] = [];
let selectQueue: DbResult[] = [];
let recorded: RecordedCall[] = [];
let updateGate: Promise<void> | null = null;
let lastUndo: UndoOptions | null = null;

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
    select: () => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }),
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
  selectQueue = [];
  recorded = [];
  updateGate = null;
  lastUndo = null;

  mocks.execute.mockImplementation(async (options: UndoOptions) => {
    lastUndo = options;
    await options.action();
  });
  mocks.invoke.mockResolvedValue({ data: { updated: 0, processed: 0 }, error: null });

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

  it('marca só as mensagens NÃO lidas dos contatos selecionados e recarrega', async () => {
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
      filters: { contact_id: ['c1', 'c2'], is_read: false },
    });
    expect(mocks.toast.success).toHaveBeenCalledWith('2 conversa(s) marcada(s) como lida(s)');
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.bulkLoading).toBe(false);
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

    expect(recorded).toEqual([]);
  });

  it('agente: grava assigned_to no lote, limpa a seleção e recarrega', async () => {
    const { result, refetch } = renderInbox();
    selectIds(result, ['c1', 'c2']);

    await act(async () => {
      await result.current.bulkTransfer('agent', 'ag-2');
    });

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      table: 'contacts',
      op: 'update',
      payload: { assigned_to: 'ag-2' },
      filters: { id: ['c1', 'c2'] },
    });
    expect(mocks.toast.success).toHaveBeenCalledWith('2 contato(s) transferido(s)');
    expect(result.current.selectedIds.size).toBe(0);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('fila: grava queue_id (e não assigned_to)', async () => {
    const { result } = renderInbox();
    selectIds(result, ['c1']);

    await act(async () => {
      await result.current.bulkTransfer('queue', 'q-7');
    });

    expect(recorded[0].payload).toEqual({ queue_id: 'q-7' });
  });

  it('a mensagem opcional NÃO é persistida (o update não ganha campo de texto)', async () => {
    const { result } = renderInbox();
    selectIds(result, ['c1']);

    await act(async () => {
      await result.current.bulkTransfer('agent', 'ag-2', 'recado do operador');
    });

    expect(recorded[0].payload).toEqual({ assigned_to: 'ag-2' });
  });

  it('erro do banco: avisa e mantém a seleção', async () => {
    updateQueue.push({ error: { message: 'rls' } });
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
  it('lê o assigned_to dos originais, arquiva via ação desfazível e o desfazer RESTAURA cada contato', async () => {
    selectQueue.push({
      data: [
        { id: 'c1', assigned_to: 'ag-1' },
        { id: 'c2', assigned_to: null },
      ],
      error: null,
    });
    const { result, refetch } = renderInbox();
    selectIds(result, ['c1', 'c2']);

    await act(async () => {
      await result.current.bulkArchive();
    });

    expect(recorded[0]).toMatchObject({
      table: 'contacts',
      op: 'select',
      columns: 'id, assigned_to',
      filters: { id: ['c1', 'c2'] },
    });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(lastUndo?.successMessage).toBe('2 contato(s) arquivado(s)');
    expect(lastUndo?.undoMessage).toBe('Arquivamento desfeito');
    expect(contactUpdates()[0]).toMatchObject({
      payload: { assigned_to: null },
      filters: { id: ['c1', 'c2'] },
    });
    expect(result.current.selectedIds.size).toBe(0);
    expect(refetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await lastUndo?.undoAction();
    });

    const restores = contactUpdates().slice(1);
    expect(restores).toHaveLength(2);
    expect(restores[0]).toMatchObject({ payload: { assigned_to: 'ag-1' }, filters: { id: 'c1' } });
    expect(restores[1]).toMatchObject({ payload: { assigned_to: null }, filters: { id: 'c2' } });
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it('sem seleção não lê nem arquiva nada', async () => {
    const { result } = renderInbox();

    await act(async () => {
      await result.current.bulkArchive();
    });

    expect(recorded).toEqual([]);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('erro no UPDATE do arquivamento: avisa, não recarrega e mantém a seleção', async () => {
    selectQueue.push({ data: [{ id: 'c1', assigned_to: 'ag-1' }], error: null });
    updateQueue.push({ error: { message: 'rls update' } });
    const { result, refetch } = renderInbox();
    selectIds(result, ['c1']);

    await act(async () => {
      await result.current.bulkArchive();
    });

    expect(mocks.toast.error).toHaveBeenCalledWith('Erro ao arquivar contatos');
    expect(refetch).not.toHaveBeenCalled();
    expect(result.current.selectedIds.has('c1')).toBe(true);
    expect(result.current.bulkLoading).toBe(false);
  });

  it('usa o retrato da seleção do momento da chamada: mudar a seleção durante a janela de desfazer não troca o alvo', async () => {
    // A ação fica pendente de propósito (o desfazer só existe depois que ela roda).
    mocks.execute.mockImplementation(async (options: UndoOptions) => {
      lastUndo = options;
    });
    selectQueue.push({ data: [{ id: 'c1', assigned_to: 'ag-1' }], error: null });

    const { result } = renderInbox();
    selectIds(result, ['c1']);
    await act(async () => {
      await result.current.bulkArchive();
    });
    expect(recorded[0].filters.id).toEqual(['c1']);

    // Durante a janela de 5 s o operador mexe na seleção — o alvo já está congelado.
    act(() => result.current.toggleSelection('c2'));
    expect(result.current.selectedIds).toEqual(new Set(['c1', 'c2']));

    await act(async () => {
      await lastUndo?.action();
    });

    const archiveUpdate = contactUpdates().find(
      (call) => (call.payload as { assigned_to?: unknown })?.assigned_to === null,
    );
    expect(archiveUpdate?.filters.id).toEqual(['c1']);
  });

  // BUG (documentado): o SELECT dos contatos originais está FORA do try e tem o `error`
  // ignorado. Se ele falha (RLS/rede), `originalContacts` fica nulo e o hook segue
  // arquivando: o botão "Desfazer" aparece, anuncia "Arquivamento desfeito" e não
  // restaura nada. Se o SELECT lançar, `bulkLoading` fica preso em true.
  // Ver relato: useInboxBulkActions.ts:102-105, :120-130.
  it.fails('erro no SELECT dos originais (RLS) não pode resultar num desfazer que não restaura nada', async () => {
    selectQueue.push({ data: null, error: { message: 'permission denied', code: '42501' } });
    const { result } = renderInbox();
    selectIds(result, ['c1']);

    await act(async () => {
      await result.current.bulkArchive();
    });

    const antesDoDesfazer = contactUpdates().length;
    await act(async () => {
      await lastUndo?.undoAction();
    });

    // O desfazer precisa ter restaurado alguma coisa (hoje: nada, porque não há original).
    expect(contactUpdates().length).toBeGreaterThan(antesDoDesfazer);
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
