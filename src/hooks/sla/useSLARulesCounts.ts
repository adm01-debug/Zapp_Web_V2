import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SLARuleScope } from './useSLARules';

/** Contagem de regras por escopo (a chave é a mesma que os mutadores invalidam). */
export type SLARuleScopeCounts = Record<SLARuleScope, number>;

export const SLA_RULES_COUNTS_QUERY_KEY = ['sla-rules-counts'] as const;

/**
 * TTL das contagens: o total só muda quando uma regra é criada/removida, e os
 * mutadores de `useSLARules` já invalidam `['sla-rules-counts']`.
 */
const SLA_RULES_COUNTS_STALE_TIME_MS = 10_000;

/**
 * Conta regras por escopo em UMA leitura compartilhada (antes essa conta era
 * feita inline no `SLARulesManager`, e cada tela repetia a consulta).
 */
export function useSLARulesCounts() {
  return useQuery<SLARuleScopeCounts>({
    queryKey: SLA_RULES_COUNTS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sla_rules')
        .select('contact_id, company, job_title, contact_type, queue_id, agent_id');
      if (error) throw error;

      const counts: SLARuleScopeCounts = {
        contact: 0,
        company: 0,
        job_title: 0,
        contact_type: 0,
        queue: 0,
        agent: 0,
      };

      for (const row of data ?? []) {
        if (row.contact_id) counts.contact++;
        else if (row.company) counts.company++;
        else if (row.job_title) counts.job_title++;
        else if (row.contact_type) counts.contact_type++;
        else if (row.queue_id) counts.queue++;
        else if (row.agent_id) counts.agent++;
      }

      return counts;
    },
    staleTime: SLA_RULES_COUNTS_STALE_TIME_MS,
  });
}
