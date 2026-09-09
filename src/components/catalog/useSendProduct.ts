import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';
import { getLogger } from '@/lib/logger';
import { sendOutboundMessage } from '@/services/outbound-message.service';

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

  // A single scheduled fetch owns both the recent and filtered lists.  Besides
  // avoiding overlapping requests, state changes only happen after the effect
  // has yielded, which prevents a synchronous render cascade on step changes.
  useEffect(() => {
    let cancelled = false;
    const query = contactSearch.trim();
    const timeout = setTimeout(async () => {
      if (step !== 'selectContact') {
        setContactResults([]);
        setSearchingContacts(false);
        return;
      }

      setSearchingContacts(true);
      const request = query
        ? supabase
          .from('contacts')
          .select('id, name, phone, avatar_url')
          .or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
          .limit(15)
        : supabase
          .from('contacts')
          .select('id, name, phone, avatar_url')
          .order('updated_at', { ascending: false })
          .limit(15);
      const { data } = await request;
      if (!cancelled) {
        setContactResults(data || []);
        setSearchingContacts(false);
      }
    }, query ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [contactSearch, step]);

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
      // Send images
      let imageFailed = 0;
      for (const imgUrl of imageUrls) {
        try {
          // Keep the old empty provider caption. The image URL is stored in
          // media_url; it must never become customer-facing message text.
          await sendOutboundMessage({ contactId: contact.id, content: '', messageType: 'image', mediaUrl: imgUrl });
        } catch {
          imageFailed++;
        }
      }

      // Send text
      let textFailed = false;
      try { await sendOutboundMessage({ contactId: contact.id, content: message, messageType: 'text' }); }
      catch { textFailed = true; }

      const totalFailed = imageFailed + (textFailed ? 1 : 0);
      if (totalFailed > 0) {
        toast({ title: 'Envio parcial', description: `${totalFailed} mensagem(ns) falharam para ${contact.name}`, variant: 'destructive' });
      } else {
        toast({ title: '✅ Produto enviado!', description: `Enviado para ${contact.name}` });
      }
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
