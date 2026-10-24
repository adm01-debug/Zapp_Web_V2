import { useCallback, useRef, useSyncExternalStore } from 'react';
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
 * Uma object URL por assinatura, criada no subscribe e revogada no unsubscribe da
 * MESMA assinatura (o `useSyncExternalStore` trata a URL `blob:` como o recurso
 * externo que ela e). Sob StrictMode o ciclo subscribe/unsubscribe se repete e cada
 * ciclo ganha URL nova; no desmontar real a URL morre com a montagem. O Blob fica
 * no cache da query, entao remontar dentro do `staleTime` gera URL nova sem novo
 * download - e uma URL revogada nunca volta a ser usada.
 */
function useUrlDoBlob(blob: Blob | null): string | null {
  const urlViva = useRef<string | null>(null);
  const subscribe = useCallback(
    (avisar: () => void) => {
      if (!blob) return () => {};
      const urlDaAssinatura = URL.createObjectURL(blob);
      urlViva.current = urlDaAssinatura;
      avisar();
      return () => {
        URL.revokeObjectURL(urlDaAssinatura);
        if (urlViva.current === urlDaAssinatura) urlViva.current = null;
      };
    },
    [blob],
  );
  return useSyncExternalStore(subscribe, () => urlViva.current);
}

/**
 * Busca a gravacao (T67) SO quando a chamada diz que tem.
 *
 * A Edge `get-call-recording` preserva a garantia do T73: o front nunca recebe
 * `recording_url`. O hook baixa o stream autenticado como Blob e entrega ao
 * `<audio>` uma URL local (`blob:`), nao a URL assinada do provedor.
 *
 * Refazer #62: o cache da query guarda o BLOB, nunca a URL `blob:` - a URL e criada
 * por montagem a partir do Blob cacheado e revogada no desmontar, entao a remontagem
 * dentro do `staleTime` nao herda uma URL morta (defeito do refazer #62).
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
      return { disponivel: true, blob };
    },
  });

  const url = useUrlDoBlob(query.data?.blob ?? null);

  return {
    disponivel: Boolean(query.data?.disponivel),
    url,
    buscando: query.isLoading,
  };
}
