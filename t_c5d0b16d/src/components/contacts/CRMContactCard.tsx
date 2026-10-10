import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Building, Phone, Mail, ShoppingCart, User } from 'lucide-react';
import type { SearchContactResult } from '@/types/contactSearch';

interface CRMContactCardProps {
  contact: SearchContactResult;
  onSelect?: (c: SearchContactResult) => void;
}

const formatCurrency = (v: number | null) =>
  v != null ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : null;

const sentimentEmoji: Record<string, string> = {
  positive: '😊', neutral: '😐', negative: '😟', critical: '🔴',
};

const rfmColors: Record<string, string> = {
  Champions: 'bg-success/15 text-success border-success/30',
  'At Risk': 'bg-destructive/15 text-destructive border-destructive/30',
  Hibernating: 'bg-muted text-muted-foreground border-border',
  'Need Attention': 'bg-warning/15 text-warning border-warning/30',
  Promising: 'bg-secondary/15 text-secondary border-secondary/30',
};

export function CRMContactCard({ contact, onSelect }: CRMContactCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'group border border-border/30 rounded-xl p-3 hover:border-primary/30 hover:bg-primary/[0.02] transition-all cursor-pointer',
        onSelect && 'active:scale-[0.99]'
      )}
      onClick={() => onSelect?.(contact)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm truncate">{contact.full_name || contact.nome_tratamento || 'Sem nome'}</p>
            {contact.sentiment && sentimentEmoji[contact.sentiment] && <span className="text-xs">{sentimentEmoji[contact.sentiment]}</span>}
          </div>
          {contact.cargo && <p className="text-xs text-muted-foreground truncate">{contact.cargo}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {contact.cliente_ativado !== null && (
            <Badge variant="outline" className={cn('text-[9px] py-0', contact.cliente_ativado ? 'bg-success/10 text-success border-success/30' : 'bg-destructive/10 text-destructive border-destructive/30')}>
              {contact.cliente_ativado ? 'Ativo' : 'Inativo'}
            </Badge>
          )}
          {contact.relationship_score > 0 && (
            <Badge variant="outline" className={cn('text-3xs py-0', contact.relationship_score >= 70 ? 'bg-success/10 text-success border-success/30' : contact.relationship_score >= 40 ? 'bg-warning/10 text-warning border-warning/30' : 'bg-muted/20 text-muted-foreground border-border/30')}>
              {contact.relationship_score}
            </Badge>
          )}
          {contact.is_whatsapp && <Badge variant="outline" className="text-[9px] py-0 bg-success/10 text-success border-success/30">💬 WhatsApp</Badge>}
        </div>
      </div>

      {contact.company_name && (
        <div className="flex items-center gap-2 mb-1.5">
          {contact.company_logo ? <img src={contact.company_logo} alt="" className="w-5 h-5 rounded object-contain bg-background border border-border/20" /> : <Building className="w-4 h-4 text-muted-foreground shrink-0" />}
          <span className="text-xs truncate">{contact.company_name}</span>
          {contact.company_estado && <Badge variant="outline" className="text-[9px] py-0 px-1 ml-auto shrink-0">{contact.company_estado}</Badge>}
        </div>
      )}

      <div className="flex items-center gap-3 text-2xs text-muted-foreground flex-wrap">
        {contact.vendedor_nome && <span className="flex items-center gap-1"><User className="w-3 h-3" />{contact.vendedor_nome.split(' ').slice(0, 2).join(' ')}</span>}
        {contact.total_pedidos != null && contact.total_pedidos > 0 && <span className="flex items-center gap-1"><ShoppingCart className="w-3 h-3" />{contact.total_pedidos} ped.</span>}
        {contact.valor_total_compras != null && contact.valor_total_compras > 0 && <span className="flex items-center gap-1 text-success">{formatCurrency(contact.valor_total_compras)}</span>}
        {contact.rfm_segment && <Badge variant="outline" className={cn('text-[9px] py-0 px-1', rfmColors[contact.rfm_segment] || '')}>{contact.rfm_segment}</Badge>}
      </div>

      <div className="flex items-center gap-3 mt-1.5 text-2xs text-muted-foreground">
        {contact.phone_primary && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{contact.phone_primary}</span>}
        {contact.email_primary && <span className="flex items-center gap-1 truncate"><Mail className="w-3 h-3 shrink-0" /><span className="truncate">{contact.email_primary}</span></span>}
      </div>

      {contact.tags && contact.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {contact.tags.slice(0, 4).map(tag => <Badge key={tag} variant="secondary" className="text-[9px] py-0 px-1.5">{tag}</Badge>)}
          {contact.tags.length > 4 && <Badge variant="secondary" className="text-[9px] py-0 px-1.5">+{contact.tags.length - 4}</Badge>}
        </div>
      )}
    </motion.div>
  );
}
