import { useCallback, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/auth/useAuth';
import type { TeamConversation } from './teamChatTypes';

/** Mesma chave usada por `useTeamConversations` para a lista do inbox. */
export const teamUnreadTotalQueryKey = (profileId: string | undefined) =>
  ['team-conversations', profileId] as const;

/**
 * F83 — Badge "Teams" da sidebar: total de não lidas do módulo inteiro.
 *
 * Soma o `unread_count` da lista de conversas que JÁ está em cache na chave do
 * inbox (`['team-conversations', profileId]`, a mesma de `useTeamConversations`).
 * Observa o cache do inbox diretamente. Uma query desabilitada sem queryFn
 * criava uma entrada vazia; quando a chave era atualizada fora do módulo,
 * React Query emitia "No queryFn was passed" repetidamente. O cache continua
 * sendo a única fonte: sem canal, consulta nova ou `localStorage`.
 */
export function useTeamUnreadTotal(): number {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const profileId = profile?.id;

  const subscribe = useCallback((onStoreChange: () => void) =>
    queryClient.getQueryCache().subscribe((event) => {
      if (event.query?.queryKey[0] === 'team-conversations' && event.query.queryKey[1] === profileId) {
        onStoreChange();
      }
    }), [queryClient, profileId]);

  const getSnapshot = useCallback(() => {
    if (!profileId) return 0;
    const data = queryClient.getQueryData<TeamConversation[]>(teamUnreadTotalQueryKey(profileId));
    return (data ?? []).reduce((total, conversation) => total + (conversation.unread_count ?? 0), 0);
  }, [queryClient, profileId]);

  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
