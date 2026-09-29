import { useQueryClient } from '@tanstack/react-query';
import { TEAM_KEYS } from './queryKeys';
import type { TeamInboxRow } from './teamChatTypes';
import { useAuth } from '@/hooks/auth/useAuth';

export function useTeamUnreadTotal(): number {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const rows =
    queryClient.getQueryData<TeamInboxRow[]>(TEAM_KEYS.inbox(profile?.id)) ?? [];
  return rows.reduce((sum, r) => sum + (r.unread_count ?? 0), 0);
}
