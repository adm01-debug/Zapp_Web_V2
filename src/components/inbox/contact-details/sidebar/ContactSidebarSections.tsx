import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ContactService } from '@/services/contact.service';
import { cleanPhone } from '@/lib/formatters';
import { ContactCRMDialog } from '@/components/contacts/ContactCRMDialog';
import { useContactSidebar } from '@/hooks/crm/useContactSidebar';
import { ProfessionalSection } from './ProfessionalSection';
import { PersonalSection } from './PersonalSection';
import { SinguProfileSection } from './SinguProfileSection';
import type { ConversationContact as Contact } from '@/types/chat';
import type { EnrichedContactData } from '@/hooks/crm/useContactEnrichedData';

interface ContactSidebarSectionsProps {
  contact: Contact;
  enrichedData: EnrichedContactData | null;
  onQuickAction: (action: string) => void;
}

/**
 * Monta as 3 seções do novo sidebar dentro do `Accordion` de
 * `ContactDetails` (etapa 48): Profissional, Pessoal e Perfil Singu. O CTA
 * "Buscar no CRM" (D7) abre o `ContactCRMDialog` existente; ao selecionar,
 * invalida a query do sidebar (a RPC casa por telefone — sem escrita em
 * `crm_contact_links`, que é outro fluxo).
 */
export function ContactSidebarSections({ contact, enrichedData, onQuickAction }: ContactSidebarSectionsProps) {
  const sidebar = useContactSidebar(contact.id);
  const queryClient = useQueryClient();
  const [crmDialogOpen, setCrmDialogOpen] = useState(false);

  const buscarCRM = () => setCrmDialogOpen(true);

  // O vínculo é por telefone (RPC `get_contact_sidebar_by_phone`): só vale
  // refazer a busca quando o contato escolhido tem o MESMO número da
  // conversa. Telefone diferente → aviso honesto em vez de no-op silencioso
  // (sem escrita em `crm_contact_links` — vedado pelo plano).
  const handleCrmSelected = async (contactId: string) => {
    const { data: sel } = await ContactService.getById(contactId);
    const mesmaLinha = sel?.phone && contact.phone &&
      cleanPhone(sel.phone) === cleanPhone(contact.phone);
    if (mesmaLinha) {
      void queryClient.invalidateQueries({ queryKey: ['contact-sidebar', contact.id] });
    } else {
      toast.info('Contato encontrado no CRM com outro telefone — este painel vincula pelo número da conversa.');
    }
  };

  return (
    <>
      <ProfessionalSection
        index={0} status={sidebar.status} data={sidebar.data}
        contact={contact} enrichedData={enrichedData}
        onQuickAction={onQuickAction} onBuscarCRM={buscarCRM}
      />
      <PersonalSection
        index={1} status={sidebar.status} data={sidebar.data}
        onBuscarCRM={buscarCRM}
      />
      <SinguProfileSection
        index={2} status={sidebar.status} data={sidebar.data}
        onBuscarCRM={buscarCRM} onRetry={() => sidebar.refetch()}
      />
      {sidebar.status !== 'disabled' && (
        <ContactCRMDialog
          open={crmDialogOpen}
          onOpenChange={setCrmDialogOpen}
          onContactSelected={(contactId) => {
            setCrmDialogOpen(false);
            void handleCrmSelected(contactId);
          }}
        />
      )}
    </>
  );
}
