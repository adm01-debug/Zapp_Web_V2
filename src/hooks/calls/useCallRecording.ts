import { useEffect, useState, useSyncExternalStore } from 'react';
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
 * O endereco `blob:` NAO e estado do React: e um registro do NAVEGADOR - `createObjectURL` e
 * `revokeObjectURL` escrevem nele. Este registro local guarda o endereco VIVO da gravacao em
 * curso e avisa quem assina quando ele muda, que e o padrao que o repo ja usa para sistema
 * externo (`useSyncExternalStore` em `mediaVolumeStore`/`tabLeaderStore`). Sem ele o efeito
 * teria de chamar `setState` sincrono no proprio corpo, que a regra
 * `react-hooks/set-state-in-effect` recusa: o endereco mudaria no meio do commit e o React
 * renderizaria de novo em cascata.
 */
function criarRegistroDeEnderecos() {
  let atual: string | null = null;
  const assinantes = new Set<() => void>();

  return {
    ler: () => atual,
    definir(valor: string | null) {
      if (valor === atual) return;
      atual = valor;
      for (const avisar of assinantes) avisar();
    },
    assinar(avisar: () => void) {
      assinantes.add(avisar);
      return () => {
        assinantes.delete(avisar);
      };
    },
  };
}

type RegistroDeEnderecos = ReturnType<typeof criarRegistroDeEnderecos>;

/**
 * Busca a gravacao da chamada (T67), e SO quando a chamada diz que tem - SEMPRE pelos bytes
 * da Edge, nunca por uma URL de audio pronta.
 *
 * `recording_status` e a unica fonte de verdade: chamada sem gravacao nao dispara
 * requisicao nenhuma (antes a tela montava um <audio src={recording_url}> cru, que
 * apontava para um campo que a leitura nova nem devolve). Sem o servico ligado (D3=b)
 * a resposta e sempre indisponivel - e quem consome sabe disso.
 *
 * O contrato da Edge `get-call-recording` (T73) e responder o PROPRIO audio
 * (`new Response(upstream.body, ...)`) para nao expor a URL do provedor, que e assinada e
 * temporaria. Antes este hook tratava a resposta como JSON (`data.url`); so que o SDK 2.117.2
 * decodifica `audio/mpeg` como texto e a Edge nunca devolve `{ url }` - entao `disponivel`
 * ficava sempre `false` e o RecordingPlayer nunca renderizava, nem com 200 de audio valido.
 *
 * Agora o hook le os bytes (`response.blob`) e transforma num `blob:` local do navegador; e
 * esse endereco local que o `<audio>` usa. A URL do provedor continua sem chegar ao front.
 *
 * O transporte e o que a Edge ja recebia de `supabase.functions.invoke`: POST com corpo JSON
 * (`{ callId }`). `callId` NAO vai na query string - a Edge aceita GET e POST, mas o front
 * nunca precisou de GET, e trocar o transporte seria mudar contrato em producao de graca.
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
      const resposta = await fetch(`${SUPABASE_URL}/functions/v1/get-call-recording`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId }),
      });

      // 404 = a chamada nao tem gravacao disponivel (resposta esperada da Edge), nao e erro de tela.
      if (resposta.status === 404) return { disponivel: false, blob: null };
      if (!resposta.ok) throw new Error(`Gravacao indisponivel (${resposta.status})`);

      const blob = await resposta.blob();
      return { disponivel: blob.size > 0, blob };
    },
  });

  const blob = query.data?.blob ?? null;
  const [registro] = useState<RegistroDeEnderecos>(criarRegistroDeEnderecos);
  const url = useSyncExternalStore(registro.assinar, registro.ler, registro.ler);

  /**
   * Criacao e revogacao no MESMO efeito - o endereco vive exatamente enquanto este efeito
   * estiver montado, e quem o usa recebe sempre um endereco vivo.
   *
   * Guardar o `blob:` fora daqui (derivado em `useMemo`, por exemplo) quebra sob StrictMode:
   * o React monta, desmonta e monta o efeito de novo, a limpeza revoga o endereco e a
   * remontagem nao cria outro - o `<audio>` fica apontando para um `blob:` revogado (nao toca)
   * e o endereco criado na renderizacao descartada ainda vaza. Aqui a limpeza revoga e publica
   * `null` no registro, e a remontagem publica um endereco novo.
   */
  useEffect(() => {
    if (!blob) {
      registro.definir(null);
      return;
    }

    const endereco = URL.createObjectURL(blob);
    registro.definir(endereco);

    return () => {
      URL.revokeObjectURL(endereco);
      registro.definir(null);
    };
  }, [blob, registro]);

  return {
    disponivel: Boolean(url),
    url,
    buscando: query.isLoading,
  };
}
