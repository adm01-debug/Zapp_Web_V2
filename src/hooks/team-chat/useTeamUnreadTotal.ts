import { useQuery } from '@tanstack/react-query';
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
 * A query entra desabilitada: o hook só LÊ o cache e acompanha as mudanças dele
 * (refetch de 30 s, invalidação e realtime do inbox atualizam o badge sozinhos),
 * sem abrir canal, sem disparar consulta nova e sem `localStorage` — ao
 * contrário do `useTeamUnreadCount` (localStorage), que esta etapa substitui.
 */
export function useTeamUnreadTotal(): number {
  const { profile } = useAuth();

  const { data } = useQuery<TeamConversation[]>({
    queryKey: teamUnreadTotalQueryKey(profile?.id),
    enabled: false,
  });

  return (data ?? []).reduce((total, conversation) => total + (conversation.unread_count ?? 0), 0);
}
