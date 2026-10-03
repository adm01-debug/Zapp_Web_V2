import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * D3 = Bitrix24: a gravacao ainda nao tem servico contratado (T67). Com isto em `false`
 * o hook NAO chama `get-call-recording` e o `RecordingPlayer` devolve `null` - a tela nao
 * oferece um player que nao tem de onde tocar.
 */
export const SERVICO_DE_GRAVACAO_ATIVO = false;

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
