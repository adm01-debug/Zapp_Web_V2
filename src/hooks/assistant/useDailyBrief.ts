/**
 * Fase 2 — "Resumo do dia" (leitura única por sessão, cache curto).
 * A leitura crua vive em `@/lib/assistant/dailyBrief` para ser testável sem React.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/auth/useAuth';
import { fetchDailyBrief } from '@/lib/assistant/dailyBrief';

const dailyBriefKey = (profileId: string) => ['assistant-daily-brief', profileId] as const;

export function useDailyBrief() {
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';

  const query = useQuery({
    queryKey: dailyBriefKey(profileId),
    queryFn: () => fetchDailyBrief(profileId),
    enabled: Boolean(profileId),
    staleTime: 60_000,
    refetchOnMount: true,
  });

  return { brief: query.data ?? null, isLoading: query.isLoading, refetch: query.refetch };
}