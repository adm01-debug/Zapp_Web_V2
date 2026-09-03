import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { useActionFeedback } from '@/hooks/ui/useActionFeedback';
import { useContactsSearch } from '@/hooks/crm/useContactsSearch';

interface ContactFormData {
  name: string;
  nickname: string;
  surname: string;
  job_title: string;
  company: string;
  phone: string;
  email: string;
  contact_type: string;
}

const EMPTY_CONTACT: ContactFormData = {
  name: '', nickname: '', surname: '', job_title: '',
  company: '', phone: '', email: '', contact_type: 'cliente',
};

export interface Contact {
  id: string;
  name: string;
  nickname: string | null;
  surname: string | null;
  job_title: string | null;
  company: string | null;
  phone: string;
  email: string | null;
  contact_type: string | null;
}

export function useContactsCRUD() {
  const { profile } = useAuth();
  const feedback = useActionFeedback();
  const searchHook = useContactsSearch();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [showSuccess, setShowSuccess] = useState<{ name: string; protocol: string } | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [isCRMSearchOpen, setIsCRMSearchOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newContact, setNewContact] = useState<ContactFormData>({ ...EMPTY_CONTACT });

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const openContactChat = useCallback((contactId: string) => {
    const appWindow = window as Window & { __pendingOpenContactId?: string };
    appWindow.__pendingOpenContactId = contactId;
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') !== 'inbox') {
      const u = new URL(window.location.href);
      u.searchParams.set('view', 'inbox');
      u.hash = '';
      window.history.pushState(null, '', u.href);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
    let attempts = 0;
    const tryDispatch = () => {
      attempts++;
      window.dispatchEvent(new CustomEvent('open-contact-chat', { detail: { contactId } }));
      if (attempts < 15) setTimeout(tryDispatch, 200);
    };
    setTimeout(tryDispatch, 150);
  }, []);

  const generateProtocol = useCallback(() => {
    const now = new Date();
    return `CT-${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
  }, []);

  const handleAddContact = async () => {
    if (!newContact.name || !newContact.phone) {
      feedback.warning('Preencha os campos obrigatórios');
      return;
    }
    setIsSubmitting(true);
    await feedback.withFeedback(
      async () => {
        const { error } = await supabase.from('contacts').insert({
          name: newContact.name,
          nickname: newContact.nickname || null,
          surname: newContact.surname || null,
          job_title: newContact.job_title || null,
          company: newContact.company || null,
          phone: newContact.phone.replace(/\D/g, ''),
          email: newContact.email || null,
          contact_type: newContact.contact_type,
          assigned_to: profile?.id || null,
        });
        if (error) {
          if (error.code === '23505') {
            throw new Error('Já existe um contato cadastrado com este número de telefone.');
          }
          throw error;
        }
      },
      {
        loadingMessage: 'Adicionando contato...',
        successMessage: 'Contato adicionado com sucesso!',
        errorMessage: 'Erro ao adicionar contato',
        onSuccess: () => {
          const protocol = generateProtocol();
          const contactName = newContact.name;
          setNewContact({ ...EMPTY_CONTACT });
          setIsAddDialogOpen(false);
          setShowSuccess({ name: contactName, protocol });
          searchHook.refetch();
        },
      }
    );
    setIsSubmitting(false);
  };

  const handleEditContact = async () => {
    if (!editingContact) return;
    setIsSubmitting(true);
    await feedback.withFeedback(
      async () => {
        const { error } = await supabase
          .from('contacts')
          .update({
            name: editingContact.name,
            nickname: editingContact.nickname,
            surname: editingContact.surname,
            job_title: editingContact.job_title,
            company: editingContact.company,
            phone: editingContact.phone.replace(/\D/g, ''),
            email: editingContact.email?.trim() || null,
            contact_type: editingContact.contact_type,
          })
          .eq('id', editingContact.id);
        if (error) {
          if (error.code === '23505' && error.message?.includes('contacts_phone_unique')) {
            throw new Error('Já existe outro contato com este número de telefone.');
          }
          throw error;
        }
      },
      {
        loadingMessage: 'Salvando alterações...',
        successMessage: 'Contato atualizado com sucesso!',
        errorMessage: 'Erro ao atualizar contato',
        onSuccess: () => {
          setIsEditDialogOpen(false);
          setEditingContact(null);
          searchHook.refetch();
        },
      }
    );
    setIsSubmitting(false);
  };

  const handleDeleteContact = async (id: string) => {
    await feedback.withFeedback(
      async () => {
        const { error } = await supabase.from('contacts').delete().eq('id', id);
        if (error) throw error;
      },
      {
        loadingMessage: 'Excluindo contato...',
        successMessage: 'Contato excluído com sucesso!',
        errorMessage: 'Erro ao excluir contato',
        onSuccess: () => {
          setDeleteTarget(null);
          searchHook.refetch();
        },
      }
    );
  };

  const openEditDialog = (contact: Contact) => {
    setEditingContact(contact);
    setIsEditDialogOpen(true);
  };

  const handleCancelForm = useCallback(() => {
    setIsAddDialogOpen(false);
    setIsEditDialogOpen(false);
  }, []);

  const handleNewContactChange = useCallback((field: string, value: string) => {
    setNewContact(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleEditContactChange = useCallback((field: string, value: string) => {
    setEditingContact(prev => prev ? { ...prev, [field]: value } as Contact : null);
  }, []);

  return {
    ...searchHook,
    profile, feedback, scrollContainerRef,
    isSubmitting, deleteTarget, setDeleteTarget,
    showSuccess, setShowSuccess,
    isAddDialogOpen, setIsAddDialogOpen,
    isEditDialogOpen, setIsEditDialogOpen,
    editingContact, showFilters, setShowFilters,
    isCRMSearchOpen, setIsCRMSearchOpen,
    selectedIds, setSelectedIds,
    newContact, openContactChat,
    handleAddContact, handleEditContact, handleDeleteContact,
    openEditDialog, handleCancelForm,
    handleNewContactChange, handleEditContactChange,
  };
}
