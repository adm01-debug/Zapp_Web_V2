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

  const { data, error } = await supabase
    .from('contacts')
    .update({ conversation_status: 'archived', updated_at: new Date().toISOString() })
    .in('id', contactIds)
    .select('id');
  if (error) throw error;

  const arquivadas = ((data ?? []) as { id: string }[]).map((row) => row.id);
  if (arquivadas.length === 0) {
    throw new Error('Nenhuma conversa foi arquivada');
  }

  const confirmadas = new Map<string, ConversationStatus>();
  for (const id of arquivadas) {
    const anterior = anteriores.get(id);
    if (anterior) confirmadas.set(id, anterior);
    announce(id, 'archived');
  }
  return confirmadas;
}

/**
 * Restaura o status anterior de cada conversa: agrupa os ids pelo valor
 * anterior e faz UMA escrita por valor distinto.
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
    const { error } = await supabase
      .from('contacts')
      .update({ conversation_status: status, updated_at: new Date().toISOString() })
      .in('id', ids);
    if (error) throw error;
    for (const id of ids) announce(id, status);
  }
}
