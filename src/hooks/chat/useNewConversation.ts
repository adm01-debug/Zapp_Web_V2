import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { sendOutboundMessage } from '@/services/outbound-message.service';
import { escapeOrFilterValue } from '@/lib/postgrestFilters';
import { invalidateContactsAggregates } from '@/hooks/crm/contactsAggregates';

interface ContactResult {
  id: string;
  name: string;
  phone: string;
  avatar_url: string | null;
  whatsapp_connection_id: string | null;
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
  const [connectionsLoaded, setConnectionsLoaded] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setConnectionsLoaded(false);
    supabase.from('whatsapp_connections').select('id, name').eq('status', 'connected')
      .then(({ data, error }) => {
        if (cancelled) return;
        // Sem a lista de conexões conectadas não dá para afirmar que a conexão do
        // contato caiu — por isso `connectionsLoaded` só vira true com resposta boa.
        if (error) return;
        setConnections(data ?? []);
        if (data && data.length > 0) setSelectedConnection(data[0].id);
        setConnectionsLoaded(true);
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
        .select('id, name, phone, avatar_url, whatsapp_connection_id')
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

  // O modal mostra o seletor "Conexão WhatsApp"; ao escolher um contato existente ele
  // precisa refletir de qual número a mensagem sai — a conexão do contato (o seletor
  // da tela não troca o número de um contato que já tem o dele).
  const selectContact = useCallback((contact: ContactResult | null) => {
    setSelectedContact(contact);
    setSelectedConnection(contact?.whatsapp_connection_id ?? connections[0]?.id ?? '');
  }, [connections]);

  const handleSend = async () => {
    if (!messageText.trim()) { toast.error('Digite uma mensagem'); return; }
    setIsSending(true);
    try {
      let contactId = selectedContact?.id;
      // Um contato existente já tem a própria conexão — a que recebeu a conversa.
      // Mandar por outra conexão faz o WhatsApp recusar o envio (erro 463), então
      // a conexão do contato vence o seletor da tela; só cai no seletor quando o
      // contato não tem conexão (ou no modo "novo contato", que acabou de nascer).
      const contactConnectionId = selectedContact?.whatsapp_connection_id ?? null;
      const connectionId = contactConnectionId ?? (selectedConnection || null);
      // A conexão do contato caiu: avisa e NÃO troca de número sozinho (o cliente
      // não pode receber de um número diferente do habitual sem saber).
      if (
        contactConnectionId
        && connectionsLoaded
        && !connections.some((c) => c.id === contactConnectionId)
      ) {
        toast.error('A conexão deste contato está desconectada. Reconecte o número para enviar por ele.');
        setIsSending(false);
        return;
      }
      if (mode === 'new' && !contactId) {
        if (!newPhone.trim()) { toast.error('Informe o número do telefone'); setIsSending(false); return; }
        const cleanedNewPhone = newPhone.trim().replace(/\D/g, '');
        const { data: existing } = await supabase.from('contacts').select('id, name').eq('phone', cleanedNewPhone).maybeSingle();
        if (existing) { toast.error(`Já existe um contato com este número: ${existing.name}`); setIsSending(false); return; }
        const { data: newContact, error } = await supabase.from('contacts').insert({
          name: newName.trim() || cleanedNewPhone, phone: cleanedNewPhone,
          whatsapp_connection_id: connectionId,
        }).select('id').single();
        if (error) {
          if (error.code === '23505') { toast.error('Já existe um contato com este número de telefone.'); setIsSending(false); return; }
          throw error;
        }
        contactId = newContact.id;
        // Criar contato no chat muda a quantidade (e o tipo default "cliente") dos contadores.
        invalidateContactsAggregates(queryClient);
        await supabase.functions.invoke('batch-fetch-avatars');
      }
      if (!contactId) { toast.error('Selecione um contato'); setIsSending(false); return; }
      await sendOutboundMessage({
        contactId, content: messageText.trim(), messageType: 'text',
        whatsappConnectionId: connectionId,
      });
      toast.success('Mensagem enviada!');
      await supabase.functions.invoke('batch-fetch-avatars');
      onConversationStarted?.(contactId);
      onClose?.();
      resetForm();
    } catch { toast.error('Erro ao enviar mensagem'); }
    finally { setIsSending(false); }
  };

  return {
    searchQuery, setSearchQuery, contacts, selectedContact, setSelectedContact: selectContact,
    newPhone, setNewPhone, newName, setNewName, messageText, setMessageText,
    isLoading, isSending, mode, setMode, connections, selectedConnection,
    setSelectedConnection, handleSend, resetForm,
  };
}
