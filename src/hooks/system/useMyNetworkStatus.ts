import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * O que a politica de rede ve para quem esta pedindo: o pais de origem e o IP.
 *
 * Fonte unica: a RPC `public.my_network_status()` (migration
 * 20261016002012_my_network_status.sql), que le os cabecalhos da propria
 * requisicao e devolve exatamente o que `resolve_network_policy` enxerga.
 * `country` nulo = o gateway nao informa pais (nao e o mesmo que "pais liberado").
 */
export interface StatusDeRede {
  country: string | null;
  ipSeen: string | null;
}

export interface ResultadoDoStatusDeRede {
  status: StatusDeRede | null;
  loading: boolean;
  erro: string | null;
}

/** Texto unico da falha de leitura, para a tela nao inventar outro. */
export const ERRO_AO_LER_STATUS_DE_REDE =
  'Não foi possível ler o país detectado para o seu acesso.';

export function useMyNetworkStatus(): ResultadoDoStatusDeRede {
  const [status, setStatus] = useState<StatusDeRede | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    // Carga dentro de funcao assincrona: nenhum setState no corpo sincrono do efeito.
    void (async () => {
      const { data, error } = await supabase.rpc('my_network_status');
      if (!ativo) return;

      if (error) {
        // Falha de leitura NAO vira "sem pais": fica visivel para quem le a tela.
        setErro(ERRO_AO_LER_STATUS_DE_REDE);
        setStatus(null);
      } else {
        const linha = Array.isArray(data) ? data[0] : data;
        setStatus({
          country: typeof linha?.country === 'string' ? linha.country : null,
          ipSeen: typeof linha?.ip_seen === 'string' ? linha.ip_seen : null,
        });
        setErro(null);
      }

      setLoading(false);
    })();

    return () => {
      ativo = false;
    };
  }, []);

  return { status, loading, erro };
}
