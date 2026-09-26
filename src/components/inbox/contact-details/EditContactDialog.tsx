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
import type { Database } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

type ContactUpdate = Database['public']['Tables']['contacts']['Update'];

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
    latitude?: number | null;
    longitude?: number | null;
  };
}

function contactToFormValues(contact: EditContactDialogProps['contact']) {
  return {
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
    latitude: contact.latitude != null ? String(contact.latitude) : '',
    longitude: contact.longitude != null ? String(contact.longitude) : '',
  };
}

// Normaliza cada campo do form pro formato de coluna, só quando o campo foi
// de fato alterado (ver `handleSubmit`) — nunca inclui `phone`, que o form
// só exibe e não edita.
const FIELD_NORMALIZERS: Record<string, (raw: string) => string | number | null> = {
  name: (v) => v,
  nickname: (v) => v || null,
  surname: (v) => v || null,
  job_title: (v) => v || null,
  company: (v) => v || null,
  email: (v) => v || null,
  contact_type: (v) => v || null,
  postal_code: (v) => v || null,
  address: (v) => v || null,
  address_number: (v) => v || null,
  neighborhood: (v) => v || null,
  city: (v) => v || null,
  state: (v) => v || null,
  latitude: (v) => (v.trim() && Number.isFinite(Number(v)) ? Number(v) : null),
  longitude: (v) => (v.trim() && Number.isFinite(Number(v)) ? Number(v) : null),
};

export function EditContactDialog({ open, onOpenChange, contact }: EditContactDialogProps) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formValues, setFormValues] = useState(() => contactToFormValues(contact));
  // Snapshot do que o form tinha ao abrir — usado só pra saber quais campos o
  // usuário de fato editou (ver `handleSubmit`), nunca renderizado.
  const [initialValues, setInitialValues] = useState(formValues);
  // O diálogo fica montado o tempo todo (Radix precisa disso pra animar o
  // fechamento); o `useState` acima só captura `contact` na 1a montagem, que
  // acontece antes do usuário nunca ter clicado em "Editar" — nesse momento
  // enrichedData ainda está undefined (React Query ainda não resolveu), então
  // o formulário ficava travado com apelido/cargo/empresa vazios e
  // contact_type='cliente' para sempre. Ressincroniza no instante em que o
  // diálogo é de fato aberto, quando os dados já chegaram (ajuste de state
  // durante o render, sem useEffect, pro React não fazer um 2o commit —
  // https://react.dev/learn/you-might-not-need-an-effect).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      const next = contactToFormValues(contact);
      setFormValues(next);
      setInitialValues(next);
    }
  }

  const handleChange = useCallback((field: string, value: string) => {
    setFormValues(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = async () => {
    setIsSubmitting(true);

    // Manda só os campos que o usuário de fato tocou nesta abertura do
    // diálogo, comparando com `initialValues`. Sem isso, todo Salvar grava
    // TODOS os campos do form, inclusive os que o painel nunca preenche de
    // verdade (endereço/lat-lon: ContactDetails/Crm360Tab não os repassam, e
    // fetchEnrichedData nem seleciona essas colunas — abrem sempre vazios) —
    // sobrescrevendo dado real com null assim que o primeiro endereço for
    // cadastrado por outra tela. Também evita perder um UPDATE que chegou
    // via Realtime num campo que o usuário não mexeu enquanto o diálogo
    // estava aberto (auditoria de 5 agentes, 2026-09-26, 4a rodada).
    const updatePayload: Record<string, string | number | null> = {};
    for (const field of Object.keys(FIELD_NORMALIZERS)) {
      const key = field as keyof typeof formValues;
      if (formValues[key] === initialValues[key]) continue;
      updatePayload[field] = FIELD_NORMALIZERS[field](formValues[key]);
    }

    if (Object.keys(updatePayload).length === 0) {
      setIsSubmitting(false);
      onOpenChange(false);
      return;
    }

    // Optimistic update: update cache immediately for instant UI feedback
    const enrichedKey = ['contact-enriched', contact.id];
    const previousData = queryClient.getQueryData(enrichedKey);

    queryClient.setQueryData(enrichedKey, (old: Record<string, unknown> | undefined) =>
      old ? { ...old, ...updatePayload } : old
    );

    try {
      const { error } = await supabase
        .from('contacts')
        .update(updatePayload as ContactUpdate)
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
