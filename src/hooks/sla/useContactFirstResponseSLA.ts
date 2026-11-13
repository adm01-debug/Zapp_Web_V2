/**
 * useContactFirstResponseSLA — SLA de 1ª resposta da conversa mais recente do contato.
 *
 * Lê `conversation_sla` (fonte canônica, ADR-009) pelo mesmo
 * `ContactService.fetchSLA` que o painel antigo usava, e classifica o desfecho
 * com a regra única de `slaFirstResponse.ts` (violado manda; sem violação e sem
 * carimbo = pendente). Só a 1ª resposta é exibida: o modelo de negócio mede a
 * primeira resposta, não a resolução.
 */
import { useQuery } from '@tanstack/react-query';
import { ContactService } from '@/services/contact.service';
import { classifyFirstResponse, type FirstResponseOutcome } from './slaFirstResponse';

export interface ContactFirstResponseSLA {
  outcome: FirstResponseOutcome;
  firstResponseAt: string | null;
}

export const contactFirstResponseSLAKey = (contactId: string) => ['contact-sla', contactId] as const;

export function useContactFirstResponseSLA(contactId: string) {
  return useQuery<ContactFirstResponseSLA | null>({
    queryKey: contactFirstResponseSLAKey(contactId),
    queryFn: async () => {
      const { data, error } = await ContactService.fetchSLA(contactId);
      if (error) throw error;
      if (!data) return null;
      return {
        outcome: classifyFirstResponse({
          first_response_breached: data.first_response_breached,
          first_response_at: data.first_response_at,
        }),
        firstResponseAt: data.first_response_at,
      };
    },
    enabled: !!contactId,
  });
}
