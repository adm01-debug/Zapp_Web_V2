/**
 * useExternalEvolution — Hooks for reading evolution_messages from external FATOR X DB
 * Replaces the local DB reads for the Inbox when external DB is the source of truth.
 *
 * LEGADO (instalação Evolution API antiga, infra AtomicaBR/wpp2): a tabela
 * `evolution_messages` pertence à instância v2 desativada. A instalação atual é a
 * Evolution GO (webhook → banco local). Mantido desligado via USE_EXTERNAL_DB=false
 * em useRealtimeInbox; não reativar contra a infra antiga.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
 import {
   buildExternalConversations,
   evolutionToRealtimeMessage,
 } from '@/adapters/evolutionAdapter';
 import { ExternalCRMService } from '@/services/crm/external-crm.service';
import type { RealtimeMessage } from '@/hooks/chat/useRealtimeMessages';
import { getLogger } from '@/lib/logger';

const log = getLogger('useExternalEvolution');

const POLL_INTERVAL = 5000; // 5s polling

// ─── Hook: External Conversations (list for sidebar) ──────────
export function useExternalConversations(enabled = true) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['external-evolution', 'conversations'],
     queryFn: async () => {
       const messages = await ExternalCRMService.fetchEvolutionMessages(500);
       return buildExternalConversations(messages);
     },
    enabled,
    refetchInterval: enabled ? POLL_INTERVAL : false,
    staleTime: POLL_INTERVAL - 1000,
  });

  return {
    conversations: query.data || [],
    loading: query.isLoading,
    error: query.error?.message || null,
    refetch: query.refetch,
  };
}

// ─── Hook: External Messages for a specific contact/jid ───────
export function useExternalMessages(remoteJid: string | null) {
  const query = useQuery({
    queryKey: ['external-evolution', 'messages', remoteJid],
    queryFn: async () => {
      if (!remoteJid) return [];
      const evoMessages = await ExternalCRMService.fetchEvolutionMessagesByJid(remoteJid);
      return evoMessages.map(evolutionToRealtimeMessage);
    },
    enabled: !!remoteJid,
    refetchInterval: !!remoteJid ? POLL_INTERVAL : false,
    staleTime: POLL_INTERVAL - 1000,
  });

  return {
    messages: query.data || [],
    loading: query.isLoading,
    error: query.error?.message || null,
    refetch: query.refetch,
    // Note: addMessage, updateMessage, removeMessage are not supported for external DB
    // as it is read-only for the frontend's realtime layer.
  };
}
