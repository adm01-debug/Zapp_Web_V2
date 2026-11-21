// X144 — "Fila por Segmento" (tela 11/13) usa este hook para ler a RPC
// `talkx_campaign_segment_progress` (N-096/X142). O componente NÃO consulta o
// banco (o lint proíbe componente importar o client); quem lê a RPC é o hook e
// passa `rows` prontas para a tela.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseHelpers';
import { toSegmentProgressItems, type TalkXSegmentProgressItem, type TalkXSegmentProgressRpcRow } from '@/components/talkx/tracking/talkxSegmentProgress';

export interface UseTalkXSegmentProgressResult {
  rows: TalkXSegmentProgressItem[] | undefined;
  data: TalkXSegmentProgressRpcRow[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Lê o progresso por público de uma campanha (RPC X142) e já converte em itens
 * prontos para o card (ordem de envio, percentual, done).
 */
export function useTalkXSegmentProgress(campaignId: string | null | undefined): UseTalkXSegmentProgressResult {
  const query = useQuery({
    queryKey: ['talkx-campaign-segment-progress', campaignId],
    queryFn: async (): Promise<TalkXSegmentProgressRpcRow[]> => {
      const { data, error } = await supabase.rpc('talkx_campaign_segment_progress', {
        p_campaign_id: campaignId ?? '',
      });
      if (error) throw new Error('talkx-segment-progress: falha ao consultar talkx_campaign_segment_progress');
      // Defensivo: só aceita array; shape inesperado (ex.: mock de outra RPC)
      // vira lista vazia em vez de crashar a tela do relatório.
      return Array.isArray(data) ? (data as TalkXSegmentProgressRpcRow[]) : [];
    },
    enabled: !!campaignId,
    staleTime: 30_000,
    refetchInterval: (query) => {
      // Enquanto há público ainda não `done`, atualiza (campanha em envio).
      const rows = query.state.data as TalkXSegmentProgressRpcRow[] | undefined;
      const pending = rows?.some((r) => r.status !== 'done' && (r.remaining ?? 0) > 0) ?? false;
      return pending ? 10_000 : false;
    },
  });

  const rows = useMemo(
    () => (query.data ? toSegmentProgressItems(query.data) : undefined),
    [query.data],
  );

  return {
    rows,
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
    refetch: () => { void query.refetch(); },
  };
}
