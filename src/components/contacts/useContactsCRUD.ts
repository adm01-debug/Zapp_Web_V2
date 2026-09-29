import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { ContactService } from '@/services/contact.service';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/auth/useAuth';
import { useActionFeedback } from '@/hooks/ui/useActionFeedback';
import { useContactsSearch } from '@/hooks/crm/useContactsSearch';
import { navigateToView } from '@/hooks/system/useNavigationHistory';

interface ContactFormData {
  name: string;
  nickname: string;
  surname: string;
  job_title: string;
  company: string;
  phone: string;
  email: string;
  contact_type: string;
  postal_code: string;
  address: string;
  address_number: string;
  neighborhood: string;
  city: string;
  state: string;
  latitude: string;
  longitude: string;
}

const EMPTY_CONTACT: ContactFormData = {
  name: '', nickname: '', surname: '', job_title: '',
  company: '', phone: '', email: '', contact_type: 'cliente',
  postal_code: '', address: '', address_number: '', neighborhood: '', city: '', state: '',
  latitude: '', longitude: '',
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
  postal_code?: string | null;
  address?: string | null;
  address_number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  latitude?: string | null;
  longitude?: string | null;
}

/** `latitude`/`longitude` chegam como string (campo do form) ou number (linha do banco). */
function toCoordinate(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  const parsed = Number(text);
  return text && Number.isFinite(parsed) ? parsed : null;
}

function coordinateToForm(value: number | null): string | null {
  return value === null || value === undefined ? null : String(value);
}

/** Campos de endereço que só entram no UPDATE quando a linha carregada os trouxe (C1/E04). */
const ADDRESS_FIELDS = ['postal_code', 'address', 'address_number', 'neighborhood', 'city', 'state'] as const;

/**
 * Fallback do E05: quando o `getById` não devolve a linha completa, o form abre com a
 * linha resumida da lista. Remover as chaves de endereço faz o guarda do E04 não gravá-las,
 * em vez de sobrescrever o banco com `null` ou com um valor velho.
 */
function withoutAddressFields(contact: Contact): Contact {
  const copy: Record<string, unknown> = { ...contact };
  for (const field of ADDRESS_FIELDS) delete copy[field];
  delete copy.latitude;
  delete copy.longitude;
  return copy as unknown as Contact;
}

export function useContactsCRUD() {
  const { profile } = useAuth();
  const feedback = useActionFeedback();
  const searchHook = useContactsSearch();
  const queryClient = useQueryClient();
  const invalidateKpi = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['contacts-kpi'] });
  }, [queryClient]);

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
    if (new URLSearchParams(window.location.search).get('view') !== 'inbox') {
      navigateToView('inbox');
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
          postal_code: newContact.postal_code || null,
          address: newContact.address || null,
          address_number: newContact.address_number || null,
          neighborhood: newContact.neighborhood || null,
          city: newContact.city || null,
          state: newContact.state || null,
          latitude: toCoordinate(newContact.latitude),
          longitude: toCoordinate(newContact.longitude),
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
          invalidateKpi();
        },
      }
    );
    setIsSubmitting(false);
  };

  const handleEditContact = async () => {
    if (!editingContact) return;
    const contact = editingContact;
    setIsSubmitting(true);
    await feedback.withFeedback(
      async () => {
        const payload: Database['public']['Tables']['contacts']['Update'] = {
          name: contact.name,
          nickname: contact.nickname,
          surname: contact.surname,
          job_title: contact.job_title,
          company: contact.company,
          phone: contact.phone.replace(/\D/g, ''),
          email: contact.email?.trim() || null,
          contact_type: contact.contact_type,
        };
        // C1/E04: campo que não veio na linha carregada não entra no UPDATE
        // (ausente = coluna intocada; string vazia digitada pelo operador continua virando null).
        for (const field of ADDRESS_FIELDS) {
          if (field in contact) (payload as Record<string, unknown>)[field] = contact[field] || null;
        }
        if ('latitude' in contact) payload.latitude = toCoordinate(contact.latitude);
        if ('longitude' in contact) payload.longitude = toCoordinate(contact.longitude);

        const { error } = await supabase
          .from('contacts')
          .update(payload)
          .eq('id', contact.id);
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
          invalidateKpi();
        },
      }
    );
    setIsSubmitting(false);
  };

  const handleDeleteContact = async (id: string) => {
    await feedback.withFeedback(
      async () => {
        const { error } = await supabase.from('contacts').delete().eq('id', id);
        if (error) throw new Error(error.code === "23503" ? "Não é possível excluir: este contato está vinculado a conversas ou registros relacionados." : "Erro ao excluir contato. Tente novamente.");
      },
      {
        loadingMessage: 'Excluindo contato...',
        successMessage: 'Contato excluído com sucesso!',
        errorMessage: 'Erro ao excluir contato',
        onSuccess: () => {
          setDeleteTarget(null);
          searchHook.refetch();
          invalidateKpi();
        },
      }
    );
  };

  /**
   * E05/C1: abre a edição com a LINHA COMPLETA (`select('*')`), não com a linha
   * resumida da lista — que não traz os campos de endereço. Se o `getById` falhar
   * (RLS), abre com a linha da lista avisando o operador; nesse caso o E04 impede
   * que os campos de endereço sejam gravados.
   */
  const openEditDialog = useCallback(async (contact: Contact) => {
    setIsSubmitting(true);
    try {
      const { data, error } = await ContactService.getById(contact.id);
      if (error) throw error;
      if (data) {
        setEditingContact({
          ...data,
          latitude: coordinateToForm(data.latitude),
          longitude: coordinateToForm(data.longitude),
        } as Contact);
      } else {
        setEditingContact(withoutAddressFields(contact));
        feedback.warning('Endereço não carregado — os campos de endereço não serão alterados.');
      }
    } catch {
      setEditingContact(withoutAddressFields(contact));
      feedback.warning('Endereço não carregado — os campos de endereço não serão alterados.');
    } finally {
      setIsSubmitting(false);
      setIsEditDialogOpen(true);
    }
  }, [feedback]);

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
