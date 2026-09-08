import { ShoppingBag, CircleDollarSign, FileText, Clock3 } from 'lucide-react';
import { useContactCrm360 } from '@/hooks/crm/useContactCrm360';

interface ComercialSummaryWidgetProps {
  contactId: string;
}

const formatCurrency = (v: number) => v > 0 ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';

export function ComercialSummaryWidget({ contactId }: ComercialSummaryWidgetProps) {
  const { data, isLoading } = useContactCrm360(contactId);
  const resumo = data?.resumo;
  const ticketMedio = data?.ticketMedio;

  if (isLoading) {
    return <div className="grid grid-cols-2 gap-1.5 animate-pulse">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted/20" />)}</div>;
  }

  return (
    <div className="grid grid-cols-2 gap-1.5">
      <div className="bg-muted/20 rounded-lg p-2 text-center">
        <CircleDollarSign className="w-3.5 h-3.5 mx-auto mb-0.5 text-muted-foreground" />
        <p className="text-sm font-medium">{resumo ? formatCurrency(resumo.comprasTotal) : '—'}</p>
        <p className="text-[10px] text-muted-foreground">Compras ({resumo?.comprasCount ?? 0})</p>
      </div>
      <div className="bg-muted/20 rounded-lg p-2 text-center">
        <ShoppingBag className="w-3.5 h-3.5 mx-auto mb-0.5 text-muted-foreground" />
        <p className="text-sm font-medium">{ticketMedio ? formatCurrency(ticketMedio) : '—'}</p>
        <p className="text-[10px] text-muted-foreground">Ticket médio</p>
      </div>
      <div className="bg-muted/20 rounded-lg p-2 text-center">
        <FileText className="w-3.5 h-3.5 mx-auto mb-0.5 text-muted-foreground" />
        <p className="text-sm font-medium">{resumo?.propostas ?? '—'}</p>
        <p className="text-[10px] text-muted-foreground">Propostas</p>
      </div>
      <div className="bg-muted/20 rounded-lg p-2 text-center">
        <Clock3 className="w-3.5 h-3.5 mx-auto mb-0.5 text-muted-foreground" />
        <p className="text-sm font-medium">{resumo?.emAberto ?? '—'}</p>
        <p className="text-[10px] text-muted-foreground">Em aberto</p>
      </div>
    </div>
  );
}
