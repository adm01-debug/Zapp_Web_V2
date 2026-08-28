import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Building, User } from 'lucide-react';

interface CrmBadgesProps {
  crmCompany: { nome_fantasia?: string | null; nome_crm?: string | null } | null;
  crmCustomer: {
    vendedor_nome?: string | null;
    total_pedidos?: number | null;
    ticket_medio?: number | null;
    valor_total_compras?: number | null;
    cliente_ativado?: boolean | null;
  } | null;
  crmRfm: { segment_code?: string | null } | null;
}

const rfmSegmentColors: Record<string, string> = {
  Champions: 'bg-success/15 text-success border-success/30',
  'Loyal Customers': 'bg-info/15 text-info border-info/30',
  'At Risk': 'bg-destructive/15 text-destructive border-destructive/30',
  Hibernating: 'bg-muted text-muted-foreground border-border',
  Lost: 'bg-muted/50 text-muted-foreground border-border/50',
  "Can't Lose Them": 'bg-destructive/15 text-destructive border-destructive/30',
  'Need Attention': 'bg-warning/15 text-warning border-warning/30',
  Promising: 'bg-secondary/15 text-secondary border-secondary/30',
};

const formatCurrency = (v: number | null) =>
  v != null ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';

export function CrmBadges({ crmCompany, crmCustomer, crmRfm }: CrmBadgesProps) {
  return (
    <>
      {crmCompany && (
        <Badge variant="outline" className="text-[10px] bg-primary/5 border-primary/20 text-primary">
          <Building className="w-3 h-3 mr-0.5" />
          {crmCompany.nome_fantasia || crmCompany.nome_crm}
        </Badge>
      )}
      {crmCustomer?.vendedor_nome && (
        <Badge variant="outline" className="text-[10px] bg-muted/20 border-border/30">
          <User className="w-3 h-3 mr-0.5" />
          {crmCustomer.vendedor_nome.split(' ').slice(0, 2).join(' ')}
        </Badge>
      )}
      {crmRfm?.segment_code && (
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline" className={cn('text-[10px]', rfmSegmentColors[crmRfm.segment_code] || 'bg-muted/20')}>
              {crmRfm.segment_code}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            <div className="space-y-1">
              <p>Pedidos: {crmCustomer?.total_pedidos ?? 0}</p>
              <p>Ticket médio: {formatCurrency(crmCustomer?.ticket_medio ?? null)}</p>
              <p>Total compras: {formatCurrency(crmCustomer?.valor_total_compras ?? null)}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      )}
      {crmCustomer && (
        <Badge variant="outline" className={cn('text-[10px]', crmCustomer.cliente_ativado ? 'bg-success/10 text-success border-success/30' : 'bg-destructive/10 text-destructive border-destructive/30')}>
          {crmCustomer.cliente_ativado ? 'Ativo' : 'Inativo'}
        </Badge>
      )}
    </>
  );
}
