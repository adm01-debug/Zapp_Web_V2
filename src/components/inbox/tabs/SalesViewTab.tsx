import { CircleDollarSign, FileText, ShoppingBag } from 'lucide-react';
import { ContactPurchasesPanel } from '../ContactPurchasesPanel';
import { OpenDealsList } from './OpenDealsList';
import { SectionCard } from './SectionCard';
import { CommercialSummaryStrip } from './CommercialSummaryStrip';
import { useContactCrm360 } from '@/hooks/crm/useContactCrm360';

interface SalesViewTabProps {
  contactId: string;
  /** Perfil do agente logado — o ContactPurchasesPanel grava como `created_by`. */
  profileId: string | null;
}

/**
 * Aba SalesView — resumo comercial, compras e propostas do contato.
 * Os três blocos ficam sempre montados: o ContactPurchasesPanel detém o botão
 * "+ Novo", e sem ele um contato sem compras não teria onde registrar a primeira.
 */
export function SalesViewTab({ contactId, profileId }: SalesViewTabProps) {
  const { data: crm360 } = useContactCrm360(contactId);

  return (
    <div className="flex flex-col gap-4" data-testid="orders-tab">
      <header>
        <h2 className="text-xl font-bold text-foreground">SalesView</h2>
        <p className="text-sm text-muted-foreground">Resumo comercial, compras e propostas deste contato.</p>
      </header>

      <SectionCard icon={CircleDollarSign} title="Resumo comercial" tone="blue">
        <CommercialSummaryStrip contactId={contactId} />
      </SectionCard>

      <SectionCard icon={ShoppingBag} title="Compras e propostas" tone="blue">
        <ContactPurchasesPanel contactId={contactId} profileId={profileId} />
      </SectionCard>

      <SectionCard icon={FileText} title="Propostas em aberto" tone="blue">
        <OpenDealsList deals={crm360?.openDeals ?? []} />
      </SectionCard>
    </div>
  );
}
