import { supabase } from '@/integrations/supabase/client';
import { MessageRow } from '@/types/chat';
import { ContactRow } from '@/types/contact';
import { 
  RealtimeMessage, 
  ConversationWithMessages, 
  ConversationContact 
} from '@/hooks/chat/useRealtimeMessages';
import { 
  normalizeMessage, 
  buildConversations, 
  getUniqueMessageContactIds, 
  chunkArray,
  dedupeContacts,
  buildConversation,
  ContactConversationSummary
} from '@/hooks/realtime/realtimeUtils';
import { getLogger } from '@/lib/logger';

const log = getLogger('RealtimeService');
// ── Marcação de leitura em lote ─────────────────────────────────────────────
// Antes: 1 UPDATE por seleção de conversa, sem retry e sem agrupamento. Uma
// rajada (deep-link, teclado, fila de notificação) fazia N requisições e uma
// única falha de rede perdia a marcação em silêncio. Agora as chamadas entram
// numa fila e saem em UM PATCH .in('contact_id', ids) depois da janela de
// agrupamento; falha transitória devolve os ids à fila com backoff e falha
// permanente (4xx/contrato) é descartada sem insistir.
export const MARK_READ_FLUSH_MS = 250;
const MARK_READ_RETRY_BASE_MS = 1_000;
const MARK_READ_MAX_RETRIES = 3;
const CONTACT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface MarkReadErrorLike {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
  code?: unknown;
}

/**
 * Só falhas comprovadamente transitórias voltam para a fila. Erro 4xx, de
 * contrato/schema e de autorização exige correção humana: repetir só gasta
 * requisição numa operação que nunca vai passar.
 */
export function isTransientMarkReadError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!error || typeof error !== 'object') return false;

  const candidate = error as MarkReadErrorLike;
  if (typeof candidate.name === 'string' && /^(SupabaseQueueSaturated|SupabaseQueueTimeout)Error$/.test(candidate.name)) {
    return true;
  }

  const rawStatus = candidate.status ?? candidate.statusCode;
  const status = typeof rawStatus === 'number'
    ? rawStatus
    : typeof rawStatus === 'string' && /^\d{3}$/.test(rawStatus)
      ? Number(rawStatus)
      : null;
  if (status === 429 || (status !== null && status >= 500)) return true;
  if (status !== null && status >= 400 && status < 500) return false;

  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
  return (
    message.includes('failed to fetch') ||
    message.includes('network request failed') ||
    message.includes('networkerror') ||
    message.includes('load failed') ||
    message.includes('queue saturated') ||
    message.includes('queue wait timed out')
  );
}

let pendingMarkRead = new Set<string>();
let markReadTimer: ReturnType<typeof setTimeout> | null = null;
let markReadRetryCount = 0;

function scheduleMarkReadFlush(delayMs = MARK_READ_FLUSH_MS) {
  if (markReadTimer !== null) clearTimeout(markReadTimer);
  markReadTimer = setTimeout(() => {
    markReadTimer = null;
    void flushPendingMarkRead(true);
  }, delayMs);
}

async function persistReadBatch(contactIds: string[]): Promise<{ error: unknown }> {
  const { error } = await supabase
    .from('messages')
    .update({ is_read: true })
    .in('contact_id', contactIds)
    .eq('sender', 'contact')
    .eq('is_read', false);
  return { error };
}

/**
 * Descarrega agora a fila de leitura (1 PATCH com todos os ids pendentes).
 * `allowRetry=false` é o caminho de saída (unmount/pagehide): a requisição sai
 * sem agendar retry, porque o componente que a pediu já não existe.
 */
export async function flushPendingMarkRead(allowRetry = true): Promise<void> {
  if (markReadTimer !== null) {
    clearTimeout(markReadTimer);
    markReadTimer = null;
  }
  const ids = Array.from(pendingMarkRead);
  pendingMarkRead = new Set();
  if (ids.length === 0) return;

  let error: unknown = null;
  try {
    ({ error } = await persistReadBatch(ids));
  } catch (err) {
    error = err;
  }
  if (!error) {
    markReadRetryCount = 0;
    return;
  }

  const transient = isTransientMarkReadError(error);
  if (transient) {
    for (const id of ids) pendingMarkRead.add(id);
    markReadRetryCount += 1;
  } else {
    markReadRetryCount = 0;
  }
  log.error(
    transient
      ? 'Error marking messages as read (batch); ids kept for retry:'
      : 'Error marking messages as read (batch) is permanent; retry dropped:',
    error
  );
  if (transient && allowRetry && markReadRetryCount <= MARK_READ_MAX_RETRIES) {
    scheduleMarkReadFlush(MARK_READ_RETRY_BASE_MS * 2 ** (markReadRetryCount - 1));
  }
}

