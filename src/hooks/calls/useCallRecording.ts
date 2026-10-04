import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * D3 (revisado por Joaquim em 29/09) = reconciliar com o Bitrix24 via `voximplant.statistic.get`,
 * e a Fase 7 entregou a Edge `get-call-recording`. Com isto em `true` o hook chama a funcao
 * quando a chamada diz que tem gravacao; a funcao responde 404 se o audio nao existir, e o
 * player trata isso como "sem gravacao" em vez de quebrar a tela.
 *
 * Enquanto `BITRIX_WEBHOOK_URL` nao estiver configurado na Edge, `recording_status` continua
 * 'none' em toda chamada - ou seja, na pratica nada muda ate a fonte existir.
 */
export const SERVICO_DE_GRAVACAO_ATIVO = true;

export interface GravacaoDaChamada {
  disponivel: boolean;
  url: string | null;
}

/**
 * Busca a URL da gravacao (T67), e SO quando a chamada diz que tem.
 *
 * `recording_status` e a unica fonte de verdade: chamada sem gravacao nao dispara
 * requisicao nenhuma (antes a tela montava um <audio src={recording_url}> cru, que
 * apontava para um campo que a leitura nova nem devolve). Sem o servico ligado (D3=b)
 * a resposta e sempre indisponivel - e quem consome sabe disso.
 */
export function useCallRecording(callId: string | null | undefined, recordingStatus: string | null | undefined) {
  const temGravacao = recordingStatus === 'available';
  const habilitado = SERVICO_DE_GRAVACAO_ATIVO && temGravacao && Boolean(callId);

  const query = useQuery({
    queryKey: ['call-recording', callId],
    enabled: habilitado,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<GravacaoDaChamada> => {
      const { data, error } = await supabase.functions.invoke('get-call-recording', { body: { callId } });
      if (error) throw error;
      const url = (data as { url?: string } | null)?.url ?? null;
      return { disponivel: Boolean(url), url };
    },
  });

  return {
    disponivel: Boolean(query.data?.disponivel),
    url: query.data?.url ?? null,
    buscando: query.isLoading,
  };
}
