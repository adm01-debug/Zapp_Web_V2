/**
 * useExternalCargos
 * 
 * Fetches unique job titles/roles from the external CRM database.
 * - salespeople.role: accessible directly (no RLS blocking anon)
 * - contacts.cargo: blocked by RLS, so we extract from search_contacts_advanced RPC
 */
 import { useQuery } from '@tanstack/react-query';
 import { useCRMIntegrationEnabled } from '@/hooks/system/useCRMIntegrationEnabled';
 import { ExternalCRMService } from '@/services/crm/external-crm.service';
 
 export function useExternalCargos() {
   const crmEnabled = useCRMIntegrationEnabled();
   return useQuery<string[]>({
     queryKey: ['external-cargos'],
     queryFn: () => ExternalCRMService.fetchUniqueRoles(),
     enabled: crmEnabled,
     staleTime: 1000 * 60 * 30,
     gcTime: 1000 * 60 * 60,
   });
 }
