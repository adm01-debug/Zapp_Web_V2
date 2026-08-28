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
  buildConversation
} from '@/hooks/realtime/realtimeUtils';
import { getLogger } from '@/lib/logger';

const log = getLogger('RealtimeService');
const SEEDED_CONTACT_LIMIT = 500;
const RECENT_MESSAGES_LIMIT = 1000;
const CONTACT_FETCH_CHUNK_SIZE = 200;

export class RealtimeService {
  static async fetchContactsByIds(contactIds: string[]): Promise<ConversationContact[]> {
    const uniqueIds = Array.from(new Set(contactIds.filter(Boolean)));
    if (uniqueIds.length === 0) return [];
    
    const fetchedContacts: ConversationContact[] = [];
    for (const idsChunk of chunkArray(uniqueIds, CONTACT_FETCH_CHUNK_SIZE)) {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .in('id', idsChunk);
        
      if (error) {
        log.error('Error fetching contacts by IDs:', error);
        throw error;
      }
      fetchedContacts.push(...((data ?? []) as ConversationContact[]));
    }
    return dedupeContacts(fetchedContacts);
  }

  static async fetchInitialConversations(): Promise<ConversationWithMessages[]> {
    const { data: seededContacts, error: contactsError } = await supabase
      .from('contacts')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(SEEDED_CONTACT_LIMIT);
      
    if (contactsError) throw contactsError;
    
    const { data: recentMessages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(RECENT_MESSAGES_LIMIT);
      
    if (messagesError) throw messagesError;

    const normalizedMessages = ((recentMessages ?? []) as RealtimeMessage[]).map(normalizeMessage);
    const seededContactRows = (seededContacts ?? []) as ConversationContact[];
    const seededContactIds = new Set(seededContactRows.map((c) => c.id));
    
    const missingContactIds = getUniqueMessageContactIds(normalizedMessages)
      .filter((id) => !seededContactIds.has(id));
      
    const messageContacts = await this.fetchContactsByIds(missingContactIds);
    
    return buildConversations([...seededContactRows, ...messageContacts], normalizedMessages);
  }

  static subscribeToMessages(onInsert: (payload: any) => void, onUpdate: (payload: any) => void, channelName = 'messages-realtime') {
    return supabase.channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, onInsert)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, onUpdate)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          log.debug(`Realtime subscribed: ${channelName}`);
        } else if (status === 'CHANNEL_ERROR') {
          log.error(`Realtime channel error: ${channelName}`);
        }
      });
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
