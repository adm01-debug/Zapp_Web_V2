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

/**
 * Decisão do dono (2026-11-13): conversa em 'waiting' (Aguardando, sem atendente)
 * NÃO pode ser arquivada — ela some da fila sem ninguém atender. Precisa ser
 * atendida (vira 'open') ou encerrada antes. O banco recusa a transição
 * (`conversation_waiting_cannot_be_archived`, migration 20261113171300); a tela
 * esconde o "Arquivar" e o lote pula essas conversas.
 */
export const WAITING_CANNOT_ARCHIVE_CODE = 'conversation_waiting_cannot_be_archived';
export const WAITING_CANNOT_ARCHIVE_MESSAGE =
  'Conversa aguardando atendimento não pode ser arquivada. Atenda ou encerre antes.';

/** "Arquivar" só aparece/vale para conversa que não está aguardando nem já arquivada. */
export function canArchiveConversation(status: string | null | undefined): boolean {
  return status !== 'waiting' && status !== 'archived';
}

/** true quando o erro é a recusa de arquivar conversa aguardando. */
export function isWaitingArchiveError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === 'string') return error.includes(WAITING_CANNOT_ARCHIVE_CODE);
  const e = error as { message?: unknown; code?: unknown; details?: unknown };
  return [e.message, e.code, e.details].some(
    (part) => typeof part === 'string' && (part.includes(WAITING_CANNOT_ARCHIVE_CODE) || part === WAITING_CANNOT_ARCHIVE_MESSAGE),
  );
}

interface StatusChangeRow {
  contact_id: string;
  previous_status: string | null;
  /** changed | already_in_state | state_changed | waiting_cannot_be_archived | invalid_transition | not_authorized */
  outcome?: string | null;
}

export const RESTORE_RESOLVED_UNAVAILABLE_MESSAGE =
  'Desfazer indisponível durante a atualização do sistema. Tente novamente em instantes.';

/** Teto por chamada da RPC de lote (o banco recusa acima disso). */
export const SET_CONVERSATIONS_STATUS_CHUNK = 500;

type SetConversationsStatusRpc = {
  rpc: (
    fn: 'set_conversations_status',
    args: { p_contact_ids: string[]; p_next: ConversationStatus; p_expected_current?: string; p_restore?: boolean },
  ) => PromiseLike<{ data: StatusChangeRow[] | null; error: Error | null }>;
};

/**
 * Muda o status de um lote pela RPC `set_conversations_status` (migration
 * 20261113171300). UPDATE direto em `contacts.conversation_status` passou a ser
 * recusado no banco (P1-2): toda mudança passa pela mesma autorização e pela
 * mesma máquina de estados de `set_conversation_status`. `expectedCurrent` só
 * mexe em quem AINDA está nesse estado. Devolve (id → status anterior) do que
 * mudou; contato sem permissão/transição inválida é pulado (como o RLS fazia).
 * `restore` = Desfazer de arquivamento de conversa encerrada: archived → resolved
 * sem gravar outro encerramento (o banco só aceita com encerramento prévio).
 */
export async function moveConversationsStatus(
  contactIds: string[],
  next: ConversationStatus,
  expectedCurrent?: ConversationStatus,
  restore = false,
): Promise<Map<string, ConversationStatus>> {
  const moved = new Map<string, ConversationStatus>();
  if (contactIds.length === 0) return moved;
  const client = supabase as unknown as SetConversationsStatusRpc;
  // Lotes acima de 500 vão em pedaços (o banco recusa mais que isso por chamada).
  for (let i = 0; i < contactIds.length; i += SET_CONVERSATIONS_STATUS_CHUNK) {
    const { data, error } = await client.rpc('set_conversations_status', {
      p_contact_ids: contactIds.slice(i, i + SET_CONVERSATIONS_STATUS_CHUNK),
      p_next: next,
      ...(expectedCurrent ? { p_expected_current: expectedCurrent } : {}),
      ...(restore ? { p_restore: true } : {}),
    });
    if ((error as { code?: string } | null)?.code === 'PGRST202') {
      // Banco ainda sem a RPC (front publicado antes do apply da 20261113171300):
      // segue pelo UPDATE direto, que o banco antigo ainda aceita. Mesma postura de
      // transferConversation — a ação nunca quebra por ordem de deploy.
      // Desfazer de encerrada NÃO tem caminho legado: a FSM antiga não aceita
      // archived -> resolved e dois UPDATEs soltos deixariam encerrar uma conversa
      // reaberta por mensagem nova entre eles. Recusa sem mexer no status.
      if (restore && next === 'resolved') throw new Error(RESTORE_RESOLVED_UNAVAILABLE_MESSAGE);
      const legado = await moveConversationsStatusLegacy(
        contactIds.slice(i, i + SET_CONVERSATIONS_STATUS_CHUNK),
        next,
        expectedCurrent,
      );
      for (const [id, anterior] of legado) moved.set(id, anterior);
      continue;
    }
    if (error) throw error;
    for (const row of data ?? []) {
      // A RPC devolve UMA linha por id com o resultado; só 'changed' mudou de verdade.
      // (Sem `outcome` = versão antiga da RPC, que só devolvia as que mudaram.)
      if (row.outcome && row.outcome !== 'changed') continue;
      moved.set(row.contact_id, (row.previous_status ?? 'open') as ConversationStatus);
    }
  }
  return moved;
}

