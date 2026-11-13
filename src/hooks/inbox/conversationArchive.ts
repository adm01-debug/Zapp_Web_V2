/**
 * Semântica ÚNICA de arquivar/desarquivar conversa.
 *
 * Arquivar = gravar `conversation_status = 'archived'` (+ `updated_at`) e NÃO
 * mexer em `assigned_to`. Antes cada tela tinha a sua regra: o painel de
 * detalhes e a lista zeravam `assigned_to`, o que devolvia a conversa à fila em
 * vez de arquivar — e a aba Arquivadas lê `conversation_status === 'archived'`
 * (`chipCounts.isArchived`), então a conversa nunca aparecia lá.
 *
 * O Desfazer devolve o status ANTERIOR de cada conversa (lido antes da
 * escrita). Como o alvo do restore pode variar por contato, o restore agrupa os
 * ids pelo valor anterior e faz UMA escrita por valor distinto — nunca uma
 * escrita por contato.
 *
 * Todo mundo escuta `zapp:contact-status-changed` (`useRealtimeMessages`), o
 * mesmo evento que o `CloseConversationDialog` já dispara: a lista aberta e as
 * contagens dos chips são atualizadas sem refetch.
 */
import { supabase } from '@/integrations/supabase/client';

export type ConversationStatus = 'open' | 'waiting' | 'resolved' | 'archived';

interface StatusChangeRow {
  contact_id: string;
  previous_status: string | null;
}

type SetConversationsStatusRpc = {
  rpc: (
    fn: 'set_conversations_status',
    args: { p_contact_ids: string[]; p_next: ConversationStatus; p_expected_current?: string },
  ) => PromiseLike<{ data: StatusChangeRow[] | null; error: Error | null }>;
};

/**
 * Muda o status de um lote pela RPC `set_conversations_status` (migration
 * 20261113130200). UPDATE direto em `contacts.conversation_status` passou a ser
 * recusado no banco (P1-2): toda mudança passa pela mesma autorização e pela
 * mesma máquina de estados de `set_conversation_status`. `expectedCurrent` só
 * mexe em quem AINDA está nesse estado. Devolve (id → status anterior) do que
 * mudou; contato sem permissão/transição inválida é pulado (como o RLS fazia).
 */
export async function moveConversationsStatus(
  contactIds: string[],
  next: ConversationStatus,
  expectedCurrent?: ConversationStatus,
): Promise<Map<string, ConversationStatus>> {
  const moved = new Map<string, ConversationStatus>();
  if (contactIds.length === 0) return moved;
  const client = supabase as unknown as SetConversationsStatusRpc;
  const { data, error } = await client.rpc('set_conversations_status', {
    p_contact_ids: contactIds,
    p_next: next,
    ...(expectedCurrent ? { p_expected_current: expectedCurrent } : {}),
  });
  if (error) throw error;
  for (const row of data ?? []) {
    moved.set(row.contact_id, (row.previous_status ?? 'open') as ConversationStatus);
  }
  return moved;
}

interface ContactStatusRow {
  id: string;
  conversation_status: string | null;
}

function announce(contactId: string, status: ConversationStatus): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('zapp:contact-status-changed', { detail: { contactId, status } }),
  );
}

/** Status atual de cada contato pedido (id → status). */
export async function readConversationStatuses(
  contactIds: string[],
): Promise<Map<string, ConversationStatus>> {
  const statuses = new Map<string, ConversationStatus>();
  if (contactIds.length === 0) return statuses;

  const { data, error } = await supabase
    .from('contacts')
    .select('id, conversation_status')
    .in('id', contactIds);
  if (error) throw error;

  for (const row of (data ?? []) as ContactStatusRow[]) {
    statuses.set(row.id, (row.conversation_status ?? 'open') as ConversationStatus);
  }
  return statuses;
}

/**
 * Arquiva as conversas de uma só vez (o estado alvo é o mesmo para todas) e
 * devolve o status anterior de cada uma confirmada, para o Desfazer.
 *
 * Rejeita (não devolve sucesso mentiroso) quando o estado anterior de alguma
 * selecionada não pôde ser lido — arquivar só parte daria um Desfazer que não
 * devolve todas — e quando a escrita afeta zero linhas (o RLS filtra sem
 * devolver erro; update sem linha afetada NÃO é sucesso).
 */
export async function archiveConversations(
  contactIds: string[],
): Promise<Map<string, ConversationStatus>> {
  if (contactIds.length === 0) return new Map();

  const anteriores = await readConversationStatuses(contactIds);
  if (anteriores.size !== contactIds.length) {
    throw new Error('Não foi possível ler o estado de todas as conversas selecionadas');
  }

  const movidas = await moveConversationsStatus(contactIds, 'archived');
  if (movidas.size === 0) {
    throw new Error('Nenhuma conversa foi arquivada');
  }

  const confirmadas = new Map<string, ConversationStatus>();
  for (const [id, anteriorNoBanco] of movidas) {
    confirmadas.set(id, anteriores.get(id) ?? anteriorNoBanco);
    announce(id, 'archived');
  }
  return confirmadas;
}

/**
 * Restaura o status anterior de cada conversa: agrupa os ids pelo valor
 * anterior e faz UMA escrita por valor distinto. A máquina de estados só deixa
 * sair de 'archived' para 'open'; para voltar a waiting/resolved são dois passos
 * (archived → open → anterior), sempre só em quem AINDA está no estado esperado —
 * conversa reaberta por mensagem nova durante a janela do desfazer não é forçada.
 */
export async function restoreConversationStatuses(
  anteriores: Map<string, ConversationStatus>,
): Promise<void> {
  if (anteriores.size === 0) return;

  const porStatus = new Map<ConversationStatus, string[]>();
  for (const [id, status] of anteriores) {
    const ids = porStatus.get(status) ?? [];
    ids.push(id);
    porStatus.set(status, ids);
  }

  for (const [status, ids] of porStatus) {
    if (status === 'archived') continue;
    const abertas = [...(await moveConversationsStatus(ids, 'open', 'archived')).keys()];
    if (status === 'open') {
      for (const id of abertas) announce(id, 'open');
      continue;
    }
    for (const id of (await moveConversationsStatus(abertas, status, 'open')).keys()) announce(id, status);
  }
}
