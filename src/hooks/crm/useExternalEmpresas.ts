/**
 * useExternalEmpresas
 *
 * Fetches unique company names for the contact form autocomplete through the
 * narrow `companyNames` action of the crm-integration Edge Function, which is
 * allowed to `view_contacts` (attendants included) and returns only strings.
 * The old admin-only `search_contacts_advanced` RPC path is gone, so opening
 * the form no longer logs a 403 for attendants.
 */
 import { useQuery } from '@tanstack/react-query';
 import { useCRMIntegrationEnabled } from '@/hooks/system/useCRMIntegrationEnabled';
 import { ExternalCRMService } from '@/services/crm/external-crm.service';
 
 export function useExternalEmpresas() {
   const crmEnabled = useCRMIntegrationEnabled();
   return useQuery<string[]>({
     queryKey: ['external-empresas'],
     queryFn: () => ExternalCRMService.fetchUniqueCompanies(),
     enabled: crmEnabled,
     staleTime: 1000 * 60 * 30,
     gcTime: 1000 * 60 * 60,
   });
 }
