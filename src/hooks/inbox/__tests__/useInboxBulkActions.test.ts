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

    act(() => result.current.toggleSelection(c1));
    expect(result.current.selectedIds.has(c1)).toBe(true);

    act(() => result.current.toggleSelectionMode());
    expect(result.current.selectionMode).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('toggleSelection alterna o id e devolve um Set NOVO (não muta o anterior)', () => {
    const { result } = renderInbox();

    act(() => result.current.toggleSelection(c1));
    const antes = result.current.selectedIds;

    act(() => result.current.toggleSelection(c2));
    expect(antes.has(c2)).toBe(false);
    expect(result.current.selectedIds).toEqual(new Set([c1, c2]));

    act(() => result.current.toggleSelection(c2));
    expect(result.current.selectedIds).toEqual(new Set([c1]));
  });

  it('selectAll entra no modo de seleção, pega todos os contatos e DEDUPLICA', () => {
    const { result } = renderInbox([
      conversation(c1),
      conversation(c2),
      conversation(c1),
    ]);

    act(() => result.current.selectAll());

    expect(result.current.selectionMode).toBe(true);
    expect(result.current.selectedIds).toEqual(new Set([c1, c2]));
    expect(mocks.toast.success).toHaveBeenCalledWith('2 conversa(s) selecionada(s)');
  });

  it('selectAll com a lista vazia avisa zero e não seleciona nada', () => {
    const { result } = renderInbox();

    act(() => result.current.selectAll());

    expect(result.current.selectedIds.size).toBe(0);
    expect(mocks.toast.success).toHaveBeenCalledWith('0 conversa(s) selecionada(s)');
  });

  it('selectAll já dentro do modo de seleção re-seleciona tudo sem sair do modo', () => {
    const { result } = renderInbox([conversation(c1), conversation(c2)]);

    act(() => result.current.selectAll());
    act(() => result.current.toggleSelection(c1));
    expect(result.current.selectedIds).toEqual(new Set([c2]));

    // Já está em selectionMode: cai no ramo "não precisa ligar de novo".
    act(() => result.current.selectAll());

    expect(result.current.selectionMode).toBe(true);
    expect(result.current.selectedIds).toEqual(new Set([c1, c2]));
  });

  it('clearSelection limpa os ids e sai do modo de seleção', () => {
    const { result } = renderInbox([conversation(c1)]);
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

  it('marca só as mensagens NÃO lidas RECEBIDAS (sender=contact) dos contatos selecionados e recarrega', async () => {
    updateQueue.push({ data: [{ id: 'm1', contact_id: c1 }, { id: 'm2', contact_id: c2 }] });
    const { result, refetch } = renderInbox();
    selectIds(result, [c1, c2]);

    await act(async () => {
      await result.current.bulkMarkAsRead();
    });

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      table: 'messages',
      op: 'update',
      payload: { is_read: true },
      filters: { contact_id: [c1, c2], is_read: false, sender: 'contact' },
    });
    expect(mocks.toast.success).toHaveBeenCalledWith('2 conversa(s) marcada(s) como lida(s)');
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.bulkLoading).toBe(false);
  });

  it('id que não é uuid é descartado antes de gravar; só os válidos vão ao banco', async () => {
    // Id não-uuid faria o PostgREST responder 400 e derrubaria o lote inteiro.
    updateQueue.push({ data: [{ id: 'm1', contact_id: c1 }] });
    const { result } = renderInbox();
    selectIds(result, [c1, 'jid-5511999999999@s.whatsapp.net']);

    await act(async () => {
      await result.current.bulkMarkAsRead();
    });

    expect(recorded).toHaveLength(1);
    expect(recorded[0].filters.contact_id).toEqual([c1]);
    expect(mocks.toast.success).toHaveBeenCalledWith('1 conversa(s) marcada(s) como lida(s)');
  });

  it('seleção só com id inválido: avisa e não toca o banco', async () => {
    const { result } = renderInbox();
    selectIds(result, ['contact-1']);

    await act(async () => {
      await result.current.bulkMarkAsRead();
    });

    expect(recorded).toEqual([]);
    expect(mocks.toast.info).toHaveBeenCalledWith('Nenhuma conversa válida na seleção');
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(result.current.bulkLoading).toBe(false);
    expect(result.current.selectedIds.has('contact-1')).toBe(true);
  });

  it('UPDATE que afeta 0 linhas vira aviso neutro, nunca sucesso falso', async () => {
    updateQueue.push({ data: [] });
    const { result, refetch } = renderInbox();
    selectIds(result, [c1, c2]);

    await act(async () => {
      await result.current.bulkMarkAsRead();
    });

    expect(mocks.toast.info).toHaveBeenCalledWith('Nenhuma mensagem não lida nessas conversas');
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('parte da seleção afetada: o toast conta as conversas REALMENTE marcadas', async () => {
    // c2 não tinha mensagem não lida: o banco devolve linhas só de c1 e c3.
    updateQueue.push({
      data: [
        { id: 'm1', contact_id: c1 },
        { id: 'm2', contact_id: c1 },
        { id: 'm3', contact_id: c3 },
      ],
    });
    const { result } = renderInbox();
    selectIds(result, [c1, c2, c3]);

    await act(async () => {
      await result.current.bulkMarkAsRead();
    });

    expect(mocks.toast.success).toHaveBeenCalledWith('2 conversa(s) marcada(s) como lida(s)');
  });

  it('erro do banco (RLS): avisa, mantém a seleção e não recarrega', async () => {
    updateQueue.push({ data: null, error: { message: 'permission denied', code: '42501' } });
    const { result, refetch } = renderInbox();
    selectIds(result, [c1]);

    await act(async () => {
      await result.current.bulkMarkAsRead();
    });

    expect(mocks.toast.error).toHaveBeenCalledWith('Erro ao marcar como lido');
    expect(refetch).not.toHaveBeenCalled();
    expect(result.current.selectedIds.has(c1)).toBe(true);
    expect(result.current.bulkLoading).toBe(false);
  });

  it('bulkLoading liga enquanto a operação está em voo e volta a false no fim', async () => {
    let release: (() => void) | undefined;
    updateGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { result, refetch } = renderInbox();
    selectIds(result, [c1]);

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

describe('useInboxBulkActions — bulkTransfer (RPC transfer_conversation por contato)', () => {
  it('sem seleção não toca o banco', async () => {
    const { result } = renderInbox();

    await act(async () => {
      await result.current.bulkTransfer('agent', 'ag-2');
    });

    expect(recorded).toEqual([]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('agente: uma RPC por contato, destino só em p_to_agent_id, limpa a seleção e recarrega', async () => {
    const { result, refetch } = renderInbox();
    selectIds(result, [c1, c2]);

    await act(async () => {
      await result.current.bulkTransfer('agent', 'ag-2');
    });

    expect(rpcCalls.map((c) => c.name)).toEqual(['transfer_conversation', 'transfer_conversation']);
    expect(rpcCalls.map((c) => c.args)).toEqual([
      { p_contact_id: c1, p_to_agent_id: 'ag-2', p_to_queue_id: null, p_note: null },
      { p_contact_id: c2, p_to_agent_id: 'ag-2', p_to_queue_id: null, p_note: null },
    ]);
    // Nada de UPDATE solto em contacts: o único caminho é a RPC atômica.
    expect(recorded).toEqual([]);
    expect(mocks.toast.success).toHaveBeenCalledWith('2 contato(s) transferido(s)');
    expect(result.current.selectedIds.size).toBe(0);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('fila: manda p_to_queue_id e deixa p_to_agent_id nulo', async () => {
    const { result } = renderInbox();
    selectIds(result, [c1]);

    await act(async () => {
      await result.current.bulkTransfer('queue', 'q-7');
    });

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].args).toEqual({
      p_contact_id: c1,
      p_to_agent_id: null,
      p_to_queue_id: 'q-7',
      p_note: null,
    });
  });

  it('a mensagem opcional NÃO é persistida (p_note vai nulo)', async () => {
    const { result } = renderInbox();
    selectIds(result, [c1]);

    await act(async () => {
      await result.current.bulkTransfer('agent', 'ag-2', 'recado do operador');
    });

    expect(rpcCalls[0].args).toEqual({
      p_contact_id: c1,
      p_to_agent_id: 'ag-2',
      p_to_queue_id: null,
      p_note: null,
    });
  });

  it('sucesso parcial: tenta os dois, avisa as contagens, mantém a seleção e rejeita', async () => {
    rpcFailures[c2] = { message: 'contato sem permissao', code: '42501' };
    const { result, refetch } = renderInbox();
    selectIds(result, [c1, c2]);

    await act(async () => {
      await expect(result.current.bulkTransfer('agent', 'ag-2')).rejects.toMatchObject({
        message: 'contato sem permissao',
      });
    });

    // Não abortou no primeiro erro: tentou o lote inteiro.
    expect(rpcCalls.map((c) => c.args.p_contact_id)).toEqual([c1, c2]);
    expect(mocks.toast.error).toHaveBeenCalledWith(
      'Erro ao transferir contatos: 1 de 2 contato(s) transferido(s); 1 falharam',
    );
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(result.current.selectedIds.has(c1)).toBe(true);
    expect(result.current.selectedIds.has(c2)).toBe(true);
    expect(refetch).not.toHaveBeenCalled();
    expect(result.current.bulkLoading).toBe(false);
  });

  it('todos falham: rejeita, avisa 0 de N, mantém a seleção e não recarrega', async () => {
    rpcFailures[c1] = { message: 'rls', code: '42501' };
    const { result, refetch } = renderInbox();
    selectIds(result, [c1]);

    await act(async () => {
      await expect(result.current.bulkTransfer('queue', 'q-1')).rejects.toMatchObject({ message: 'rls' });
    });

    expect(mocks.toast.error).toHaveBeenCalledWith(
      'Erro ao transferir contatos: 0 de 1 contato(s) transferido(s); 1 falharam',
    );
    expect(result.current.selectedIds.has(c1)).toBe(true);
    expect(refetch).not.toHaveBeenCalled();
    expect(result.current.bulkLoading).toBe(false);
  });

  it('rejeição crua da RPC (rede): preserva o toast de erro, mantém a seleção e propaga', async () => {
    mocks.rpc.mockRejectedValue(new Error('network down'));
    const { result, refetch } = renderInbox();
    selectIds(result, [c1]);

    await act(async () => {
      await expect(result.current.bulkTransfer('agent', 'ag-2')).rejects.toThrow('network down');
    });

    expect(mocks.toast.error).toHaveBeenCalledWith('Erro ao transferir contatos');
    expect(result.current.selectedIds.has(c1)).toBe(true);
    expect(refetch).not.toHaveBeenCalled();
    expect(result.current.bulkLoading).toBe(false);
  });
});

describe('useInboxBulkActions — bulkArchive', () => {
  it('lê o conversation_status dos originais, arquiva via ação desfazível e o desfazer RESTAURA cada contato', async () => {
    selectQueue.push({
      data: [
        { id: c1, conversation_status: 'open' },
        { id: c2, conversation_status: 'waiting' },
      ],
      error: null,
    });
    const { result, refetch } = renderInbox();
    selectIds(result, [c1, c2]);

    await act(async () => {
      await result.current.bulkArchive();
    });

    expect(recorded[0]).toMatchObject({
      table: 'contacts',
      op: 'select',
      columns: 'id, conversation_status',
      filters: { id: [c1, c2] },
    });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(lastUndo?.successMessage).toBe('2 contato(s) arquivado(s)');
    expect(lastUndo?.undoMessage).toBe('Arquivamento desfeito');
    expect(contactUpdates()[0]).toMatchObject({
      payload: { conversation_status: 'archived' },
      filters: { id: [c1, c2] },
    });
    expect(result.current.selectedIds.size).toBe(0);
    expect(refetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await lastUndo?.undoAction();
    });

    const restores = contactUpdates().slice(1);
    expect(restores).toHaveLength(2);
    // c1 era 'open' → válido desde archived, restaura para 'open'
    expect(restores[0]).toMatchObject({ payload: { conversation_status: 'open' }, filters: { id: c1 } });
    // c2 era 'waiting' → inválido desde archived (trigger só aceita open|pending), restaura para 'open'
    expect(restores[1]).toMatchObject({ payload: { conversation_status: 'open' }, filters: { id: c2 } });
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it('desfazer de contato com status inválido desde archived (waiting/resolved/closed) restaura para open', async () => {
    selectQueue.push({
      data: [
        { id: c1, conversation_status: 'resolved' },
        { id: c2, conversation_status: 'closed' },
      ],
      error: null,
    });
    const { result, refetch } = renderInbox();
    selectIds(result, [c1, c2]);

    await act(async () => {
      await result.current.bulkArchive();
    });

    await act(async () => {
      await lastUndo?.undoAction();
    });

    const restores = contactUpdates().slice(1);
    expect(restores).toHaveLength(2);
    // resolved e closed não são transições válidas desde archived → ambos voltam para 'open'
    expect(restores[0]).toMatchObject({ payload: { conversation_status: 'open' }, filters: { id: c1 } });
    expect(restores[1]).toMatchObject({ payload: { conversation_status: 'open' }, filters: { id: c2 } });
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it('desfazer de contato com status pending restaura para pending (válido desde archived)', async () => {
    selectQueue.push({
      data: [{ id: c1, conversation_status: 'pending' }],
      error: null,
    });
    const { result, refetch } = renderInbox();
    selectIds(result, [c1]);

    await act(async () => {
      await result.current.bulkArchive();
    });

    await act(async () => {
      await lastUndo?.undoAction();
    });

    const restores = contactUpdates().slice(1);
    expect(restores).toHaveLength(1);
    // pending é transição válida desde archived → restaura para pending
    expect(restores[0]).toMatchObject({ payload: { conversation_status: 'pending' }, filters: { id: c1 } });
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
    selectQueue.push({ data: [{ id: c1, conversation_status: 'open' }], error: null });
    updateQueue.push({ error: { message: 'rls update' } });
    const { result, refetch } = renderInbox();
    selectIds(result, [c1]);

    await act(async () => {
      await result.current.bulkArchive();
    });

    expect(mocks.toast.error).toHaveBeenCalledWith('Erro ao arquivar contatos');
    expect(refetch).not.toHaveBeenCalled();
    expect(result.current.selectedIds.has(c1)).toBe(true);
    expect(result.current.bulkLoading).toBe(false);
  });

  it('usa o retrato da seleção do momento da chamada: mudar a seleção durante a janela de desfazer não troca o alvo', async () => {
    // A ação fica pendente de propósito (o desfazer só existe depois que ela roda).
    mocks.execute.mockImplementation(async (options: UndoOptions) => {
      lastUndo = options;
    });
    selectQueue.push({ data: [{ id: c1, conversation_status: 'open' }], error: null });

    const { result } = renderInbox();
    selectIds(result, [c1]);
    await act(async () => {
      await result.current.bulkArchive();
    });
    expect(recorded[0].filters.id).toEqual([c1]);

    // Durante a janela de 5 s o operador mexe na seleção — o alvo já está congelado.
    act(() => result.current.toggleSelection(c2));
    expect(result.current.selectedIds).toEqual(new Set([c1, c2]));

    await act(async () => {
      await lastUndo?.action();
    });

    const archiveUpdate = contactUpdates().find(
      (call) => (call.payload as { conversation_status?: unknown })?.conversation_status === 'archived',
    );
    expect(archiveUpdate?.filters.id).toEqual([c1]);
  });

  // BUG (documentado): o SELECT dos contatos originais está FORA do try e tem o `error`
  // ignorado. Se ele falha (RLS/rede), `originalContacts` fica nulo e o hook segue
  // arquivando: o botão "Desfazer" aparece, anuncia "Arquivamento desfeito" e não
  // restaura nada. Se o SELECT lançar, `bulkLoading` fica preso em true.
  // Ver relato: useInboxBulkActions.ts:102-105, :120-130.
  it.fails('erro no SELECT dos originais (RLS) não pode resultar num desfazer que não restaura nada', async () => {
    selectQueue.push({ data: null, error: { message: 'permission denied', code: '42501' } });
    const { result } = renderInbox();
    selectIds(result, [c1]);

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

describe('useInboxBulkActions — a seleção acompanha o filtro visível', () => {
  it('poda a seleção por interseção: o id que sai da lista filtrada não fica selecionado', () => {
    const { result, rerender } = renderInboxComFiltro([conversation(c1), conversation(c2)]);

    act(() => result.current.selectAll());
    expect(result.current.selectedIds).toEqual(new Set([c1, c2]));

    // Troca de chip/fila/busca: c2 deixa de aparecer.
    rerender({ convs: [conversation(c1)] });

    expect(result.current.selectedIds).toEqual(new Set([c1]));
  });

  it('a ação em lote só atinge o que está visível: o contato escondido pelo filtro não vai para o banco', async () => {
    updateQueue.push({ data: [{ id: 'm1', contact_id: c1 }] });
    const { result, rerender, refetch } = renderInboxComFiltro([
      conversation(c1),
      conversation(c2),
    ]);
    act(() => result.current.selectAll());

    rerender({ convs: [conversation(c1)] });

    await act(async () => {
      await result.current.bulkMarkAsRead();
    });

    expect(recorded).toHaveLength(1);
    expect(recorded[0].filters).toEqual({ contact_id: [c1], is_read: false, sender: 'contact' });
    expect(mocks.toast.success).toHaveBeenCalledWith('1 conversa(s) marcada(s) como lida(s)');
    expect(result.current.selectedIds.size).toBe(0);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('filtro que esvazia a lista limpa a seleção e nenhuma ação encontra alvo', async () => {
    const { result, rerender } = renderInboxComFiltro([conversation(c1)]);
    act(() => result.current.toggleSelectionMode());
    act(() => result.current.toggleSelection(c1));
    expect(result.current.selectedIds).toEqual(new Set([c1]));

    rerender({ convs: [] });

    expect(result.current.selectedIds.size).toBe(0);
    await act(async () => {
      await result.current.bulkMarkAsRead();
    });
    expect(recorded).toEqual([]);
  });

  it('lista filtrada que só troca a identidade do array, sem tirar ninguém, mantém a seleção', () => {
    const { result, rerender } = renderInboxComFiltro([conversation(c1)]);
    act(() => result.current.selectAll());

    // Mesmos ids, array novo (o pai recalcula o filtro a cada render).
    rerender({ convs: [conversation(c1)] });

    expect(result.current.selectedIds).toEqual(new Set([c1]));
  });
});
