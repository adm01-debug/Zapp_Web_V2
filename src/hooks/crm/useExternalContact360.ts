/**
 * useExternalContact360
 * 
 * Hook that calls get_contact_360_by_phone on the external CRM database
 * to enrich a zapp-web contact with full 360° data: company, customer profile,
 * RFM, interactions history, social media, stakeholder map, etc.
 */
 import { useQuery } from '@tanstack/react-query';
 import { useCRMIntegrationEnabled } from '@/hooks/system/useCRMIntegrationEnabled';
 import { ExternalCRMService } from '@/services/crm/external-crm.service';
import { Contact360Data } from '@/types/contact360';
import { log } from '@/lib/logger';

 export function useExternalContact360(contactId: string | undefined) {
   const crmEnabled = useCRMIntegrationEnabled();
   return useQuery<Contact360Data | null>({
     queryKey: ['external-contact-360', contactId],
     queryFn: () => contactId ? ExternalCRMService.getContact360(contactId) as Promise<Contact360Data> : Promise.resolve(null),
     enabled: crmEnabled && !!contactId,
    staleTime: 1000 * 60 * 10, // 10 min cache
    gcTime: 1000 * 60 * 30,    // 30 min gc
    retry: 1,
  });
}
