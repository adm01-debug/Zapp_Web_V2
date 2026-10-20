import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CallsKpi {
  total: number;
  answered: number;
  missed_inbound: number;
  inbound: number;
  outbound: number;
  avg_talk_seconds: number;
}

export const KPI_ZERADO: CallsKpi = {
  total: 0,
  answered: 0,
  missed_inbound: 0,
  inbound: 0,
  outbound: 0,
  avg_talk_seconds: 0,
};

/**
 * T37 — periodo -> intervalo ISO. Regra PURA (sem I/O), por isso testavel direto:
 * e onde mora o risco real de errar a janela (limite do dia, virada de mes, "ontem").
 * `to` sempre no fim do dia, para nao cortar a ultima hora.
 */
export function periodoParaIntervalo(
  period: string,
  agora: Date = new Date(),
): { from: string; to: string } {
  const fimDoDia = (d: Date) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };
  const inicioDoDia = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };

  const hoje = inicioDoDia(agora);
  let inicio = new Date(hoje);

  switch (period) {
    case 'hoje':
      break;
    case 'ontem':
      inicio.setDate(inicio.getDate() - 1);
      return { from: inicio.toISOString(), to: fimDoDia(inicio).toISOString() };
    case '30d':
      inicio.setDate(inicio.getDate() - 29);
      break;
    case 'mes':
      inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      break;
    case 'mes_passado':
      inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      return {
        from: inicio.toISOString(),
        to: fimDoDia(new Date(hoje.getFullYear(), hoje.getMonth(), 0)).toISOString(),
      };
    case '7d':
    default:
      inicio.setDate(inicio.getDate() - 6);
      break;
  }

  return { from: inicio.toISOString(), to: fimDoDia(agora).toISOString() };
}

export interface UseCallsKpiParams {
  period: string;
  channel: string;
  scope: string;
  enabled?: boolean;
}

/**
 * T37 — KPIs da tela. Os numeros vem da RPC `my_calls_kpi` (ja existe no banco; nao
 * precisou de migration). A RPC devolve UMA linha; quando nao ha dado, devolvemos os
 * zeros explicitos para a UI nunca receber `undefined`.
 *
 * Invalidacao: por fim de sessao de chamada (a pagina refaz os KPIs quando uma ligacao
 * termina) e pela subscription Realtime de `calls` - a mesma tabela que o T28 ja
 * observa. `staleTime` de 30s evita rajada de RPC quando a tela remonta.
 */
export function useCallsKpi({ period, channel, scope, enabled = true }: UseCallsKpiParams) {
  const queryClient = useQueryClient();

  const query = useQuery<CallsKpi>({
    queryKey: ['calls-kpi', period, channel, scope],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { from, to } = periodoParaIntervalo(period);
      const { data, error } = await supabase.rpc('my_calls_kpi', {
        p_from: from,
        p_to: to,
        p_channel: channel === 'all' ? undefined : channel,
        p_scope: scope,
      });
      if (error) throw error;
      const linha = Array.isArray(data) ? data[0] : data;
      return linha ? { ...KPI_ZERADO, ...linha } : KPI_ZERADO;
    },
  });

  useEffect(() => {
    const canal = supabase
      .channel('calls-kpi-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, () => {
        queryClient.invalidateQueries({ queryKey: ['calls-kpi'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [queryClient]);

  return query;
}
