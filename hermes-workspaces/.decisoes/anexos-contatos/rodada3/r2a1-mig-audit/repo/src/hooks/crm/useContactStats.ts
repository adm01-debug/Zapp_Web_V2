import { useQuery } from '@tanstack/react-query';
import { ContactService } from '@/services/contact.service';

export interface ContactStats {
  totalMessages: number;
  avgResponseTimeMinutes: number;
  totalConversations: number;
  csatAverage: number | null;
  csatCount: number;
}

export function useContactStats(contactId: string) {
  return useQuery({
    queryKey: ['contact-stats', contactId],
    queryFn: () => ContactService.fetchStats(contactId),
    enabled: !!contactId,
  });
}
