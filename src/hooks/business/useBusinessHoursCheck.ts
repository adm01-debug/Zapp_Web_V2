/**
 * useBusinessHoursCheck
 * 
 * Calls the is_within_business_hours RPC to check if a connection
 * is currently within business hours.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useBusinessHoursCheck(connectionId: string | null | undefined) {
  return useQuery({
    queryKey: ['business-hours-check', connectionId],
    queryFn: async () => {
      if (!connectionId) return null;
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
