import { CircleDollarSign, FileText } from 'lucide-react';
import { OpenDealsList } from './OpenDealsList';
import { SectionCard } from './SectionCard';
import { CommercialSummaryStrip } from './CommercialSummaryStrip';
import { useContactCrm360 } from '@/hooks/crm/useContactCrm360';
import type { ConversationTab } from '../chat/ConversationTabs';

interface SalesViewTabProps {
  contactId: string;
  /** Troca de aba no chat (origem: ConversationTabContent). "Ver no CRM →" usa `onTabChange('crm')`. */
  onTabChange: (tab: ConversationTab) => void;
}

/**
 * Aba SalesView — resumo comercial e propostas do contato.
 * O módulo de compras (contact_purchases) foi removido em 2026-11-03 (decisão do dono).
 */
export function SalesViewTab({ contactId, onTabChange }: SalesViewTabProps) {
  const { data: crm360, isLoading } = useContactCrm360(contactId);

  return (
    <div className="flex flex-col gap-4" data-testid="orders-tab">
      <header>
        <h2 className="text-xl font-bold text-foreground">SalesView</h2>
        <p className="text-sm text-muted-foreground">Resumo comercial e propostas deste contato.</p>
      </header>

      <SectionCard
        icon={CircleDollarSign}
        title="Resumo comercial"
        tone="blue"
        action={{ label: 'Ver no CRM →', onClick: () => onTabChange('crm') }}
      >
        <CommercialSummaryStrip contactId={contactId} />
      </SectionCard>

      <SectionCard icon={FileText} title="Propostas em aberto" tone="blue">
        {isLoading ? (
          <div className="space-y-2 animate-pulse">{[0, 1].map(i => <div key={i} className="h-11 rounded-lg bg-muted/20" />)}</div>
        ) : (
          <OpenDealsList deals={crm360?.openDeals ?? []} />
        )}
      </SectionCard>
    </div>
  );
}
