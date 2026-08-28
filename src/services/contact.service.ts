import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type Contact = Database['public']['Tables']['contacts']['Row'];

export interface SearchContactsParams {
  search_term?: string;
  contact_type_filter?: string | null;
  company_filter?: string | null;
  job_title_filter?: string | null;
  tag_filter?: string | null;
  date_from?: string | null;
  sort_field?: string;
  sort_direction?: string;
  page_size?: number;
  page_offset?: number;
}

export class ContactService {
  static async searchContacts(params: SearchContactsParams) {
    return supabase.rpc('search_contacts', {
      search_term: params.search_term || '',
      contact_type_filter: params.contact_type_filter || null,
      company_filter: params.company_filter || null,
      job_title_filter: params.job_title_filter || null,
      tag_filter: params.tag_filter || null,
      date_from: params.date_from || null,
      sort_field: params.sort_field || 'name',
      sort_direction: params.sort_direction || 'asc',
      page_size: params.page_size || 50,
      page_offset: params.page_offset || 0,
    });
  }

  static async getCountsByType() {
    return supabase.rpc('contacts_count_by_type');
  }

  static async getById(id: string) {
    return supabase.from('contacts').select('*').eq('id', id).maybeSingle();
  }

  static async update(id: string, updates: Database['public']['Tables']['contacts']['Update']) {
    return supabase.from('contacts').update(updates).eq('id', id).select().single();
  }

  static async fetchNotes(contactId: string) {
    const { data, error } = await supabase
      .from('contact_notes')
      .select(`id, contact_id, author_id, content, created_at, updated_at`)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const authorIds = [...new Set(data?.map(n => n.author_id).filter(Boolean) || [])];
    let authors: { id: string, name: string | null, avatar_url: string | null }[] = [];
    
    if (authorIds.length > 0) {
      const { data: authorsData } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', authorIds);
      authors = authorsData || [];
    }

    const authorsMap = new Map(authors.map(a => [a.id, a]));
    return (data || []).map(note => ({
      ...note,
      author: authorsMap.get(note.author_id),
    }));
  }

  static async addNote(contactId: string, authorId: string, content: string) {
    return supabase
      .from('contact_notes')
      .insert({ contact_id: contactId, author_id: authorId, content })
      .select()
      .single();
  }

   static async deleteNote(noteId: string) {
     return supabase.from('contact_notes').delete().eq('id', noteId);
   }
 
   static async fetchCustomFields(contactId: string) {
     return supabase
       .from('contact_custom_fields')
       .select('*')
       .eq('contact_id', contactId)
       .order('field_name');
   }
 
   static async upsertCustomField(payload: Database['public']['Tables']['contact_custom_fields']['Insert']) {
     return supabase.from('contact_custom_fields').upsert(payload);
   }
 
   static async deleteCustomField(fieldId: string) {
     return supabase.from('contact_custom_fields').delete().eq('id', fieldId);
   }
 
   static async fetchEnrichedData(contactId: string) {
     return supabase
       .from('contacts')
       .select('company, job_title, nickname, surname, contact_type, ai_sentiment, ai_priority, channel_type')
       .eq('id', contactId)
       .single();
   }
 
   static async fetchAITags(contactId: string) {
     return supabase
       .from('ai_conversation_tags')
       .select('id, tag_name, confidence, source')
       .eq('contact_id', contactId)
       .order('confidence', { ascending: false });
   }
 
   static async fetchSLA(contactId: string) {
     return supabase
       .from('conversation_sla')
       .select('first_response_breached, resolution_breached, first_response_at, resolved_at')
       .eq('contact_id', contactId)
       .order('created_at', { ascending: false })
       .limit(1)
       .maybeSingle();
   }

  static async fetchStats(contactId: string) {
    const { count: messageCount } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('contact_id', contactId);

    const { data: messages } = await supabase
      .from('messages')
      .select('created_at')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(500);

    const uniqueDays = new Set(messages?.map(m => new Date(m.created_at).toDateString()) || []);
    const { data: csatData } = await supabase.from('csat_surveys').select('rating').eq('contact_id', contactId);
    const csatAvg = csatData && csatData.length > 0 ? csatData.reduce((sum, s) => sum + s.rating, 0) / csatData.length : null;

    const { data: agentMessages } = await supabase
      .from('messages')
      .select('created_at, sender')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true })
      .limit(200);

    let totalResponseTime = 0;
    let responseCount = 0;
    if (agentMessages) {
      for (let i = 1; i < agentMessages.length; i++) {
        if (agentMessages[i].sender === 'agent' && agentMessages[i - 1].sender === 'contact') {
          const diff = new Date(agentMessages[i].created_at).getTime() - new Date(agentMessages[i - 1].created_at).getTime();
          totalResponseTime += diff;
          responseCount++;
        }
      }
    }

    return {
      totalMessages: messageCount || 0,
      avgResponseTimeMinutes: responseCount > 0 ? Math.round(totalResponseTime / (responseCount * 60000)) : 0,
      totalConversations: uniqueDays.size,
      csatAverage: csatAvg,
      csatCount: csatData?.length || 0,
    };
  }
}
