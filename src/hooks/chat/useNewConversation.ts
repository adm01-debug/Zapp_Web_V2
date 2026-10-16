import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { sendOutboundMessage } from '@/services/outbound-message.service';
import { escapeOrFilterValue } from '@/lib/postgrestFilters';
import { invalidateContactsAggregates } from '@/hooks/crm/contactsAggregates';
import { log } from '@/lib/logger';

/** Avatares são enfeite: falha no lote nunca bloqueia envio nem fechamento. */
function refreshAvatarsInBackground() {
  void supabase.functions
    .invoke('batch-fetch-avatars')
    .then(undefined, (avatarError: unknown) => log.warn('batch-fetch-avatars falhou', avatarError));
}

interface ContactResult {
  id: string;
  name: string;
  phone: string;
  avatar_url: string | null;
}

export function useNewConversation(
  open: boolean,
  onConversationStarted?: (contactId: string) => void,
  onClose?: () => void,
) {
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<ContactResult[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactResult | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [messageText, setMessageText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [mode, setMode] = useState<'search' | 'new'>('search');
  const [connections, setConnections] = useState<{ id: string; name: string }[]>([]);
  const [selectedConnection, setSelectedConnection] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    supabase.from('whatsapp_connections').select('id, name').eq('status', 'connected')
      .then(({ data }) => {
        if (cancelled) return;
        if (data && data.length > 0) {
          setConnections(data);
          setSelectedConnection(data[0].id);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    if (!searchQuery.trim() || mode !== 'search') {
      const clearResults = setTimeout(() => {
        if (!cancelled) {
          setContacts([]);
          setIsLoading(false);
        }
      }, 0);
      return () => {
        cancelled = true;
        clearTimeout(clearResults);
      };
    }
    const timeout = setTimeout(async () => {
      setIsLoading(true);
      const { data } = await supabase.from('contacts')
        .select('id, name, phone, avatar_url')
        .or(`name.ilike.${escapeOrFilterValue(`%${searchQuery}%`)},phone.ilike.${escapeOrFilterValue(`%${searchQuery}%`)}`)
        .limit(10);
      if (!cancelled) {
        setContacts(data || []);
        setIsLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [searchQuery, mode]);

  const resetForm = () => {
    setSearchQuery(''); setSelectedContact(null); setNewPhone(''); setNewName('');
    setMessageText(''); setMode('search');
  };

  const handleSend = async () => {
    if (!messageText.trim()) { toast.error('Digite uma mensagem'); return; }
    setIsSending(true);
    let contactCreated = false;
    try {
      let contactId = selectedContact?.id;
      if (mode === 'new' && !contactId) {
        if (!newPhone.trim()) { toast.error('Informe o número do telefone'); setIsSending(false); return; }
        const cleanedNewPhone = newPhone.trim().replace(/\D/g, '');
        const { data: existing } = await supabase.from('contacts').select('id, name').eq('phone', cleanedNewPhone).maybeSingle();
        if (existing) { toast.error(`Já existe um contato com este número: ${existing.name}`); setIsSending(false); return; }
        const { data: newContact, error } = await supabase.from('contacts').insert({
          name: newName.trim() || cleanedNewPhone, phone: cleanedNewPhone,
          whatsapp_connection_id: selectedConnection || null,
        }).select('id').maybeSingle();
        if (error) {
          if (error.code === '23505') { toast.error('Já existe um contato com este número de telefone.'); setIsSending(false); return; }
          throw error;
        }
        if (!newContact) {
          // Sem a linha de volta (RLS devolve vazio): o insert rodou, então o contato existe.
          toast.error('Contato criado, mensagem não enviada');
          setIsSending(false);
          return;
        }
        contactId = newContact.id;
        contactCreated = true;
        // Criar contato no chat muda a quantidade (e o tipo default "cliente") dos contadores.
        invalidateContactsAggregates(queryClient);
        refreshAvatarsInBackground();
      }
      if (!contactId) { toast.error('Selecione um contato'); setIsSending(false); return; }
      await sendOutboundMessage({
        contactId, content: messageText.trim(), messageType: 'text',
        whatsappConnectionId: selectedConnection || null,
      });
      toast.success('Mensagem enviada!');
      refreshAvatarsInBackground();
      onConversationStarted?.(contactId);
      onClose?.();
      resetForm();
    } catch { toast.error(contactCreated ? 'Contato criado, mensagem não enviada' : 'Erro ao enviar mensagem'); }
    finally { setIsSending(false); }
  };

  return {
    searchQuery, setSearchQuery, contacts, selectedContact, setSelectedContact,
    newPhone, setNewPhone, newName, setNewName, messageText, setMessageText,
    isLoading, isSending, mode, setMode, connections, selectedConnection,
    setSelectedConnection, handleSend, resetForm,
  };
}
