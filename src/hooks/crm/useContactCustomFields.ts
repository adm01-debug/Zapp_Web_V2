import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ContactService } from '@/services/contact.service';
import { log } from '@/lib/logger';

export interface CustomField {
  id: string;
  contact_id: string;
  field_name: string;
  field_value: string | null;
  field_type: string;
  created_at: string;
  updated_at: string;
}

/**
 * `contact_id` que não é UUID não tem linha em `contact_custom_fields`: o id vem da
 * rota/da amostra do wizard e, quando é um placeholder ("new", "sample"), a consulta
 * era disparada à toa e voltava vazia — agora `enabled` já a impede.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidContactId(value: string | undefined | null): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Campos personalizados mudam pouco; 30s evita refetch a cada remontagem do wizard. */
const FIELDS_STALE_TIME = 30_000;

export function useContactCustomFields(contactId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['contact-custom-fields', contactId ?? null] as const, [contactId]);
  const enabled = isValidContactId(contactId);

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    enabled,
    staleTime: FIELDS_STALE_TIME,
    queryFn: async (): Promise<CustomField[]> => {
      const { data, error } = await ContactService.fetchCustomFields(contactId as string);
      if (error) {
        log.error('Error fetching custom fields:', error);
        throw error;
      }
      return (data || []) as CustomField[];
    },
  });

  const addField = useCallback(
    async (fieldName: string, fieldValue: string, fieldType = 'text') => {
      if (!isValidContactId(contactId)) return;
      try {
        const { error } = await ContactService.upsertCustomField({
          contact_id: contactId,
          field_name: fieldName,
          field_value: fieldValue,
          field_type: fieldType,
        });
        if (error) throw error;
        await queryClient.invalidateQueries({ queryKey });
      } catch (err) {
        log.error('Error adding custom field:', err);
        throw err;
      }
    },
    [contactId, queryClient, queryKey],
  );

  const removeField = useCallback(
    async (fieldId: string) => {
      try {
        const { error } = await ContactService.deleteCustomField(fieldId);
        if (error) throw error;
        await queryClient.invalidateQueries({ queryKey });
      } catch (err) {
        log.error('Error removing custom field:', err);
        throw err;
      }
    },
    [queryClient, queryKey],
  );

  return { fields: data ?? [], isLoading, addField, removeField, refetch };
}
