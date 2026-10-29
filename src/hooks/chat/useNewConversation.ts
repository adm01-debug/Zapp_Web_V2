import { useState, useEffect, useRef, useCallback } from 'react';
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
  const [selectedConnection, setSelectedConnection] = useState('');
  // Ref (não estado): vira true só dentro da resposta assíncrona das conexões.
  // Nenhum setState síncrono no corpo do efeito — reset acontece no resetForm
  // (fechar o modal), que é manipulador de evento, não efeito.
  const connectionsLoadedRef = useRef(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    supabase.from('whatsapp_connections').select('id, name').eq('status', 'connected')
      .then(({ data, error }) => {
        if (cancelled) return;
        // Sem resposta boa não dá para afirmar que a conexão do contato caiu.
        if (error) return;
        setConnections(data ?? []);
        if (data && data.length > 0) {
          setSelectedConnection(data[0].id);
        }
        connectionsLoadedRef.current = true;
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
    connectionsLoadedRef.current = false;
  };

  // Trocar de contato NÃO mexe no seletor da sessão (sem efeito colateral e sem
  // ler connections[0] no momento do clique — a corrida seleção x conexões se
  // resolve no handleSend, com a lista já carregada). A conexão do contato é
  // aplicada só na hora de montar o payload (effectiveConnectionId).
  const selectContact = useCallback((contact: ContactResult | null) => {
    setSelectedContact(contact);
  }, []);

  // Conexão que vai no payload: a do contato existente vence o seletor da tela
  // (mandar por outra faz o WhatsApp recusar — erro 463); sem conexão no
  // contato (ou modo novo), vale o seletor da sessão. Se o campo não vier por
  // RLS, ele chega null e o fallback abaixo assume.
  const effectiveConnectionId = selectedContact?.whatsapp_connection_id ?? (selectedConnection || null);

  const handleSend = async () => {
    if (!messageText.trim()) { toast.error('Digite uma mensagem'); return; }
    setIsSending(true);
    try {
      let contactId = selectedContact?.id;
      const contactConnectionId = selectedContact?.whatsapp_connection_id ?? null;
      const connectionId = contactConnectionId ?? (selectedConnection || null);
      // A conexão do contato caiu: avisa e NÃO troca de número sozinho (o cliente
      // não pode receber de um número diferente do habitual sem saber).
      if (
        contactConnectionId
        && connectionsLoadedRef.current
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
    setSelectedConnection, effectiveConnectionId, handleSend, resetForm,
  };
}
