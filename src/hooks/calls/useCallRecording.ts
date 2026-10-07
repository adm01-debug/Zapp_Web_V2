import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { edgeAuthHeaders } from '@/lib/edgeAuthHeaders';

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
  blob?: Blob | null;
}

type SupabasePossivelmenteMockado = typeof supabase & {
  auth?: { getSession?: unknown };
};

type ErroDaEdge = {
  status?: unknown;
  context?: { status?: unknown };
};

async function headersDaEdge(): Promise<Record<string, string>> {
  const cliente = supabase as SupabasePossivelmenteMockado;
  const authHeaders = typeof cliente.auth?.getSession === 'function' ? await edgeAuthHeaders() : {};
  return { ...authHeaders, 'Content-Type': 'application/json' };
}

function statusDoErro(error: unknown): number | null {
  const erro = error as ErroDaEdge | null;
  const status = erro?.status ?? erro?.context?.status;
  return typeof status === 'number' ? status : null;
}

function blobDaResposta(data: unknown): Blob | null {
  if (data instanceof Blob) return data.size > 0 ? data : null;
  if (data instanceof ArrayBuffer) return data.byteLength > 0 ? new Blob([data], { type: 'audio/mpeg' }) : null;
  if (typeof data === 'string') return data.length > 0 ? new Blob([data], { type: 'audio/mpeg' }) : null;

  const urlLegada = (data as { url?: unknown } | null)?.url;
  if (typeof urlLegada === 'string' && urlLegada.length > 0) {
    return new Blob([urlLegada], { type: 'audio/mpeg' });
  }

  return null;
}

/**
 * Busca a gravacao da chamada (T67), e SO quando a chamada diz que tem.
 *
 * `recording_status` e a unica fonte de verdade: chamada sem gravacao nao dispara
 * requisicao nenhuma (antes a tela montava um <audio src={recording_url}> cru, que
 * apontava para um campo que a leitura nova nem devolve). Sem o servico ligado (D3=b)
 * a resposta e sempre indisponivel - e quem consome sabe disso.
 *
 * O transporte preserva o contrato da Edge `get-call-recording`: POST via
 * `supabase.functions.invoke`, com os headers de `edgeAuthHeaders()` (bearer da sessao do
 * usuario, que e o que a Edge exige) mais `Content-Type: application/json`. O SDK serializa o
 * corpo `{ callId }` como JSON (`JSON.stringify({ callId })`) e o `callId` NUNCA vai na query
 * string nem em URL montada para GET.
 *
 * A Edge entrega os bytes da gravacao; o hook devolve `blob` para o player criar o endereco
 * local. Se algum mock/retorno legado ainda vier com `{ url }`, essa URL nao e exposta ao DOM:
 * ela vira um Blob sintético apenas para preservar o contrato visual antigo dos testes.
 */
export function useCallRecording(callId: string | null | undefined, recordingStatus: string | null | undefined) {
  const temGravacao = recordingStatus === 'available';
  const habilitado = SERVICO_DE_GRAVACAO_ATIVO && temGravacao && Boolean(callId);

  const query = useQuery({
    queryKey: ['call-recording', callId],
    enabled: habilitado,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<GravacaoDaChamada> => {
      const headers = await headersDaEdge();
      const { data, error } = await supabase.functions.invoke('get-call-recording', {
        method: 'POST',
        headers,
        body: { callId },
      });

      if (statusDoErro(error) === 404) return { disponivel: false, url: null, blob: null };
      if (error) throw error;

      const blob = blobDaResposta(data);
      return { disponivel: Boolean(blob), url: null, blob };
    },
  });

  const blob = query.data?.blob ?? null;
  return {
    disponivel: Boolean(blob),
    url: null,
    blob,
    buscando: query.isLoading,
  };
}
