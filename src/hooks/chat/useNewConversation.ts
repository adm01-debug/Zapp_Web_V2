import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { sendOutboundMessage } from '@/services/outbound-message.service';
import { escapeOrFilterValue } from '@/lib/postgrestFilters';
import { normalizeE164BR, phoneQueryVariants, pickUniquePhoneMatch } from '@/lib/calls/phone';
import { invalidateContactsAggregates } from '@/hooks/crm/contactsAggregates';

interface ContactResult {
  id: string;
  name: string;
  phone: string;
  avatar_url: string | null;
}

/**
 * Teto da busca de candidatos por variante de telefone. Página CHEIA não
 * afirma contato único (pode haver candidato atrás do teto): nesse caso o
 * fluxo deixa o insert seguir e o índice único do banco decide, em vez de
 * abrir a conversa de um contato por engano.
 */
const CONTACT_VARIANT_LOOKUP_LIMIT = 20;

/**
 * Atualiza os avatares em segundo plano. Nunca é aguardado: o envio e o
 * fechamento do fluxo não podem depender de uma Edge Function de avatar.
 */
function refreshAvatarsInBackground() {
  void supabase.functions.invoke('batch-fetch-avatars').catch(() => {});
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
    // Nome do contato recém-criado nesta tentativa: se o envio falhar depois,
    // avisamos que o contato FICOU criado (não deixamos órfão silencioso).
    let createdContactName: string | null = null;
    try {
      let contactId = selectedContact?.id;
      if (mode === 'new' && !contactId) {
        if (!newPhone.trim()) { toast.error('Informe o número do telefone'); setIsSending(false); return; }
        // Forma canônica E.164: aceita máscara, `0` de tronco e número sem o
        // nono dígito. Não normalizável → não cria contato com lixo.
        const e164 = normalizeE164BR(newPhone);
        if (e164 === null) { toast.error('Número de telefone inválido'); setIsSending(false); return; }
        // São as MESMAS grafias que o ingest usa (`generatePhoneVariants` do
        // lado servidor): a base guarda o número com e sem o nono dígito, com
        // e sem `55`. A decisão de duplicidade é sempre E.164 completo.
        const variants = phoneQueryVariants(e164);
        const { data: candidates, error: lookupError } = await supabase.from('contacts')
          .select('id, name, phone')
          .or(variants.map((variant) => `phone.eq.${variant}`).join(','))
          .order('id', { ascending: true })
          .limit(CONTACT_VARIANT_LOOKUP_LIMIT);
        if (lookupError) throw lookupError;
        const rows = (candidates ?? []) as { id: string; name: string; phone: string | null }[];
        const existingId = rows.length >= CONTACT_VARIANT_LOOKUP_LIMIT
          ? null
          : pickUniquePhoneMatch(rows, e164);
        if (existingId !== null) {
          const existingName = rows.find((row) => row.id === existingId)?.name ?? e164;
          toast.error(`Já existe um contato com este número: ${existingName}`);
          setIsSending(false);
          return;
        }
        // `contacts.phone` guarda o local (DDD + assinante), com o nono dígito
        // canônico — mesmo formato que o resto do app consulta.
        const localDigits = e164.slice(3);
        const { data: newContact, error } = await supabase.from('contacts').insert({
          name: newName.trim() || localDigits, phone: localDigits,
          whatsapp_connection_id: selectedConnection || null,
        }).select('id, name').single();
        if (error) {
          if (error.code === '23505') { toast.error('Já existe um contato com este número de telefone.'); setIsSending(false); return; }
          throw error;
        }
        contactId = newContact.id;
        createdContactName = newContact.name ?? null;
        // Criar contato no chat muda a quantidade (e o tipo default "cliente") dos contadores.
        invalidateContactsAggregates(queryClient);
        refreshAvatarsInBackground();
      }
      if (!contactId) { toast.error('Selecione um contato'); setIsSending(false); return; }
      try {
        await sendOutboundMessage({
          contactId, content: messageText.trim(), messageType: 'text',
          whatsappConnectionId: selectedConnection || null,
        });
      } catch {
        // Falha do envio: o contato já existe. Se ele nasceu nesta tentativa,
        // avisamos que FICOU criado (não deixamos órfão sem aviso); o botão
        // continua disponível para reenviar.
        toast.error(
          createdContactName !== null
            ? `Contato "${createdContactName}" criado, mas a mensagem não foi enviada.`
            : 'Erro ao enviar mensagem',
        );
        return;
      }
      toast.success('Mensagem enviada!');
      refreshAvatarsInBackground();
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
