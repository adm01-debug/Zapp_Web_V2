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

/**
 * O que o hook entrega a quem consome: se a gravacao existe e os BYTES dela. O endereco que o
 * `<audio>` e o link de download usam e um `blob:` local montado pelo PLAYER a partir destes
 * bytes (TEL-RECORDING-001) - o hook nao devolve endereco nenhum, e a URL da origem nunca passa
 * por aqui, que e o motivo de a Edge `get-call-recording` existir (T73: o front nunca recebe
 * `recording_url`).
 */
export interface GravacaoDaChamada {
  disponivel: boolean;
  blob: Blob | null;
}

function statusDoErro(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const erro = error as {
    status?: unknown;
    context?: { status?: unknown };
    response?: { status?: unknown };
  };
  const status = erro.status ?? erro.context?.status ?? erro.response?.status;
  return typeof status === 'number' ? status : null;
}

async function normalizarBytesComoBlob(data: unknown): Promise<Blob | null> {
  if (data instanceof Response) return data.blob();
  if (data instanceof Blob) return data;
  if (data instanceof ArrayBuffer) return new Blob([data], { type: 'application/octet-stream' });
  if (ArrayBuffer.isView(data)) {
    const bytes = new Uint8Array(data.byteLength);
    bytes.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    return new Blob([bytes.buffer], { type: 'application/octet-stream' });
  }
  return null;
}

function blobEhJson(blob: Blob): boolean {
  return blob.type.toLowerCase().startsWith('application/json');
}

/**
 * Busca a gravacao (T67) SO quando a chamada diz que tem.
 *
 * A Edge `get-call-recording` preserva a garantia do T73: o front nunca recebe `recording_url`.
 * O hook invoca a Edge autenticada com `supabase.functions.invoke` + `edgeAuthHeaders` e entrega
 * os BYTES (`{ disponivel, blob, buscando }`) - nao a URL assinada do provedor e tambem nenhum
 * endereco `blob:` pronto: quem cria e revoga o `blob:` local e o `RecordingPlayer`, no efeito dele
 * (TEL-RECORDING-001).
 *
 * Refazer #62: o cache da query guarda o BLOB, nunca uma URL `blob:` - a URL e criada por
 * montagem a partir do Blob cacheado e revogada no desmontar, entao a remontagem dentro do
 * `staleTime` nao herda uma URL morta (defeito do refazer #62).
 *
 * Transporte (T73/T67, preservado nos refazeres anteriores): `invoke` autenticado com
 * metodo POST explicito, `{ callId }` no corpo (nunca na URL) e bearer/apikey/Content-Type de
 * `edgeAuthHeaders`; sem fallback proprio.
 * 403/404 sao resposta esperada da Edge e viram `{ disponivel: false }`; qualquer outra falha
 * (rede, 401, 5xx, erro ao montar auth) PROPAGA - nada aqui engole erro. Blob de tamanho 0 nao e
 * gravacao valida, e uma resposta JSON (o formato dos erros/controles da Edge) tambem nao: nao ha
 * bytes de audio nela e nada e fabricado a partir dela (falha fechada).
 */
export function useCallRecording(callId: string | null | undefined, recordingStatus: string | null | undefined) {
  const temGravacao = recordingStatus === 'available';
  const habilitado = SERVICO_DE_GRAVACAO_ATIVO && temGravacao && Boolean(callId);

  const query = useQuery({
    queryKey: ['call-recording', callId],
    enabled: habilitado,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<GravacaoDaChamada> => {
      const { data, error } = await supabase.functions.invoke('get-call-recording', {
        method: 'POST',
        headers: { ...(await edgeAuthHeaders()), 'Content-Type': 'application/json' },
        body: { callId },
      });

      if (error) {
        const status = statusDoErro(error);
        if (status === 403 || status === 404) return { disponivel: false, blob: null };
        throw new Error('Falha ao buscar a gravacao da chamada');
      }

      const blob = await normalizarBytesComoBlob(data);
      if (!blob || blob.size === 0 || blobEhJson(blob)) return { disponivel: false, blob: null };
      return { disponivel: true, blob };
    },
  });

  return {
    disponivel: Boolean(query.data?.disponivel),
    blob: query.data?.blob ?? null,
    buscando: query.isLoading,
  };
}
