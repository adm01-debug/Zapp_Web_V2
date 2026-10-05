import { useEffect, useMemo } from 'react';
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
  blob: Blob | null;
}

/**
 * Busca a gravacao da chamada (T67), e SO quando a chamada diz que tem - SEMPRE pelos bytes
 * da Edge, nunca por uma URL de audio pronta.
 *
 * O contrato da Edge `get-call-recording` (T73) e responder o PROPRIO audio
 * (`new Response(upstream.body, ...)`) para nao expor a URL do provedor, que e assinada e
 * temporaria. Antes este hook tratava a resposta como JSON (`data.url`); so que o SDK 2.117.2
 * decodifica `audio/mpeg` como texto e a Edge nunca devolve `{ url }` - entao `disponivel`
 * ficava sempre `false` e o RecordingPlayer nunca renderizava, nem com 200 de audio valido.
 *
 * Agora o hook le os bytes (`response.blob`) e transforma num `blob:` local do navegador; e
 * esse endereco local que o `<audio>` usa. A URL do provedor continua sem chegar ao front.
 * O `blob:` e revogado ao desmontar/trocar de chamada para nao vazar memoria.
 */
export function useCallRecording(callId: string | null | undefined, recordingStatus: string | null | undefined) {
  const temGravacao = recordingStatus === 'available';
  const habilitado = SERVICO_DE_GRAVACAO_ATIVO && temGravacao && Boolean(callId);

  const query = useQuery({
    queryKey: ['call-recording', callId],
    enabled: habilitado,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<GravacaoDaChamada> => {
      if (!callId) return { disponivel: false, blob: null };

      // A Edge roda auth pelo JWT do usuario; a RLS decide quem pode ler a chamada.
      const headers = await edgeAuthHeaders();
      const resposta = await fetch(
        `${SUPABASE_URL}/functions/v1/get-call-recording?callId=${encodeURIComponent(callId)}`,
        { headers },
      );

      // 404 = a chamada nao tem gravacao disponivel (resposta esperada da Edge), nao e erro de tela.
      if (resposta.status === 404) return { disponivel: false, blob: null };
      if (!resposta.ok) throw new Error(`Gravacao indisponivel (${resposta.status})`);

      const blob = await resposta.blob();
      return { disponivel: blob.size > 0, blob };
    },
  });

  // O endereco que o <audio> usa e um `blob:` local do navegador, criado a partir dos bytes.
  // Derivado (nao estado) para nao chamar setState dentro de efeito; o efeito so cuida de
  // revogar o endereco antigo quando a gravacao muda ou o player desmonta.
  const blob = query.data?.blob ?? null;
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);

  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return {
    disponivel: Boolean(url),
    url,
    buscando: query.isLoading,
  };
}
