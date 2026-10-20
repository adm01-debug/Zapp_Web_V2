import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const contactSummaryNoteKey = (contactId: string | null | undefined) => ['contact-summary-note', contactId] as const;

/**
 * Texto livre de `contacts.notes` — usado pelo card "Resumo comercial" da aba Notas (2.8).
 *
 * Corrida entre gravações (item 259 / R2-AUTH-034): cada `save` recebe um número de ordem.
 * A resposta de uma gravação SUPERADA (uma gravação mais nova já começou) é descartada — ela
 * não publica valor no cache nem vira o resultado na tela. Só a gravação mais recente pode:
 *  · publicar o texto confirmado no cache (`setQueryData`), sem refetch: um refetch poderia
 *    responder com o valor de antes e desfazer o que acabou de ser gravado;
 *  · deixar o erro chegar ao chamador, que assim mantém o texto editado na tela.
 *
 * `isSaving` conta as gravações em voo: true enquanto alguma estiver pendente, false quando
 * a última terminar (o `finally` sempre roda, então não fica preso).
 */
export function useContactSummaryNote(contactId: string | null | undefined) {
  const queryClient = useQueryClient();
  const queryKey = contactSummaryNoteKey(contactId);

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.from('contacts').select('notes').eq('id', contactId as string).maybeSingle();
      if (error) throw error;
      return data?.notes ?? '';
    },
    enabled: !!contactId,
  });

  const writeSeqRef = useRef(0);
  const inFlightRef = useRef(0);
  const [isSaving, setIsSaving] = useState(false);

  const save = useCallback(
    async (notes: string) => {
      const seq = ++writeSeqRef.current;
      inFlightRef.current += 1;
      setIsSaving(true);
      try {
        const { error, count } = await supabase
          .from('contacts')
          .update({ notes }, { count: 'exact' })
          .eq('id', contactId as string);
        if (error) throw error;
        // RLS/contato inexistente: update que não atinge nenhuma linha não é sucesso.
        if (count === 0) throw new Error('Resumo comercial não foi gravado: nenhuma linha afetada.');
        if (seq !== writeSeqRef.current) return; // resposta superada: não publica valor antigo
        queryClient.setQueryData(contactSummaryNoteKey(contactId), notes);
      } finally {
        inFlightRef.current -= 1;
        if (inFlightRef.current === 0) setIsSaving(false);
      }
    },
    [contactId, queryClient],
  );

  return { summary: data ?? '', isLoading, save, isSaving };
}
