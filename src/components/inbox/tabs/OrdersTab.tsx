import { ShoppingBag } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ContactPurchasesPanel } from '../ContactPurchasesPanel';
import { OpenDealsList } from './OpenDealsList';
import { useContactCrm360 } from '@/hooks/crm/useContactCrm360';

interface OrdersTabProps {
  contactId: string;
}

/** Aba Pedidos (23b) — compras/propostas do contato; reaproveita ContactPurchasesPanel e o CRM 360°. */
export function OrdersTab({ contactId }: OrdersTabProps) {
  const { data: crm360, isLoading } = useContactCrm360(contactId);
  const hasPurchases = (crm360?.purchases.length ?? 0) > 0;
  const hasOpenDeals = (crm360?.openDeals.length ?? 0) > 0;
  const isEmpty = !isLoading && !hasPurchases && !hasOpenDeals;

  return (
    <div className="flex flex-col gap-4" data-testid="orders-tab">
      <header>
        <h2 className="text-lg font-bold text-foreground">Pedidos</h2>
        <p className="text-sm text-muted-foreground">Compras e propostas deste contato.</p>
      </header>

      {isEmpty ? (
        <EmptyState
          icon={ShoppingBag}
          title="Nenhum pedido registrado"
          description="Compras e propostas deste contato aparecerão aqui."
          size="sm"
        />
      ) : (
        <>
          <section className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
            <h3 className="text-sm font-semibold">Compras e propostas</h3>
            <ContactPurchasesPanel contactId={contactId} />
          </section>

          <section className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
            <h3 className="text-sm font-semibold">Propostas em aberto</h3>
            <OpenDealsList deals={crm360?.openDeals ?? []} />
          </section>
        </>
      )}
    </div>
  );
}
