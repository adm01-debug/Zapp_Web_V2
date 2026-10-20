/**
 * useContactSidebar
 *
 * Hook que busca o payload da RPC `get_contact_sidebar_by_phone` (Singu) via
 * edge `crm-integration` (lookup 'sidebar') para alimentar as 3 seções do
 * painel "Detalhes do Contato". Expõe `status` derivado para a UI não ter que
 * inferir: 'disabled' | 'loading' | 'not_found' | 'error' | 'ok'.
 */
import { useQuery } from '@tanstack/react-query';
import { useCRMIntegrationEnabled } from '@/hooks/system/useCRMIntegrationEnabled';
import { ExternalCRMService } from '@/services/crm/external-crm.service';
import type { ContactSidebarData, ContactSidebarStatus } from '@/types/contactSidebar';

export function useContactSidebar(contactId: string | undefined) {
  const crmEnabled = useCRMIntegrationEnabled();
  const query = useQuery<ContactSidebarData | null>({
    queryKey: ['contact-sidebar', contactId],
    queryFn: () => (contactId ? ExternalCRMService.getContactSidebar(contactId) : Promise.resolve(null)),
    enabled: crmEnabled && !!contactId,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
    retry: 1,
  });

  let status: ContactSidebarStatus;
  // Sem contactId não há o que buscar: mesma UI de 'disabled' (query fica
  // disabled → isPending eterno, que renderizaria um loader infinito).
  if (!crmEnabled || !contactId) status = 'disabled';
  else if (query.isPending) status = 'loading';
  else if (query.isError) status = 'error';
  else if (query.data?.found !== true) status = 'not_found';
  else status = 'ok';

  return { ...query, status };
}