/**
 * Caminho do banco SEM `set_conversations_status` (antes do apply da
 * 20261113171300): UPDATE direto, só nos ids ainda em `expectedCurrent` quando
 * informado. Devolve (id → status anterior) do que o banco confirmou ter mudado
 * (update sem linha afetada — RLS — não conta).
 */
async function moveConversationsStatusLegacy(
  contactIds: string[],
  next: ConversationStatus,
  expectedCurrent?: ConversationStatus,
): Promise<Map<string, ConversationStatus>> {
  const moved = new Map<string, ConversationStatus>();
  const anteriores = await readConversationStatuses(contactIds);
  const alvo = contactIds.filter(
    (id) => anteriores.has(id) && (!expectedCurrent || anteriores.get(id) === expectedCurrent),
  );
  if (alvo.length === 0) return moved;
  let query = supabase
    .from('contacts')
    .update({ conversation_status: next, updated_at: new Date().toISOString() })
    .in('id', alvo);
  if (expectedCurrent) query = query.eq('conversation_status', expectedCurrent);
  const { data, error } = await query.select('id');
  if (error) throw error;
  for (const row of (data ?? []) as { id: string }[]) {
    const anterior = anteriores.get(row.id);
    if (anterior) moved.set(row.id, anterior);
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
  if ([...anteriores.values()].some((status) => status === 'waiting')) {
    throw new Error(WAITING_CANNOT_ARCHIVE_MESSAGE);
  }

  const movidas = await moveConversationsStatus(contactIds, 'archived');
  if (movidas.size === 0) {
    throw new Error('Nenhuma conversa foi arquivada');
  }

  // O anterior que vale é o que a RPC confirmou sob lock, não a leitura prévia: uma
  // mensagem nova pode ter reaberto a conversa entre as duas, e o desfazer não pode
  // encerrá-la de novo.
  const confirmadas = new Map<string, ConversationStatus>();
  for (const [id, anteriorNoBanco] of movidas) {
    confirmadas.set(id, anteriorNoBanco);
    announce(id, 'archived');
  }
  return confirmadas;
}

/**
 * Restaura o status anterior de cada conversa: agrupa os ids pelo valor
 * anterior e faz UMA escrita por valor distinto. A máquina de estados só deixa
 * sair de 'archived' para 'open'; 'resolved' volta pela RPC em modo restore (os
 * dois passos no banco, sem novo encerramento — pela RPC comum o 2º passo
 * gravaria outro encerramento e o banco recusaria com 23505); waiting (legado) vai
 * em dois passos (archived → open → anterior), sempre só em quem AINDA está no estado esperado —
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
    if (status === 'resolved') {
      for (const id of (await moveConversationsStatus(ids, 'resolved', 'archived', true)).keys()) announce(id, 'resolved');
      continue;
    }
    const abertas = [...(await moveConversationsStatus(ids, 'open', 'archived')).keys()];
    if (status === 'open') {
      for (const id of abertas) announce(id, 'open');
      continue;
    }
    for (const id of (await moveConversationsStatus(abertas, status, 'open')).keys()) announce(id, status);
  }
}
