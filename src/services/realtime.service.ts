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
  CONVERSATIONS_PAGE_SIZE,
  ContactConversationSummary
} from '@/hooks/realtime/realtimeUtils';
import { getLogger } from '@/lib/logger';

const log = getLogger('RealtimeService');
// Tamanho da página da lista de conversas (carregar mais/rolagem infinita).
// Substitui o teto de 500 contatos de uma tacada: sem paginação o operador nunca
// alcançava o contato 501 em diante. Vive no realtimeUtils (módulo folha) para o
// hook importar o número sem depender de mock do serviço.
const RECENT_MESSAGES_LIMIT = 1000;
const CONTACT_FETCH_CHUNK_SIZE = 200;
// Mesmo tamanho de bloco dos contatos: a RPC responde 1 linha por contato, então
// o lote anda em paralelo com CONTACT_FETCH_CHUNK_SIZE sem inflar a resposta.
const CONTACT_SUMMARY_CHUNK_SIZE = 200;

/** Posição da paginação por cursor (chave = updated_at + id, desempate estável). */
export interface ConversationsCursor {
  updatedAt: string;
  id: string;
}

/** Uma página da lista de conversas: itens + se há próxima página e o cursor dela. */
export interface ConversationsPage {
  conversations: ConversationWithMessages[];
  hasMore: boolean;
  nextCursor: ConversationsCursor | null;
}

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
   * É a fonte de verdade da lista: consultada para TODOS os contatos exibidos,
   * porque a amostra GLOBAL de RECENT_MESSAGES_LIMIT mensagens pode estar
   * truncada e subcontava as não lidas de um contato ativo (R2-INB-005).
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

  /**
   * Mensagens que a lista precisa em memória para os contatos de UMA página:
   * a janela recente global (prévia/offline, como antes) MAIS todas as não lidas
   * desses contatos. As não lidas completas garantem que a contagem derivada nos
   * caminhos ao vivo (nova mensagem, UPDATE de status) bata com o agregado do
   * banco — sem isso um contato com não lidas fora da janela global mostraria o
   * número certo no carregamento e um número menor no primeiro evento.
   */
  private static async fetchMessagesForContacts(
    contactIds: string[],
  ): Promise<ReturnType<typeof normalizeMessage>[]> {
    const uniqueIds = Array.from(new Set(contactIds.filter(Boolean)));

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

    let unreadMessages: RealtimeMessage[] = [];
    if (uniqueIds.length > 0) {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .in('contact_id', uniqueIds)
          .eq('sender', 'contact')
          .eq('is_read', false);
        if (error) {
          log.error('Error fetching unread messages:', error);
        } else {
          unreadMessages = (data ?? []) as RealtimeMessage[];
        }
      } catch (err) {
        // Sem as não lidas completas a lista ainda carrega; a contagem cai para a
        // amostra (comportamento anterior) em vez de derrubar a inbox.
        log.error('Error fetching unread messages:', err);
      }
    }

    // Dedup por external_id: mantém a linha com mais conteúdo
    const rawMessages = [...((recentMessages ?? []) as RealtimeMessage[]), ...unreadMessages];
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

    return dedupedMessages.map(normalizeMessage);
  }

  /**
   * Uma página da lista de conversas por cursor (carregar mais/rolagem infinita).
   *
   * Ordenação determinística por `contacts.updated_at DESC, id DESC` (o webhook
   * toca `updated_at` a cada mensagem, então a ordem acompanha a atividade); o
   * cursor repete esses dois campos para não repetir nem pular contato na borda
   * da página. O agregado do banco é consultado para TODOS os contatos da página
   * — não lidas e última mensagem exatas, sem depender da amostra de mensagens.
   */
  static async fetchConversationsPage(
    cursor: ConversationsCursor | null = null,
    pageSize: number = CONVERSATIONS_PAGE_SIZE,
  ): Promise<ConversationsPage> {
    // Pede 1 linha a mais que a página: se vier, há próxima página. Evita uma
    // segunda consulta só para saber se acabou.
    let query = supabase
      .from('contacts')
      .select('*, conversation_sla(first_response_at, first_message_at, first_response_breached)')
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(pageSize + 1);

    if (cursor) {
      // Chave composta: updated_at menor, OU o mesmo updated_at com id menor
      // (desempate estável).
      query = query.or(
        `updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`,
      );
    }

    const { data: seededContacts, error: contactsError } = await query;
    if (contactsError) throw contactsError;

    const rows = (seededContacts ?? []) as ConversationContact[];
    const hasMore = rows.length > pageSize;
    const pageContacts = rows.slice(0, pageSize);
    const lastOfPage = pageContacts[pageContacts.length - 1];
    const nextCursor: ConversationsCursor | null =
      hasMore && lastOfPage
        ? { updatedAt: lastOfPage.updated_at, id: lastOfPage.id }
        : null;

    const pageContactIds = pageContacts.map((c) => c.id);
    const normalizedMessages = await this.fetchMessagesForContacts(pageContactIds);

    // Mantém o comportamento de antes (R2-INB-005): contato referenciado por
    // mensagem recente que não veio na página também entra na lista, com o
    // agregado do banco cobrindo a última mensagem e as não lidas dele.
    const pageContactIdSet = new Set(pageContactIds);
    const missingContactIds = getUniqueMessageContactIds(normalizedMessages)
      .filter((id) => !pageContactIdSet.has(id));
    const messageContacts = await this.fetchContactsByIds(missingContactIds);

    const displayedContacts = [...pageContacts, ...messageContacts];
    const summaries = await this.fetchContactSummaries(displayedContacts.map((c) => c.id));

    const conversations = buildConversations(displayedContacts, normalizedMessages, summaries)
      // buildConversations ordena por última mensagem; a paginação precisa da
      // mesma ordem do cursor (updated_at DESC, id DESC) para as páginas seguintes
      // encaixarem sem repetir/pular.
      .sort((a, b) => {
        const aTime = new Date(a.contact.updated_at).getTime();
        const bTime = new Date(b.contact.updated_at).getTime();
        if (aTime !== bTime) return bTime - aTime;
        return a.contact.id < b.contact.id ? 1 : a.contact.id > b.contact.id ? -1 : 0;
      });

    return { conversations, hasMore, nextCursor };
  }

  /** Primeira página da lista (mantém o contrato antigo: só as conversas). */
  static async fetchInitialConversations(): Promise<ConversationWithMessages[]> {
    const page = await this.fetchConversationsPage(null);
    return page.conversations;
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

  static async markMessagesAsRead(contactId: string): Promise<void> {
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('contact_id', contactId)
      .eq('sender', 'contact')
      .eq('is_read', false);
      
    if (error) {
      log.error('Error marking messages as read:', error);
      throw error;
    }
  }
}
