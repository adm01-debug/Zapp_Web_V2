import { useQuery } from '@tanstack/react-query';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';

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

async function authorizationDoUsuario(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error('Sessao invalida para buscar a gravacao');
  return `Bearer ${token}`;
}

function urlDaFuncao(): string {
  return `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/get-call-recording`;
}

/**
 * Busca a gravacao (T67) SO quando a chamada diz que tem.
 *
 * A Edge `get-call-recording` preserva a garantia do T73: o front nunca recebe
 * `recording_url`. O hook baixa o stream autenticado como Blob e entrega os BYTES
 * (`{ disponivel, blob, buscando }`) - nao a URL assinada do provedor e tambem nenhum
 * endereco `blob:` pronto: quem cria e revoga o `blob:` local e o `RecordingPlayer`, no
 * mesmo efeito (TEL-RECORDING-001).
 *
 * Refazer #62: o cache da query guarda o BLOB, nunca uma URL `blob:` - a URL e criada por
 * montagem a partir do Blob cacheado e revogada no desmontar, entao a remontagem dentro do
 * `staleTime` nao herda uma URL morta (defeito do refazer #62).
 *
 * Transporte: POST com `{ callId }` no corpo (nunca na query string) e o JWT da sessao; 403/404
 * sao resposta esperada e viram `{ disponivel: false }`; qualquer outra falha (rede, 5xx, sem
 * sessao) PROPAGA - nada aqui engole erro. Blob de tamanho 0, ou resposta JSON, nao e gravacao valida. A resposta e
 * lida como `Response.blob()`, entao o audio chega inteiro seja qual for a `Content-Type`
 * (`audio/mpeg` incluso).
 */
export function useCallRecording(callId: string | null | undefined, recordingStatus: string | null | undefined) {
  const temGravacao = recordingStatus === 'available';
  const habilitado = SERVICO_DE_GRAVACAO_ATIVO && temGravacao && Boolean(callId);

  const query = useQuery({
    queryKey: ['call-recording', callId],
    enabled: habilitado,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<GravacaoDaChamada> => {
      const authorization = await authorizationDoUsuario();
      const resposta = await fetch(urlDaFuncao(), {
        method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId }),
        cache: 'no-store',
      });

      if (resposta.status === 403 || resposta.status === 404) {
        return { disponivel: false, blob: null };
      }
      if (!resposta.ok) throw new Error('Falha ao buscar a gravacao da chamada');

      const blob = await resposta.blob();
      if (blob.size === 0) return { disponivel: false, blob: null };
      // JSON e o formato dos erros/respostas de controle da Edge, nunca o audio: se um 200 vier
      // assim, nao ha bytes de gravacao e nada e fabricado a partir dele (falha fechada).
      if (blob.type.toLowerCase().startsWith('application/json')) return { disponivel: false, blob: null };
      return { disponivel: true, blob };
    },
  });

  return {
    disponivel: Boolean(query.data?.disponivel),
    blob: query.data?.blob ?? null,
    buscando: query.isLoading,
  };
}
