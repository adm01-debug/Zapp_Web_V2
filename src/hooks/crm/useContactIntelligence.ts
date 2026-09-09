/**
 * useContactIntelligence
 * 
 * Calls get_contact_intelligence_by_phone on the external CRM.
 * Returns unified intelligence: briefing, triggers, rapport,
 * best times, churn risk, DISC tips, and last interactions.
 */
import { useQuery } from '@tanstack/react-query';
import { useCRMIntegrationEnabled } from '@/hooks/system/useCRMIntegrationEnabled';
import { callCRMIntegration } from '@/lib/crmIntegration';
import { log } from '@/lib/logger';

export interface ContactBriefing {
  contact_name: string | null;
  company_name: string | null;
  cargo: string | null;
  relationship_stage: string | null;
  relationship_score: number | null;
  sentiment: string | null;
  days_since_last_contact: number | null;
  total_interactions: number;
  cliente_ativado: boolean | null;
  ja_comprou: boolean | null;
  total_pedidos: number;
  valor_total_compras: number;
  ticket_medio: number | null;
  vendedor: string | null;
  rfm_segment: string | null;
  preferred_channel: string;
  opening_tip: string;
  risk_alert: string | null;
}

export interface MentalTrigger {
  trigger_name: string;
  description: string;
  category: string;
  examples: string[];
  intensity: number;
}

export interface RapportData {
  hobbies: string[];
  interests: string[];
  family_info: string | null;
  personal_notes: string | null;
  nome_tratamento: string | null;
  apelido: string | null;
  data_nascimento: string | null;
  suggestions: string[];
}

export interface BestTime {
  day_of_week: number;
  hour: number;
  success_rate?: number;
  avg_response_min?: number;
  note?: string;
}

export interface ChurnData {
  churn_probability: number;
  risk_level: string;
  risk_factors: Record<string, any> | null;
  recommended_actions: string[] | null;
}

export interface DISCTips {
  profile: string;
  name: string;
  communication_tips: string[];
  sales_approach: string[];
  objection_handling: string[];
  closing_techniques: string[];
  keywords_to_use: string[];
  keywords_to_avoid: string[];
}

export interface ContactIntelligenceData {
  found: boolean;
  contact_id: string;
  briefing: ContactBriefing;
  triggers: MentalTrigger[];
  rapport: RapportData;
  best_times: BestTime[];
  churn: ChurnData | null;
  disc_tips: DISCTips | null;
  last_interactions: { channel: string; assunto: string; resumo: string | null; sentiment: string; data: string }[];
}

export function useContactIntelligence(contactId: string | undefined) {
  const crmEnabled = useCRMIntegrationEnabled();
  return useQuery<ContactIntelligenceData | null>({
    queryKey: ['contact-intelligence', contactId],
    queryFn: async () => {
      if (!contactId) return null;
      try {
        const { data } = await callCRMIntegration<ContactIntelligenceData>('contactLookup', { contactId, lookup: 'intelligence' });
        return data;
      } catch (error) {
        log.error('Intelligence RPC error:', error);
        return null;
      }
    },
    enabled: crmEnabled && !!contactId,
    staleTime: 1000 * 60 * 15, // 15 min
    gcTime: 1000 * 60 * 30,
    retry: 1,
  });
}
