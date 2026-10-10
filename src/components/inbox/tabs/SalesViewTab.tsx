import { CircleDollarSign, FileText, Link2, ShoppingBag } from 'lucide-react';
import { ContactPurchasesPanel } from '../ContactPurchasesPanel';
import { OpenDealsList } from './OpenDealsList';
import { SectionCard } from './SectionCard';
import { CommercialSummaryStrip } from './CommercialSummaryStrip';
import { EmptyState } from '@/components/ui/empty-state';
import { formatBRL } from '@/lib/formatters';
import { useContactCrm360 } from '@/hooks/crm/useContactCrm360';
import type { ConversationTab } from '../chat/ConversationTabs';

interface SalesViewTabProps {
  contactId: string;
  /** Perfil do agente logado — o ContactPurchasesPanel grava como `created_by`. */
  profileId: string | null;
  /** Troca de aba no chat (origem: ConversationTabContent). "Ver no CRM →" usa `onTabChange('crm')`. */
  onTabChange: (tab: ConversationTab) => void;
  /**
   * Conversa aberta no chat. Escopa a seção "Vinculados a esta conversa":
   * o vínculo entre conversa e oportunidade/orçamento/pedido passa pelo contato
   * da conversa — o banco não tem FK de `sales_deals`/`contact_purchases` para a
   * conversa, então a conversa aberta é o escopo explícito (e o id fica gravado
   * em `data-conversation-id` para rastreio). Sem conversa aberta, nada é listado.
   */
  conversationId?: string | null;
}

/**
 * Aba SalesView — resumo comercial, compras e propostas do contato.
 * Os três blocos ficam sempre montados: o ContactPurchasesPanel detém o botão
 * "+ Novo", e sem ele um contato sem compras não teria onde registrar a primeira.
 * A seção "Vinculados a esta conversa" (N-042) acrescenta o recorte da conversa aberta.
 */
export function SalesViewTab({ contactId, profileId, onTabChange, conversationId }: SalesViewTabProps) {
  const { data: crm360, isLoading } = useContactCrm360(contactId);

  // Sem conversa aberta não existe vínculo a exibir (fail-closed): o chat ainda
  // não apontou qual conversa escopa esta leitura.
  const temConversa = Boolean(conversationId);
  const oportunidades = temConversa ? crm360?.openDeals ?? [] : [];
  const pedidos = temConversa ? crm360?.purchases ?? [] : [];
  const temVinculo = oportunidades.length > 0 || pedidos.length > 0;

  return (
    <div className="flex flex-col gap-4" data-testid="orders-tab">
      <header>
        <h2 className="text-xl font-bold text-foreground">SalesView</h2>
        <p className="text-sm text-muted-foreground">Resumo comercial, compras e propostas deste contato.</p>
      </header>

      <SectionCard
        icon={CircleDollarSign}
        title="Resumo comercial"
        tone="blue"
        action={{ label: 'Ver no CRM →', onClick: () => onTabChange('crm') }}
      >
        <CommercialSummaryStrip contactId={contactId} />
      </SectionCard>

      <SectionCard icon={ShoppingBag} title="Compras e propostas" tone="blue">
        <ContactPurchasesPanel contactId={contactId} profileId={profileId} />
      </SectionCard>

      <SectionCard icon={FileText} title="Propostas em aberto" tone="blue">
        {isLoading ? (
          <div className="space-y-2 motion-safe:animate-pulse">{[0, 1].map(i => <div key={i} className="h-11 rounded-lg bg-muted/20" />)}</div>
        ) : (
          <OpenDealsList deals={crm360?.openDeals ?? []} />
        )}
      </SectionCard>

      <SectionCard icon={Link2} title="Vinculados a esta conversa" tone="blue">
        <div
          className="flex flex-col gap-3"
          data-testid="conversation-linked"
          data-conversation-id={conversationId ?? ''}
        >
          {isLoading ? (
            <div className="space-y-2 motion-safe:animate-pulse">{[0, 1].map(i => <div key={i} className="h-11 rounded-lg bg-muted/20" />)}</div>
          ) : !temVinculo ? (
            <EmptyState
              icon={Link2}
              title="Nada vinculado a esta conversa"
              description="Oportunidades, orçamentos e compras deste contato aparecem aqui quando uma conversa está aberta."
              size="sm"
            />
          ) : (
            <>
              {oportunidades.length > 0 && (
                <OpenDealsList
                  deals={oportunidades}
                  conversationId={conversationId ?? null}
                  emptyMessage="Nenhuma oportunidade ou orçamento vinculado a esta conversa."
                />
              )}
              {pedidos.length > 0 && (
                <ul className="space-y-2" data-testid="conversation-linked-orders">
                  {pedidos.map((pedido) => (
                    <li
                      key={pedido.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3"
                    >
                      <p className="text-sm font-medium truncate">{pedido.title}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        {pedido.amount != null && (
                          <span className="text-sm font-semibold text-foreground tabular-nums">{formatBRL(pedido.amount)}</span>
                        )}
                        <span className="h-6 px-2.5 rounded-full border text-2xs font-semibold inline-flex items-center bg-kpi-green text-kpi-green-fg border-transparent">
                          Pedido
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
