import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { log } from '@/lib/logger';

type EntityType = 'lead' | 'contact' | 'deal' | 'activity' | 'call';

interface BitrixEntity {
  ID?: string;
  TITLE?: string;
  NAME?: string;
  LAST_NAME?: string;
  PHONE?: Array<{ VALUE: string; VALUE_TYPE: string }>;
  EMAIL?: Array<{ VALUE: string; VALUE_TYPE: string }>;
  [key: string]: unknown;
}

export const useBitrixApi = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callBitrixApi = async (
    action: string,
    entityType?: EntityType,
    entityId?: string,
    data?: Record<string, unknown>,
    filters?: Record<string, unknown>
  ) => {
    setLoading(true);
    setError(null);

    try {
      const { data: response, error: invokeError } = await supabase.functions.invoke('bitrix-api', {
        body: { action, entityType, entityId, data, filters }
      });

      if (invokeError) {
        throw new Error(invokeError.message);
      }

      if (response?.error) {
        throw new Error(response.error);
      }

      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao comunicar com Bitrix';
      setError(errorMessage);
      log.error('Bitrix API error:', err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // === LEADS ===
  const listLeads = async (filters?: Record<string, unknown>) => {
    return callBitrixApi('list', 'lead', undefined, undefined, filters);
  };

  const getLead = async (id: string) => {
    return callBitrixApi('get', 'lead', id);
  };

  const createLead = async (data: Record<string, unknown>) => {
    const result = await callBitrixApi('create', 'lead', undefined, data);
    if (result?.success) {
      toast.success('Lead criado no Bitrix');
    }
    return result;
  };

  const updateLead = async (id: string, data: Record<string, unknown>) => {
    const result = await callBitrixApi('update', 'lead', id, data);
    if (result?.success) {
      toast.success('Lead atualizado no Bitrix');
    }
    return result;
  };

  const deleteLead = async (id: string) => {
    const result = await callBitrixApi('delete', 'lead', id);
    if (result?.success) {
      toast.success('Lead removido do Bitrix');
    }
    return result;
  };

  // === CONTACTS ===
  const listContacts = async (filters?: Record<string, unknown>) => {
    return callBitrixApi('list', 'contact', undefined, undefined, filters);
  };

  const getContact = async (id: string) => {
    return callBitrixApi('get', 'contact', id);
  };

  const createContact = async (data: Record<string, unknown>) => {
    const result = await callBitrixApi('create', 'contact', undefined, data);
    if (result?.success) {
      toast.success('Contato criado no Bitrix');
    }
    return result;
  };

  const updateContact = async (id: string, data: Record<string, unknown>) => {
    const result = await callBitrixApi('update', 'contact', id, data);
    if (result?.success) {
      toast.success('Contato atualizado no Bitrix');
    }
    return result;
  };

  // === DEALS ===
  const listDeals = async (filters?: Record<string, unknown>) => {
    return callBitrixApi('list', 'deal', undefined, undefined, filters);
  };

  const getDeal = async (id: string) => {
    return callBitrixApi('get', 'deal', id);
  };

  const createDeal = async (data: Record<string, unknown>) => {
    const result = await callBitrixApi('create', 'deal', undefined, data);
    if (result?.success) {
      toast.success('Negócio criado no Bitrix');
    }
    return result;
  };

  const updateDeal = async (id: string, data: Record<string, unknown>) => {
    const result = await callBitrixApi('update', 'deal', id, data);
    if (result?.success) {
      toast.success('Negócio atualizado no Bitrix');
    }
    return result;
  };

  // === ACTIVITIES ===
  const listActivities = async (filters?: Record<string, unknown>) => {
    return callBitrixApi('list', 'activity', undefined, undefined, filters);
  };

  const createActivity = async (data: Record<string, unknown>) => {
    const result = await callBitrixApi('create', 'activity', undefined, data);
    if (result?.success) {
      toast.success('Atividade criada no Bitrix');
    }
    return result;
  };

  // === TELEPHONY ===
  const registerCall = async (data: {
    userPhoneInner?: string;
    userId?: string;
    phoneNumber: string;
    type?: 1 | 2; // 1 = outgoing, 2 = incoming
    callStartDate?: string;
    crmCreate?: 0 | 1;
  }) => {
    return callBitrixApi('register_call', 'call', undefined, data);
  };

  const finishCall = async (data: {
    callId: string;
    userId?: string;
    duration: number;
    statusCode?: number;
    addToChat?: 0 | 1;
  }) => {
    return callBitrixApi('finish_call', 'call', undefined, data);
  };

  const attachCallRecord = async (data: {
    callId: string;
    filename: string;
    fileContent: string;
  }) => {
    return callBitrixApi('attach_record', 'call', undefined, data);
  };

  // === SYNC ===
  const syncContactsFromBitrix = async (filters?: Record<string, unknown>) => {
    const result = await callBitrixApi('sync_contacts', undefined, undefined, undefined, filters);
    if (result?.success) {
      toast.success(`${result.synced} contatos sincronizados do Bitrix`);
    }
    return result;
  };

  const pushContactToBitrix = async (contact: {
    name: string;
    surname?: string;
    phone: string;
    email?: string;
    jobTitle?: string;
  }) => {
    const result = await callBitrixApi('push_contact', undefined, undefined, contact);
    if (result?.success) {
      toast.success('Contato enviado para o Bitrix');
    }
    return result;
  };

  const createLeadFromConversation = async (data: {
    contactName: string;
    phone: string;
    contactId?: string;
    conversationSummary?: string;
    title?: string;
  }) => {
    const result = await callBitrixApi('create_lead_from_conversation', undefined, undefined, data);
    if (result?.success) {
      toast.success('Lead criado a partir da conversa');
    }
    return result;
  };

  return {
    loading,
    error,
    // Leads
    listLeads,
    getLead,
    createLead,
    updateLead,
    deleteLead,
    // Contacts
    listContacts,
    getContact,
    createContact,
    updateContact,
    // Deals
    listDeals,
    getDeal,
    createDeal,
    updateDeal,
    // Activities
    listActivities,
    createActivity,
    // Telephony
    registerCall,
    finishCall,
    attachCallRecord,
    // Sync
    syncContactsFromBitrix,
    pushContactToBitrix,
    createLeadFromConversation,
  };
};
