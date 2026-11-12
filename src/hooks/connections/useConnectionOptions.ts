import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ConnectionOption { id: string; name: string; instance_id: string | null }

/**
 * Conexões WhatsApp para escolher em formulários (id, nome e instância da Evolution).
 * `onlyConnected`: só as com `status = 'connected'` (enviar por uma desconectada sempre falha).
 */
export function useConnectionOptions(enabled = true, { onlyConnected = false }: { onlyConnected?: boolean } = {}) {
  return useQuery({
    queryKey: ['whatsapp-connection-options', onlyConnected ? 'connected' : 'all'],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ConnectionOption[]> => {
      let query = supabase
        .from('whatsapp_connections')
        .select('id, name, instance_id')
        .order('name', { ascending: true });
      if (onlyConnected) query = query.eq('status', 'connected');
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ConnectionOption[];
    },
  });
}
