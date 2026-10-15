/**
 * useSaveConversationMemory — escrita manual da memória da conversa.
 *
 * Grava o resumo comercial, as pendências e as promessas feitas do contato em
 * `conversation_memory`. `contact_id` tem índice ÚNICO
 * (`conversation_memory_contact_id_key`), então um INSERT puro falharia no
 * segundo salvamento: a gravação é upsert com `onConflict: 'contact_id'`.
 *
 * A RLS já autoriza as duas operações para o atendente dono do contato
 * (INSERT: with check `is_contact_visible_to_user`; UPDATE: using
 * `is_contact_visible_to_user`), sem coluna nova e sem DDL.
 *
 * A consulta do painel é invalidada pelo chamador com o `reload` de
 * `useConversationMemory` — depois do upsert a lista relê o banco e mostra o
 * que ficou gravado.
 */
import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

/** Teto de caracteres por campo (textareas da tela e do payload). */
export const MEMORY_FIELD_MAX = 2000;

export interface ConversationMemoryDraft {
  commercialSummary: string;
  pendingItems: string[];
  promisesMade: string[];
}

export const EMPTY_MEMORY_DRAFT: ConversationMemoryDraft = {
  commercialSummary: '',
  pendingItems: [],
  promisesMade: [],
};

export function useSaveConversationMemory(contactId: string) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const save = useCallback(async (draft: ConversationMemoryDraft): Promise<boolean> => {
    setSaving(true);
    setError(null);

    const summary = draft.commercialSummary.trim();
    const { error: saveError } = await supabase
      .from('conversation_memory')
      .upsert(
        {
          contact_id: contactId,
          commercial_summary: summary ? summary : null,
          pending_items: draft.pendingItems,
          promises_made: draft.promisesMade,
        },
        { onConflict: 'contact_id' },
      );

    if (saveError) {
      log.error('Error saving conversation memory:', saveError);
      setError('Não foi possível salvar a memória da conversa. Tente de novo.');
      setSaving(false);
      return false;
    }

    setSaving(false);
    return true;
  }, [contactId]);

  return { save, saving, error, clearError };
}
