import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SLARuleScope } from './useSLARules';

/** Colunas de escopo de `sla_rules` — as mesmas que decidem a aba de cada regra. */
export const SLA_SCOPE_ROWS_SELECT =
  'contact_id, company, job_title, contact_type, queue_id, agent_id';

export interface SLARuleCountRow {
  contact_id: string | null;
  company: string | null;
  job_title: string | null;
  contact_type: string | null;
  queue_id: string | null;
  agent_id: string | null;
}

export type SLARuleCounts = Record<SLARuleScope, number>;

export function emptySLARuleCounts(): SLARuleCounts {
  return { contact: 0, company: 0, job_title: 0, contact_type: 0, queue: 0, agent: 0 };
}

/**
 * Conta as regras de cada escopo com o MESMO predicado do filtro de lista de
 * `useSLARules` (`useSLARules` l.54-59), que NÃO é uma cascata única por regra:
 * - `contact`: `contact_id` preenchido;
 * - `company`/`job_title`/`contact_type`: a primeira preenchida na ordem, sem
 *   `contact_id` (é assim que a lista de cada aba filtra);
 * - `queue`/`agent`: qualquer regra sem `contact_id` com a coluna preenchida —
 *   a lista dessas abas NÃO exclui as outras colunas.
 *
 * Consequência: uma regra com `company` + `queue_id` aparece nas duas abas e
 * precisa contar nas duas; o selo tem de bater com o conteúdo da aba.
 */
export function countSLARulesByScope(rows: readonly SLARuleCountRow[]): SLARuleCounts {
  const counts = emptySLARuleCounts();

  for (const row of rows) {
    if (row.contact_id) {
      counts.contact += 1;
      continue;
    }
    if (row.company) counts.company += 1;
    else if (row.job_title) counts.job_title += 1;
    else if (row.contact_type) counts.contact_type += 1;

    if (row.queue_id) counts.queue += 1;
    if (row.agent_id) counts.agent += 1;
  }

  return counts;
}

/**
 * Contagens por escopo que alimentam os selos das abas de `SLARulesManager`.
 * Busca só as colunas de escopo numa única consulta e devolve os contadores já
 * calculados. Mesma chave invalidada por `useSLARules` (`['sla-rules-counts']`).
 */
export function useSLARulesCounts() {
  const { data: counts = emptySLARuleCounts(), isLoading } = useQuery({
    queryKey: ['sla-rules-counts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sla_rules').select(SLA_SCOPE_ROWS_SELECT);
      if (error) throw error;
      return countSLARulesByScope((data ?? []) as SLARuleCountRow[]);
    },
    staleTime: 10000,
  });

  return { counts, isLoading };
}