const SEEDED_CONTACT_LIMIT = 500;
const RECENT_MESSAGES_LIMIT = 1000;
const CONTACT_FETCH_CHUNK_SIZE = 200;
// Mesmo tamanho de bloco dos contatos: a RPC responde 1 linha por contato, então
// o lote anda em paralelo com CONTACT_FETCH_CHUNK_SIZE sem inflar a resposta.
const CONTACT_SUMMARY_CHUNK_SIZE = 200;

/** Linha da RPC get_inbox_contact_summaries (última mensagem + não lidas por contato). */
interface InboxContactSummaryRow {
  contact_id: string;
  unread_count: number | null;
  last_message_id: string | null;
  last_message_sender: string | null;
  last_message_content: string | null;
  last_message_type: string | null;
  last_message_created_at: string | null;
  last_message_is_read: boolean | null;
  last_message_external_id: string | null;
  last_message_media_url: string | null;
  last_message_status: string | null;
}

export class RealtimeService {
  static async fetchContactsByIds(contactIds: string[]): Promise<ConversationContact[]> {
    const uniqueIds = Array.from(new Set(contactIds.filter(Boolean)));
    if (uniqueIds.length === 0) return [];
    
    const fetchedContacts: ConversationContact[] = [];
    for (const idsChunk of chunkArray(uniqueIds, CONTACT_FETCH_CHUNK_SIZE)) {
      const { data, error } = await supabase
        .from('contacts')
        .select('*, conversation_sla(first_response_at, first_message_at, first_response_breached)')
        .in('id', idsChunk);
        
      if (error) {
        log.error('Error fetching contacts by IDs:', error);
        throw error;
      }
      fetchedContacts.push(...((data ?? []) as ConversationContact[]));
    }
    return dedupeContacts(fetchedContacts);
  }

  /**
   * Última mensagem + contagem de não lidas POR CONTATO, direto do banco.
   *
   * A carga inicial recebe uma amostra GLOBAL de RECENT_MESSAGES_LIMIT mensagens;
   * quando ela é consumida por outros contatos, um contato ativo ficava sem
   * nenhuma mensagem na amostra e a conversa aparecia vazia, com zero não lidas
   * (R2-INB-005). Este agregado é a fonte de verdade do banco e só é consultado
   * para os contatos que a amostra não alcançou.
   *
   * Erro na RPC não derruba a inbox: registra e segue sem o agregado (mesmo
   * comportamento de antes desta mudança).
   */
  static async fetchContactSummaries(
    contactIds: string[],
  ): Promise<Map<string, ContactConversationSummary>> {
    const summaryByContact = new Map<string, ContactConversationSummary>();
    const uniqueIds = Array.from(new Set(contactIds.filter(Boolean)));
    if (uniqueIds.length === 0) return summaryByContact;

    for (const idsChunk of chunkArray(uniqueIds, CONTACT_SUMMARY_CHUNK_SIZE)) {
      try {
        const { data, error } = await supabase.rpc('get_inbox_contact_summaries', {
          p_contact_ids: idsChunk,
        });

        if (error) {
          log.error('Error fetching inbox contact summaries:', error);
          continue;
        }

        for (const row of (data ?? []) as InboxContactSummaryRow[]) {
          if (!row.contact_id || !row.last_message_id || !row.last_message_created_at) continue;
          summaryByContact.set(row.contact_id, {
            unreadCount: row.unread_count ?? 0,
            // A RPC devolve as colunas da última mensagem; o resto do contrato de
            // RealtimeMessage não é lido pela lista (preview e ordenação usam
            // content/created_at) nem pelos caminhos ao vivo, que trazem a linha
            // completa em hydrateConversationForMessage.
            lastMessage: {
              id: row.last_message_id,
              contact_id: row.contact_id,
              sender: row.last_message_sender ?? 'contact',
              content: row.last_message_content ?? '',
              message_type: row.last_message_type ?? 'text',
              created_at: row.last_message_created_at,
              is_read: row.last_message_is_read ?? false,
              external_id: row.last_message_external_id,
              media_url: row.last_message_media_url,
              status: row.last_message_status ?? 'sent',
              status_updated_at: null,
            } as unknown as RealtimeMessage,
          });
        }
      } catch (err) {
        // Inclui o caso em que a RPC ainda não existe no ambiente (a migration
        // não chegou lá): a inbox carrega sem o agregado, como antes desta
        // mudança, em vez de ficar vazia. Não insiste nos blocos seguintes —
        // a falha é da função, não do bloco de ids.
        log.error('Error fetching inbox contact summaries:', err);
        break;
      }
    }

    return summaryByContact;
  }

