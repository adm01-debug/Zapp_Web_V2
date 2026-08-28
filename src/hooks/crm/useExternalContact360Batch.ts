/**
 * useExternalContact360Batch
 * 
 * Batch version of useExternalContact360. Instead of N individual RPC calls
 * (one per conversation), this hook takes an array of phones and calls a single
 * RPC `get_companies_by_phones_batch` that returns a map of phone → company data.
 * 
 * Designed for ConversationList where we need CRM data for 20-50+ items at once.
 * 
 * Returns a Map<phone, CRMBatchResult> for O(1) lookup per conversation item.
 */
import { useQuery } from '@tanstack/react-query';
 import { isExternalConfigured } from '@/integrations/supabase/externalClient';
 import { ExternalCRMService } from '@/services/crm/external-crm.service';
import { log } from '@/lib/logger';

export interface CRMBatchResult {
  company_name: string | null;
  logo_url: string | null;
  vendedor_nome: string | null;
  cliente_ativado: boolean | null;
  total_pedidos: number | null;
  valor_total_compras: number | null;
  rfm_segment: string | null;
  rfm_score: number | null;
}

function cleanPhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

export function useExternalContact360Batch(phones: string[]) {
  // Deduplicate and clean phones
  const cleanedPhones = [...new Set(phones.map(cleanPhone).filter(p => p.length >= 8))];
  // Create a stable key from sorted phones
  const queryKey = cleanedPhones.sort().join(',');

  const query = useQuery<Map<string, CRMBatchResult>>({
    queryKey: ['external-contact-360-batch', queryKey],
     queryFn: () => ExternalCRMService.getContact360Batch(cleanedPhones),
    enabled: isExternalConfigured && cleanedPhones.length > 0,
    staleTime: 1000 * 60 * 10, // 10 min cache
    gcTime: 1000 * 60 * 30,
  });

  // Helper to lookup a single phone from the batch result
  const lookup = (phone: string): CRMBatchResult | undefined => {
    if (!query.data) return undefined;
    const clean = cleanPhone(phone);
    return query.data.get(clean) || query.data.get('55' + clean) || query.data.get(phone);
  };

  return {
    batchData: query.data || new Map<string, CRMBatchResult>(),
    lookup,
    isLoading: query.isLoading,
    isConfigured: isExternalConfigured,
  };
}
