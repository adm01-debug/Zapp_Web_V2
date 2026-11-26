import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Linha de `talkx_data_jobs` — o registro dos jobs de DADOS do Talk X.
 *
 * Hoje existe um job: `recompute_purchase_metrics`, que recalcula os atributos de compra
 * (RFM) de `talkx_contact_attributes`, os mesmos que a segmentação usa.
 */
export interface TalkXDataJob {
  job: string;
  interval_minutes: number;
  enabled: boolean;
  last_started_at: string | null;
  last_finished_at: string | null;
  updated_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as any;

async function fetchDataJobs(): Promise<TalkXDataJob[]> {
  const { data, error } = await db
    .from('talkx_data_jobs')
    .select('job, interval_minutes, enabled, last_started_at, last_finished_at, updated_at')
    .order('job');
  if (error) throw error;
  return (data ?? []) as TalkXDataJob[];
}

/**
 * Jobs de dados do Talk X (somente leitura — quem escreve é o agendador, com
 * `service_role`). O cache é curto porque o que interessa aqui é a idade da última
 * execução: com 5 min de cache o painel passaria a mentir sobre um job recém-terminado.
 */
export function useTalkXDataJobs() {
  return useQuery<TalkXDataJob[], Error>({
    queryKey: ['talkx-data-jobs'],
    queryFn: fetchDataJobs,
    staleTime: 60 * 1000,
  });
}