  static async fetchInitialConversations(): Promise<ConversationWithMessages[]> {
    const { data: seededContacts, error: contactsError } = await supabase
      .from('contacts')
      .select('*, conversation_sla(first_response_at, first_message_at, first_response_breached)')
      .order('updated_at', { ascending: false })
      .limit(SEEDED_CONTACT_LIMIT);
      
    if (contactsError) throw contactsError;
    
    // Filtra stubs (contact_id NULL e placeholders sem conteudo real).
    // Esses registros sao artefatos do race condition no webhook handler
    // e nao devem aparecer na inbox nem inflar o indice do virtualizer.
    const { data: recentMessages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .not('contact_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(RECENT_MESSAGES_LIMIT);
      
    if (messagesError) throw messagesError;

    // Dedup por external_id: mantém a linha com mais conteúdo
    const rawMessages = (recentMessages ?? []) as RealtimeMessage[];
    const dedupedMessages = (() => {
      const seen = new Map<string, RealtimeMessage>();
      for (const m of rawMessages) {
        const key = m.external_id ?? m.id;
        const existing = seen.get(key);
        if (!existing || (m.content?.length ?? 0) > (existing.content?.length ?? 0)) {
          seen.set(key, m);
        }
      }
      return Array.from(seen.values());
    })();

    const normalizedMessages = dedupedMessages.map(normalizeMessage);
    const seededContactRows = (seededContacts ?? []) as ConversationContact[];
    const seededContactIds = new Set(seededContactRows.map((c) => c.id));
    
    const missingContactIds = getUniqueMessageContactIds(normalizedMessages)
      .filter((id) => !seededContactIds.has(id));
      
    const messageContacts = await this.fetchContactsByIds(missingContactIds);

    // A amostra só é considerada truncada quando o banco devolveu o teto de
    // RECENT_MESSAGES_LIMIT linhas: aí pode existir histórico fora da janela global.
    // Com menos linhas que o teto, a amostra é o histórico inteiro e o agregado nem
    // é consultado — inclusive para contato que nunca teve mensagem (R2-INB-005).
    const sampleTruncated = rawMessages.length >= RECENT_MESSAGES_LIMIT;

    // Contatos sem NENHUMA mensagem na amostra global: pergunta o agregado por
    // contato (última mensagem + não lidas) em vez de assumir que o histórico
    // deles está vazio (R2-INB-005).
    const contactIdsWithSampleMessages = new Set(getUniqueMessageContactIds(normalizedMessages));
    const contactIdsMissingSample = sampleTruncated
      ? seededContactRows
          .map((contact) => contact.id)
          .filter((id) => !contactIdsWithSampleMessages.has(id))
      : [];
    const summaries = await this.fetchContactSummaries(contactIdsMissingSample);

    return buildConversations([...seededContactRows, ...messageContacts], normalizedMessages, summaries);
  }

  static subscribeToReactions(messageId: string, onChange: (payload: any) => void) {
    return supabase
      .channel(`chat-reactions:${messageId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'message_reactions',
      }, onChange)
      .subscribe();
  }

  static removeChannel(channel: any) {
    return supabase.removeChannel(channel);
  }

  /**
   * Entra na fila de leitura (agrupa e sai em lote). Mantém a assinatura
   * `Promise<void>` que o hook de mensagens espera: resolve assim que a
   * seleção entra na fila, para o commit otimista da tela sair junto com o
   * clique em vez de esperar a ida ao banco.
   */
  static async markMessagesAsRead(contactId: string): Promise<void> {
    RealtimeService.markManyMessagesAsRead([contactId]);
  }

  /**
   * Fila de leitura: descarta id que não é UUID de contato (deep-link e
   * eventos de chat podem trazer JID) e agenda UM PATCH com todos os ids.
   */
  static markManyMessagesAsRead(contactIds: string[]): void {
    const valid = contactIds.filter(
      (id): id is string => typeof id === 'string' && CONTACT_UUID_RE.test(id)
    );
    if (valid.length !== contactIds.length) {
      // Não loga o valor: pode ser telefone/JID de contato real.
      log.warn('markMessagesAsRead: ids que não são UUID de contato foram descartados');
    }
    if (valid.length === 0) return;
    for (const id of valid) pendingMarkRead.add(id);
    scheduleMarkReadFlush();
  }
}
