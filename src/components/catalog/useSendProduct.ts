import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';
import { getLogger } from '@/lib/logger';

const log = getLogger('useSendProduct');

export interface ContactResult {
  id: string;
  name: string;
  phone: string;
  avatar_url: string | null;
}

export function useContactSearch(step: 'configure' | 'selectContact') {
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState<ContactResult[]>([]);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ContactResult | null>(null);

  // Search contacts with debounce
  useEffect(() => {
    if (step !== 'selectContact' || !contactSearch.trim()) {
      setContactResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearchingContacts(true);
      const { data } = await supabase
        .from('contacts')
        .select('id, name, phone, avatar_url')
        .or(`name.ilike.%${contactSearch}%,phone.ilike.%${contactSearch}%`)
        .limit(15);
      setContactResults(data || []);
      setSearchingContacts(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [contactSearch, step]);

  // Load recent contacts when entering step 2
  useEffect(() => {
    if (step !== 'selectContact') return;
    setSearchingContacts(true);
    supabase
      .from('contacts')
      .select('id, name, phone, avatar_url')
      .order('updated_at', { ascending: false })
      .limit(15)
      .then(({ data }) => {
        if (!contactSearch.trim()) setContactResults(data || []);
        setSearchingContacts(false);
      });
  }, [step]);

  const resetContactSelection = useCallback(() => {
    setSelectedContact(null);
    setContactSearch('');
  }, []);

  return {
    contactSearch, setContactSearch,
    contactResults, searchingContacts,
    selectedContact, setSelectedContact,
    resetContactSelection,
  };
}

export function useSendToContact(onSuccess: () => void) {
  const [isSending, setIsSending] = useState(false);

  const sendProductToContact = useCallback(async (
    contact: ContactResult,
    message: string,
    imageUrls: string[],
  ) => {
    setIsSending(true);
    try {
      const { data: connections } = await supabase
        .from('whatsapp_connections')
        .select('id, name, instance_id')
        .eq('status', 'connected')
        .limit(1);

      const connection = connections?.[0];
      if (!connection) {
        toast({ title: 'Nenhuma conexão ativa', description: 'Conecte uma instância do WhatsApp antes de enviar.', variant: 'destructive' });
        return;
      }

      // Send images
      for (const imgUrl of imageUrls) {
        const { data: dbResult } = await supabase.from('messages').insert({
          contact_id: contact.id,
          content: imgUrl,
          sender: 'agent',
          message_type: 'image',
          status: 'sending',
          whatsapp_connection_id: connection?.id || null,
        }).select('id').single();

        const { data: apiResult, error: apiError } = await supabase.functions.invoke('evolution-api', {
          body: {
            action: 'send-media',
            instanceName: connection?.instance_id || connection?.name || 'PRINCIPAL',
            number: contact.phone,
            mediatype: 'image',
            media: imgUrl,
            caption: '',
          },
        });

        const externalId = apiResult?.key?.id || null;
        if (dbResult?.id) {
          // Falha da API não pode deixar a mensagem em 'sending' para sempre
          if (apiError || apiResult?.error) {
            await supabase.from('messages').update({ status: 'failed' }).eq('id', dbResult.id);
          } else {
            await supabase.from('messages')
              .update({ external_id: externalId, status: 'sent' })
              .eq('id', dbResult.id);
          }
        }
      }

      // Send text
      const { data: textDbResult } = await supabase.from('messages').insert({
        contact_id: contact.id,
        content: message,
        sender: 'agent',
        message_type: 'text',
        status: 'sending',
        whatsapp_connection_id: connection?.id || null,
      }).select('id').single();

      const { data: textApiResult, error: textApiError } = await supabase.functions.invoke('evolution-api', {
        body: {
          action: 'send-text',
          instanceName: connection?.instance_id || connection?.name || 'PRINCIPAL',
          number: contact.phone,
          text: message,
        },
      });

      const textExternalId = textApiResult?.key?.id || null;
      if (textDbResult?.id) {
        if (textApiError || textApiResult?.error) {
          await supabase.from('messages').update({ status: 'failed' }).eq('id', textDbResult.id);
        } else {
          await supabase.from('messages')
            .update({ external_id: textExternalId, status: 'sent' })
            .eq('id', textDbResult.id);
        }
      }

      toast({ title: '✅ Produto enviado!', description: `Enviado para ${contact.name}` });
      onSuccess();
    } catch (err) {
      log.error('Error sending product:', err);
      toast({ title: 'Erro ao enviar produto', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  }, [onSuccess]);

  return { isSending, sendProductToContact };
}
