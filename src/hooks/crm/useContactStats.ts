import { useQuery } from '@tanstack/react-query';
import { ContactService } from '@/services/contact.service';

export interface ContactStats {
  totalMessages: number;
  avgResponseTimeMinutes: number;
  totalConversations: number;
  messagesChangePercent?: number | null;
  conversationsChangePercent?: number | null;
  csatAverage: number | null;
  csatCount: number;
}

/** Chave única da faixa de estatísticas do contato — quem invalida (`useConversationPanelInvalidation`) e quem lê usam a mesma. */
export const contactStatsKey = (contactId: string | null | undefined) => ['contact-stats', contactId] as const;

export function useContactStats(contactId: string) {
  return useQuery({
    queryKey: contactStatsKey(contactId),
    queryFn: () => ContactService.fetchStats(contactId),
    enabled: !!contactId,
  });
}
