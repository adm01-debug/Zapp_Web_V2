import { useState, useCallback } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('EditContactDialog');
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { ContactForm } from '@/components/contacts/ContactForm';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface EditContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: {
    id: string;
    name: string;
    phone: string;
    avatar?: string;
    email?: string;
    nickname?: string;
    surname?: string;
    job_title?: string;
    company?: string;
    contact_type?: string | null;
    postal_code?: string | null;
    address?: string | null;
    address_number?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
  };
}

export function EditContactDialog({ open, onOpenChange, contact }: EditContactDialogProps) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formValues, setFormValues] = useState({
    name: contact.name || '',
    nickname: contact.nickname || '',
    surname: contact.surname || '',
    job_title: contact.job_title || '',
    company: contact.company || '',
    phone: contact.phone || '',
    email: contact.email || '',
    contact_type: contact.contact_type || 'cliente',
    postal_code: contact.postal_code || '',
    address: contact.address || '',
    address_number: contact.address_number || '',
    neighborhood: contact.neighborhood || '',
    city: contact.city || '',
    state: contact.state || '',
  });

  const handleChange = useCallback((field: string, value: string) => {
    setFormValues(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = async () => {
    setIsSubmitting(true);

    const updatePayload = {
      name: formValues.name,
      nickname: formValues.nickname || null,
      surname: formValues.surname || null,
      job_title: formValues.job_title || null,
      company: formValues.company || null,
      email: formValues.email || null,
      contact_type: formValues.contact_type || null,
      postal_code: formValues.postal_code || null,
      address: formValues.address || null,
      address_number: formValues.address_number || null,
      neighborhood: formValues.neighborhood || null,
      city: formValues.city || null,
      state: formValues.state || null,
    };

    // Optimistic update: update cache immediately for instant UI feedback
    const enrichedKey = ['contact-enriched', contact.id];
    const previousData = queryClient.getQueryData(enrichedKey);

    queryClient.setQueryData(enrichedKey, (old: Record<string, unknown> | undefined) =>
      old ? { ...old, ...updatePayload } : old
    );

    try {
      const { error } = await supabase
        .from('contacts')
        .update(updatePayload)
        .eq('id', contact.id);

      if (error) throw error;

      toast.success('Contato atualizado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['contact-enriched'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      onOpenChange(false);
    } catch (err) {
      // Rollback optimistic update on error
      if (previousData) {
        queryClient.setQueryData(enrichedKey, previousData);
      }
      log.error('Error updating contact:', err);
      toast.error('Erro ao atualizar contato');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" aria-describedby={undefined} data-testid="edit-contact-dialog">
        <DialogHeader>
          <DialogTitle>Editar Contato</DialogTitle>
        </DialogHeader>
        <ContactForm
          values={formValues}
          onChange={handleChange}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          submitLabel="Salvar"
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
}
