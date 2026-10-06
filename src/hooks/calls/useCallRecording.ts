import { useQuery } from '@tanstack/react-query';
import { edgeAuthHeaders } from '@/lib/edgeAuthHeaders';
import { SUPABASE_URL } from '@/config/supabase';

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
 *
 * O TRANSPORTE e o mesmo contrato que a Edge ja recebia de `supabase.functions.invoke`:
 * `POST` em `/functions/v1/get-call-recording`, com os headers de `edgeAuthHeaders()` (bearer
 * da sessao do usuario, que e o que a Edge exige) mais `Content-Type: application/json`, e o
 * `callId` no CORPO (`JSON.stringify({ callId })`). O `callId` NUNCA vai na query string: a Edge
 * aceita GET e POST, mas o front sempre falou por POST com JSON, e trocar isso mudaria um
 * contrato em producao sem necessidade.
 */
export function useCallRecording(callId: string | null | undefined, recordingStatus: string | null | undefined) {
  const temGravacao = recordingStatus === 'available';
  const habilitado = SERVICO_DE_GRAVACAO_ATIVO && temGravacao && Boolean(callId);

  const query = useQuery({
    queryKey: ['call-recording', callId],
    enabled: habilitado,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<GravacaoDaChamada> => {
      // A Edge roda auth pelo JWT do usuario; a RLS decide quem pode ler a chamada.
      const headers = await edgeAuthHeaders();
      const resposta = await fetch(`${SUPABASE_URL}/functions/v1/get-call-recording`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId }),
      });

      if (!resposta.ok) throw new Error(`Gravacao indisponivel (${resposta.status})`);

      const data = (await resposta.json()) as { url?: string } | null;
      const url = data?.url ?? null;
      return { disponivel: Boolean(url), url };
    },
  });

  return {
    disponivel: Boolean(query.data?.disponivel),
    url: query.data?.url ?? null,
    buscando: query.isLoading,
  };
}
