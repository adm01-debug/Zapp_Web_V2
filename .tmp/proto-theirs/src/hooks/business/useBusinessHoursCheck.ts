/**
 * useBusinessHoursCheck
 *
 * Diz se a conexão está dentro do horário comercial.
 *
 * Três estados (data):
 *  - true  → dentro do horário ('Aberto');
 *  - false → dia marcado como fechado ou fora da janela ('Fechado');
 *  - null  → 'sem configuração': não existe linha de business_hours para o dia de hoje
 *            nesta conexão. A RPC is_within_business_hours devolve true nesse caso
 *            (assume aberto quando não há configuração), então a linha é conferida
 *            antes de aceitar o true dela — sem isso o selo mentia "Aberto".
 *
 * Falha de leitura NÃO é "sem dado": lança para a UI ver isError.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const SAO_PAULO_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Dia da semana (0 = domingo) em America/Sao_Paulo — mesmo fuso usado pela RPC. */
export function getSaoPauloDayOfWeek(now: Date = new Date()): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
  }).format(now);
  const index = SAO_PAULO_WEEKDAYS.indexOf(weekday as (typeof SAO_PAULO_WEEKDAYS)[number]);
  // Fuso indisponível no runtime: cai no dia local em vez de devolver NaN.
  return index === -1 ? now.getDay() : index;
}

export function useBusinessHoursCheck(connectionId: string | null | undefined) {
  return useQuery({
    queryKey: ['business-hours-check', connectionId],
    queryFn: async () => {
      if (!connectionId) return null;

      // Sem linha para o dia de hoje = 'sem configuração' (nunca 'aberto').
      const { data: config, error: configError } = await supabase
        .from('business_hours')
        .select('id')
        .eq('whatsapp_connection_id', connectionId)
        .eq('day_of_week', getSaoPauloDayOfWeek())
        .maybeSingle();

      if (configError) {
        console.error(
          '[useBusinessHoursCheck] falha ao ler a configuração de horário comercial',
          configError
        );
        throw new Error(configError.message || 'Falha ao ler a configuração de horário comercial');
      }
      if (!config) return null;

      const { data, error } = await supabase.rpc('is_within_business_hours', {
        connection_id: connectionId,
      });
      // Falha de leitura NÃO é "sem dado": lança para a UI ver isError (antes, um erro de
      // rede/RPC aparecia como ausência de horário comercial).
      if (error) {
        console.error('[useBusinessHoursCheck] falha ao verificar o horário comercial', error);
        throw new Error(error.message || 'Falha ao verificar o horário comercial');
      }
      return data as boolean;
    },
    enabled: !!connectionId,
    staleTime: 1000 * 60 * 5, // 5 min
    refetchInterval: 1000 * 60 * 5, // auto-refresh every 5 min
  });
}
