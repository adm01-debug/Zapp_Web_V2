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
