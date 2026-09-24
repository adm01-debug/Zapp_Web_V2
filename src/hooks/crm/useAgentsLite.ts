import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AgentLite {
  id: string;
  name: string;
  avatar_url: string | null;
}

/** Mapa leve id -> {name, avatar_url} para exibir quem está atendendo, sem o
 *  custo de useAgents() (que também busca presença, filas e contagem de chats). */
export function useAgentsLite() {
  const { data } = useQuery({
    queryKey: ['profiles-lite'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, name, avatar_url');
      if (error) throw error;
      return data as AgentLite[];
    },
    staleTime: 5 * 60 * 1000,
  });

  return useMemo(() => new Map((data ?? []).map((a) => [a.id, a])), [data]);
}
