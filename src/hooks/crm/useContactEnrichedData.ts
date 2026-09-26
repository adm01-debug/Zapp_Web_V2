import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSupabaseRealtime } from '@/hooks/realtime/useSupabaseRealtime';
import { ContactService } from '@/services/contact.service';
import { log } from '@/lib/logger';

export interface EnrichedContactData {
  company: string | null;
  job_title: string | null;
  nickname: string | null;
  surname: string | null;
  contact_type: string | null;
  ai_sentiment: string | null;
  ai_priority: string | null;
  channel_type: string | null;
}

export interface AIConversationTag {
  id: string;
  tag_name: string;
  confidence: number | null;
  source: string | null;
}

export interface SLAInfo {
  first_response_breached: boolean | null;
  resolution_breached: boolean | null;
  first_response_at: string | null;
  resolved_at: string | null;
}

export function useContactEnrichedData(contactId: string) {
  const queryClient = useQueryClient();

  const { data: enrichedData } = useQuery({
    queryKey: ['contact-enriched', contactId],
    // Lança em vez de engolir o erro: um `return null` aqui vira "sucesso" pro
    // React Query, que trava esse null em cache até o staleTime (5min) expirar
    // — sem retry (retry só se aplica a queryFn que rejeita) e apagando apelido/
    // cargo/empresa/tipo do painel por causa de uma falha passageira. Lançando,
    // o retry:2 default (src/lib/queryClient.ts) tenta de novo antes de desistir.
    queryFn: async () => {
      const { data, error } = await ContactService.fetchEnrichedData(contactId);
      if (error) {
        log.error('Error fetching enriched contact data:', error);
        throw error;
      }
      return data as EnrichedContactData;
    },
    enabled: !!contactId,
  });

  const { data: aiTags = [] } = useQuery({
    queryKey: ['contact-ai-tags', contactId],
    queryFn: async () => {
      const { data, error } = await ContactService.fetchAITags(contactId);
      if (error) {
        log.error('Error fetching AI tags:', error);
        throw error;
      }
      return data as AIConversationTag[];
    },
    enabled: !!contactId,
  });

  const { data: slaInfo } = useQuery({
    queryKey: ['contact-sla', contactId],
    queryFn: async () => {
      const { data, error } = await ContactService.fetchSLA(contactId);
      if (error) {
        log.error('Error fetching SLA info:', error);
        throw error;
      }
      return data as SLAInfo | null;
    },
    enabled: !!contactId,
  });

  // EditContactDialog (o form deste próprio painel) já invalida este cache
  // manualmente ao salvar. Mas apelido/cargo/empresa também são editáveis
  // pela tela de Contatos, por merge de contatos e por import — nenhum
  // desses caminhos invalidava ['contact-enriched'], então o painel podia
  // ficar até staleTime (5min) desatualizado em relação à lista de
  // conversas (que é realtime) sob edição concorrente. Assinar Realtime
  // aqui cobre qualquer origem de UPDATE em contacts para este contato.
  useSupabaseRealtime({
    channelName: `contact-enriched:${contactId}`,
    table: 'contacts',
    filter: contactId ? `id=eq.${contactId}` : undefined,
    enabled: !!contactId,
    onUpdate: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-enriched', contactId] });
    },
  });

  return { enrichedData, aiTags, slaInfo };
}
