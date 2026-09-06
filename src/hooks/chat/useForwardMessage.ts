import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { toast } from '@/hooks/ui/use-toast';

interface Contact {
  id: string;
  name: string;
  phone: string;
  avatar_url?: string;
}

interface Group {
  id: string;
  name: string;
  avatar_url?: string;
  participant_count: number;
}

export function useForwardMessage(
  open: boolean,
  onForward: (targetIds: string[], targetType: 'contact' | 'group') => void,
  onOpenChange: (open: boolean) => void,
) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'contacts' | 'groups'>('contacts');

  useEffect(() => {
    if (open) {
      fetchContacts();
      fetchGroups();
    }
  }, [open]);

  const fetchContacts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, phone, avatar_url')
        .order('name');
      if (error) throw error;
      setContacts((data || []) as Contact[]);
    } catch (error) {
      log.error('Error fetching contacts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchGroups = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_groups')
        .select('id, name, avatar_url, participant_count')
        .order('name');
      if (error) throw error;
      setGroups((data || []) as Group[]);
    } catch (error) {
      log.error('Error fetching groups:', error);
    }
  };

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.phone.includes(searchQuery)
  );

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleContact = (id: string) => {
    setSelectedContacts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleGroup = (id: string) => {
    setSelectedGroups(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const reset = useCallback(() => {
    setSelectedContacts([]);
    setSelectedGroups([]);
    setSearchQuery('');
  }, []);

  const handleForward = async () => {
    if (selectedContacts.length === 0 && selectedGroups.length === 0) {
      toast({ title: 'Selecione destinatários', description: 'Escolha pelo menos um contato ou grupo para encaminhar.', variant: 'destructive' });
      return;
    }

    setIsSending(true);
    try {
      if (selectedContacts.length > 0) onForward(selectedContacts, 'contact');
      if (selectedGroups.length > 0) onForward(selectedGroups, 'group');

      const total = selectedContacts.length + selectedGroups.length;
      toast({ title: 'Mensagem encaminhada!', description: `Encaminhada para ${total} ${total === 1 ? 'destinatário' : 'destinatários'}.` });
      reset();
      onOpenChange(false);
    } catch {
      toast({ title: 'Erro ao encaminhar', description: 'Não foi possível encaminhar a mensagem.', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const totalSelected = selectedContacts.length + selectedGroups.length;

  return {
    searchQuery, setSearchQuery,
    selectedContacts, selectedGroups,
    filteredContacts, filteredGroups,
    isLoading, isSending,
    activeTab, setActiveTab,
    toggleContact, toggleGroup,
    handleForward, handleClose,
    totalSelected,
  };
}

export type { Contact, Group };
