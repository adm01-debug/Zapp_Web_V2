import { AlertTriangle, FileText, ShoppingBag } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ContactPurchasesPanel } from '../ContactPurchasesPanel';
import { OpenDealsList } from './OpenDealsList';
import { useContactCrm360 } from '@/hooks/crm/useContactCrm360';
import { SectionCard } from './SectionCard';

interface OrdersTabProps {
  contactId: string;
}

/** Aba Pedidos (23b) — compras/propostas do contato; reaproveita ContactPurchasesPanel e o CRM 360°. */
export function OrdersTab({ contactId }: OrdersTabProps) {
  const { data: crm360, isLoading, isError } = useContactCrm360(contactId);
  const hasPurchases = (crm360?.purchases.length ?? 0) > 0;
  const hasOpenDeals = (crm360?.openDeals.length ?? 0) > 0;
  const isEmpty = !isLoading && !hasPurchases && !hasOpenDeals;

  return (
    <div className="flex flex-col gap-4" data-testid="orders-tab">
      <header>
        <h2 className="text-lg font-bold text-foreground">Pedidos</h2>
        <p className="text-sm text-muted-foreground">Compras e propostas deste contato.</p>
      </header>

      {isLoading ? (
        <div role="status" className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 24rem), 1fr))' }}>
          <span className="sr-only">Carregando pedidos</span>
          <div className="h-40 animate-pulse rounded-xl border border-border bg-muted/20" />
          <div className="h-40 animate-pulse rounded-xl border border-border bg-muted/20" />
        </div>
      ) : isError ? (
        <EmptyState icon={AlertTriangle} title="Não foi possível carregar os pedidos" description="Tente novamente em instantes." size="sm" />
      ) : isEmpty ? (
        <EmptyState
          icon={ShoppingBag}
          title="Nenhum pedido registrado"
          description="Compras e propostas deste contato aparecerão aqui."
          size="sm"
        />
      ) : (
        <div
          data-testid="orders-card-grid"
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 24rem), 1fr))' }}
        >
          <SectionCard icon={ShoppingBag} title="Compras e propostas" className="border-success/20">
            <ContactPurchasesPanel contactId={contactId} />
          </SectionCard>

          <SectionCard icon={FileText} title="Propostas em aberto" className="border-warning/20">
            <OpenDealsList deals={crm360?.openDeals ?? []} />
          </SectionCard>
        </div>
      )}
    </div>
  );
}
