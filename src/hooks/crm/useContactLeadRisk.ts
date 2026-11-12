/**
 * useContactLeadRisk — lead score, risk score, origem do lead e consentimento
 * LGPD do contato (`contacts`), com a gravação parcial usada pelo painel
 * "Score e LGPD". Ao salvar, invalida também `contact-lead-score` (lido pela
 * aba IA), para as duas telas mostrarem o mesmo número.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ContactLeadRisk {
  lead_score: number | null;
  risk_score: number | null;
  lead_origin: string | null;
  consent_status: string | null;
}

export const contactLeadRiskKey = (contactId: string) => ['contact-lead-risk', contactId] as const;

export function useContactLeadRisk(contactId: string) {
  return useQuery({
    queryKey: contactLeadRiskKey(contactId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('lead_score, risk_score, lead_origin, consent_status')
        .eq('id', contactId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ContactLeadRisk | null;
    },
    enabled: !!contactId,
  });
}

export function useUpdateContactLeadRisk(contactId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (changes: Partial<ContactLeadRisk>) => {
      const { error } = await supabase.from('contacts').update(changes).eq('id', contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contactLeadRiskKey(contactId) });
      void queryClient.invalidateQueries({ queryKey: ['contact-lead-score', contactId] });
    },
  });
}
