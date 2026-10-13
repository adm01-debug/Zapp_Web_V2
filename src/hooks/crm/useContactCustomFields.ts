import { useState, useEffect, useCallback } from 'react';
import { ContactService } from '@/services/contact.service';
import { supabase } from '@/integrations/supabase/client';
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

export function useContactCustomFields(contactId: string | undefined) {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchFields = useCallback(async () => {
    if (!contactId) return;
    setIsLoading(true);
    try {
      const { data, error } = await ContactService.fetchCustomFields(contactId);
      if (error) throw error;
      setFields((data || []) as CustomField[]);
    } catch (err) {
      log.error('Error fetching custom fields:', err);
    } finally {
      setIsLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    fetchFields();
  }, [fetchFields]);

  const addField = useCallback(async (fieldName: string, fieldValue: string, fieldType = 'text') => {
    if (!contactId) return;
    try {
      const { error } = await ContactService.upsertCustomField({
        contact_id: contactId,
        field_name: fieldName,
        field_value: fieldValue,
        field_type: fieldType,
      });
      if (error) throw error;
      await fetchFields();
    } catch (err) {
      log.error('Error adding custom field:', err);
      throw err;
    }
  }, [contactId, fetchFields]);

  const updateField = useCallback(async (fieldId: string, fieldValue: string) => {
    try {
      const { error } = await supabase
        .from('contact_custom_fields')
        .update({ field_value: fieldValue })
        .eq('id', fieldId);
      if (error) throw error;
      setFields(prev => prev.map(f => (f.id === fieldId ? { ...f, field_value: fieldValue } : f)));
    } catch (err) {
      log.error('Error updating custom field:', err);
      throw err;
    }
  }, []);

  const removeField = useCallback(async (fieldId: string) => {
    try {
      const { error } = await ContactService.deleteCustomField(fieldId);
      if (error) throw error;
      setFields(prev => prev.filter(f => f.id !== fieldId));
    } catch (err) {
      log.error('Error removing custom field:', err);
      throw err;
    }
  }, []);

  return { fields, isLoading, addField, updateField, removeField, refetch: fetchFields };
}
