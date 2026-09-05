import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string | null;
  updated_at: string;
}

export const FEATURE_FLAGS_QUERY_KEY = ['feature-flags'] as const;

// Uma unica query compartilhada por todos os consumidores (mesmo padrao de useUserRole):
// N chamadas a useFeatureFlag() custam 1 fetch, revalidado a cada 5 min.
export function useFeatureFlags() {
  const { user } = useAuth();
  return useQuery({
    queryKey: FEATURE_FLAGS_QUERY_KEY,
    queryFn: async (): Promise<FeatureFlag[]> => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('key, enabled, description, updated_at')
        .order('key');
      if (error) throw error;
      return (data ?? []) as FeatureFlag[];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

// fallback vale enquanto a query carrega ou falha: a flag nunca "pisca" para o
// estado oposto ao que o codigo chamador considera seguro.
export function useFeatureFlag(key: string, fallback = false): boolean {
  const { data } = useFeatureFlags();
  if (!data) return fallback;
  const flag = data.find((f) => f.key === key);
  return flag ? flag.enabled : fallback;
}
