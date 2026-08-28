import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

  useEffect(() => {
    if (!open) return;
    supabase.from('whatsapp_connections').select('id, name').eq('status', 'connected')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setConnections(data);
          setSelectedConnection(data[0].id);
        }
      });
  }, [open]);

  useEffect(() => {
    if (!searchQuery.trim() || mode !== 'search') { setContacts([]); return; }
    const timeout = setTimeout(async () => {
      setIsLoading(true);
      const { data } = await supabase.from('contacts')
        .select('id, name, phone, avatar_url')
        .or(`name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`)
        .limit(10);
      setContacts(data || []);
      setIsLoading(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, mode]);

  const resetForm = () => {
    setSearchQuery(''); setSelectedContact(null); setNewPhone(''); setNewName('');
    setMessageText(''); setMode('search');
  };

  const handleSend = async () => {
    if (!messageText.trim()) { toast.error('Digite uma mensagem'); return; }
    setIsSending(true);
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
        }).select('id').single();
        if (error) {
          if (error.code === '23505') { toast.error('Já existe um contato com este número de telefone.'); setIsSending(false); return; }
          throw error;
        }
        contactId = newContact.id;
        await supabase.functions.invoke('batch-fetch-avatars');
      }
      if (!contactId) { toast.error('Selecione um contato'); setIsSending(false); return; }
      const { error: msgError } = await supabase.from('messages').insert({
        contact_id: contactId, content: messageText.trim(), sender: 'agent',
        message_type: 'text', status: 'sending', whatsapp_connection_id: selectedConnection || null,
      });
      if (msgError) throw msgError;
      await supabase.functions.invoke('evolution-api', {
        body: { action: 'send-text', instanceName: connections.find(c => c.id === selectedConnection)?.instance_id || connections.find(c => c.id === selectedConnection)?.name || 'PRINCIPAL',
          number: selectedContact?.phone || newPhone, text: messageText.trim() },
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
    searchQuery, setSearchQuery, contacts, selectedContact, setSelectedContact,
    newPhone, setNewPhone, newName, setNewName, messageText, setMessageText,
    isLoading, isSending, mode, setMode, connections, selectedConnection,
    setSelectedConnection, handleSend, resetForm,
  };
}
