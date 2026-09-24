import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ShoppingBag, DollarSign, Calendar, ChevronDown, ChevronUp, Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';

interface Purchase {
  id: string;
  title: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  purchased_at: string | null;
  purchase_type: string | null;
  created_at: string;
}

interface ContactPurchaseHistoryProps {
  contactId: string;
  className?: string;
}

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-success/10 text-success',
  pending: 'bg-warning/10 text-warning',
  cancelled: 'bg-destructive/10 text-destructive',
};

export function ContactPurchaseHistory({ contactId, className }: ContactPurchaseHistoryProps) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('contact_purchases')
        .select('id, title, amount, currency, status, purchased_at, purchase_type, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(20);
      setPurchases(data || []);
      setLoading(false);
    }
    fetch();
  }, [contactId]);

  const totalValue = purchases
    .filter(p => p.status !== 'cancelled')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const displayed = expanded ? purchases : purchases.slice(0, 3);

  if (loading) {
    return (
      <div className={cn("space-y-3", className)}>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <ShoppingBag className="w-3 h-3" />
          Compras
        </h3>
        {[1, 2].map(i => (
          <div key={i} className="p-3 rounded-lg bg-muted/20 animate-pulse space-y-2">
            <div className="h-3 w-24 bg-muted rounded" />
            <div className="h-2.5 w-16 bg-muted/60 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <ShoppingBag className="w-3 h-3" />
          Compras
        </h3>
        <Badge variant="secondary" className="text-3xs">{purchases.length}</Badge>
      </div>

      {/* Total value */}
      {purchases.length > 0 && (
        <div className="rounded-lg bg-primary/5 border border-primary/10 p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <DollarSign className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-lg font-bold text-foreground">
              R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-3xs text-muted-foreground">Valor total</p>
          </div>
        </div>
      )}

      {purchases.length === 0 ? (
        <div className="text-center py-4">
          <Package className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground/50">Nenhuma compra registrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {displayed.map((purchase, i) => (
              <motion.div
                key={purchase.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="p-3 rounded-lg bg-muted/20 border border-border/20"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{purchase.title}</p>
                    {purchase.purchase_type && (
                      <p className="text-3xs text-muted-foreground">{purchase.purchase_type}</p>
                    )}
                  </div>
                  {purchase.amount != null && (
                    <span className="text-xs font-bold text-foreground whitespace-nowrap">
                      R$ {purchase.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge className={cn("text-[9px] h-4 px-1.5", STATUS_STYLES[purchase.status || ''] || 'bg-muted text-muted-foreground')}>
                    {purchase.status === 'completed' ? 'Concluída' : purchase.status === 'pending' ? 'Pendente' : purchase.status || 'N/A'}
                  </Badge>
                  {purchase.purchased_at && (
                    <span className="text-3xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-2.5 h-2.5" />
                      {format(new Date(purchase.purchased_at), 'dd/MM/yyyy', { locale: ptBR })}
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {purchases.length > 3 && (
        <Button
          variant="ghost" size="sm"
          className="w-full text-xs h-7 text-muted-foreground gap-1"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? 'Mostrar menos' : `Ver mais ${purchases.length - 3} compras`}
        </Button>
      )}
    </div>
  );
}
