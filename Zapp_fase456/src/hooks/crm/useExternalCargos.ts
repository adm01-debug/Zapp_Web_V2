/**
 * useExternalCargos
 *
 * Fetches the unique cargo suggestions for the contact form autocomplete
 * through the narrow `roleNames` action of the crm-integration Edge Function,
 * allowed to `view_contacts` (attendants included). It replaces the previous
 * mix of the admin-only `search_contacts_advanced` RPC (which returned whole
 * contact rows and 403'd for attendants) and the generic `select` action.
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
