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
  /** Tamanho da amostra do tempo de resposta (refazer 1, ponto 1 da recusa). */
  responseSampleCount?: number;
  /** Mediana do tempo de resposta (refazer 1, ponto 1 da recusa). */
  medianResponseTimeMinutes?: number | null;
}

export function useContactStats(contactId: string) {
  return useQuery({
    queryKey: ['contact-stats', contactId],
    queryFn: () => ContactService.fetchStats(contactId),
    enabled: !!contactId,
  });
}
