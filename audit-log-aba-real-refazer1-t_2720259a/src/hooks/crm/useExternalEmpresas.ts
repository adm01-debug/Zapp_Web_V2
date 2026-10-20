/**
 * useExternalEmpresas
 * 
 * Fetches unique company names from the external CRM database
 * using search_contacts_advanced RPC (SECURITY DEFINER) to bypass RLS.
 * Direct queries to 'companies' table are blocked by RLS for anon role.
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
