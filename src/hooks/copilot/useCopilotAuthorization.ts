import { useMemo } from 'react';

export interface UseCopilotAuthorizationOptions {
  conversationAssignedUserId: string | null;
  currentUserId: string | null;
  isSupervisor?: boolean;
}

export interface CopilotAuthorizationResult {
  isAuthorized: boolean;
  reason: string | null;
}

/**
 * CV-116 — Autorização por vendedor.
 * ESTENDE IA-004, IA-183: pure check ensuring a vendor only receives
 * RADAR insights for conversations they own. Supervisors see all.
 */
export function useCopilotAuthorization({
  conversationAssignedUserId,
  currentUserId,
  isSupervisor = false,
}: UseCopilotAuthorizationOptions): CopilotAuthorizationResult {
  return useMemo(() => {
    if (!currentUserId) {
      return { isAuthorized: false, reason: 'Usuário não autenticado' };
    }
    if (isSupervisor) {
      return { isAuthorized: true, reason: null };
    }
    if (!conversationAssignedUserId) {
      return { isAuthorized: false, reason: 'Conversa sem vendedor atribuído' };
    }
    if (conversationAssignedUserId !== currentUserId) {
      return { isAuthorized: false, reason: 'Conversa pertence a outro vendedor' };
    }
    return { isAuthorized: true, reason: null };
  }, [conversationAssignedUserId, currentUserId, isSupervisor]);
}
