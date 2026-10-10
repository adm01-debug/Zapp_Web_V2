import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ActiveAIProvider {
  name: string;
  model: string | null;
  description: string | null;
}

/** Provider de IA ativo (default primeiro) — mesma tabela/queryKey de settings/ai-providers, sem mutations. */
export function useActiveAIProvider() {
  return useQuery({
    queryKey: ['ai-providers', 'active'],
    queryFn: async (): Promise<ActiveAIProvider | null> => {
      const { data, error } = await supabase
        .from('ai_providers')
        .select('name, model, description, is_active, is_default')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .limit(1);
      if (error) throw error;
      const row = data?.[0];
      return row ? { name: row.name, model: row.model, description: row.description } : null;
    },
    staleTime: 60_000,
  });
}
