import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ConnectionOption { id: string; name: string; instance_id: string | null }

/** Conexões WhatsApp para escolher em formulários (id, nome e instância da Evolution). */
export function useConnectionOptions(enabled = true) {
  return useQuery({
    queryKey: ['whatsapp-connection-options'],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ConnectionOption[]> => {
      const { data, error } = await supabase
        .from('whatsapp_connections')
        .select('id, name, instance_id')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ConnectionOption[];
    },
  });
}
