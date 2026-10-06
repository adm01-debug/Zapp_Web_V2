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
  /** Bytes do audio entregues pela Edge; `null` quando nao ha audio (inclusive corpo vazio). */
  blob: Blob | null;
}

/**
 * Busca a gravacao (T67), e SO quando a chamada diz que tem.
 *
 * `recording_status` e a unica fonte de verdade: chamada sem gravacao nao dispara
 * requisicao nenhuma (antes a tela montava um <audio src={recording_url}> cru, que
 * apontava para um campo que a leitura nova nem devolve). Sem o servico ligado (D3=b)
 * a resposta e sempre indisponivel - e quem consome sabe disso.
 *
 * O transporte e o contrato da chamada NAO mudam aqui: continua o mesmo
 * `supabase.functions.invoke` (a Edge ja recebia POST com corpo JSON `{ callId }`) e a
 * resposta JSON `{ url }` continua valendo. O que este cartao acrescenta e a recusa de um
 * corpo de audio VAZIO que chegue como bytes (`Blob`): o SDK resolve o corpo pelo
 * Content-Type e entrega `application/octet-stream`/`application/pdf` como Blob.
 *
 * Um Blob de `size === 0` e um 200 SEM audio - e um Blob vazio e `true` em qualquer teste de
 * existencia, entao a recusa tem de olhar o TAMANHO. Sem isso o corpo vazio viraria
 * `disponivel: true` e o player pediria endereco para um audio que nao existe.
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

      // Corpo em bytes (a Edge entrega o proprio audio, T73): so o corpo COM bytes e gravacao.
      if (data instanceof Blob) {
        if (data.size === 0) return { disponivel: false, url: null, blob: null };
        return { disponivel: true, url: null, blob: data };
      }

      // Corpo JSON `{ url }`: contrato que ja existia, mantido como esta.
      const url = (data as { url?: string } | null)?.url ?? null;
      return { disponivel: Boolean(url), url, blob: null };
    },
  });

  return {
    disponivel: Boolean(query.data?.disponivel),
    url: query.data?.url ?? null,
    // Os bytes ficam disponiveis para quem precisar deles; criar e revogar o endereco `blob:`
    // do audio nao e deste hook.
    blob: query.data?.blob ?? null,
    buscando: query.isLoading,
  };
}
