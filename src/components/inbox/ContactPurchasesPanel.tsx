import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ShoppingBag, Plus, DollarSign, Package, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';

interface Purchase {
  id: string;
  title: string;
  description: string | null;
  amount: number | null;
  currency: string;
  status: string;
  purchase_type: string;
  purchased_at: string | null;
  created_at: string;
}

interface ContactPurchasesPanelProps {
  contactId: string;
  profileId?: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendente', color: 'bg-warning/10 text-warning' },
  approved: { label: 'Aprovado', color: 'bg-success/10 text-success' },
  completed: { label: 'Concluído', color: 'bg-primary/10 text-primary' },
  cancelled: { label: 'Cancelado', color: 'bg-destructive/10 text-destructive' },
};

export function ContactPurchasesPanel({ contactId, profileId }: ContactPurchasesPanelProps) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('purchase');

  useEffect(() => { loadPurchases(); }, [contactId]);

  const loadPurchases = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('contact_purchases')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });
    if (data) setPurchases(data);
    setLoading(false);
  };

  const addPurchase = async () => {
    if (!title.trim()) return;
    const { error } = await supabase.from('contact_purchases').insert({
      contact_id: contactId,
      title: title.trim(),
      amount: amount ? parseFloat(amount) : null,
      purchase_type: type,
      created_by: profileId,
    });
    if (!error) {
      toast.success('Registro adicionado');
      setDialogOpen(false);
      setTitle('');
      setAmount('');
      loadPurchases();
    }
  };

  const totalValue = purchases.reduce((s, p) => s + (p.amount || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            <DollarSign className="w-3 h-3 mr-0.5" />
            R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </Badge>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDialogOpen(true)}>
          <Plus className="w-3 h-3 mr-1" /> Novo
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-12 bg-muted/20 rounded-lg animate-pulse" />)}</div>
      ) : purchases.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">Nenhum registro de compra/proposta</p>
      ) : (
        <div className="space-y-1.5">
          {purchases.map((p, idx) => {
            const st = STATUS_CONFIG[p.status] || STATUS_CONFIG.pending;
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.05 }}
                className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors"
              >
                {p.purchase_type === 'proposal' ? (
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : (
                  <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{p.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {format(new Date(p.created_at), 'dd/MM/yy', { locale: ptBR })}
                  </p>
                </div>
                {p.amount && (
                  <span className="text-xs font-medium text-primary">
                    R$ {p.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                )}
                <Badge variant="outline" className={`text-[9px] ${st.color}`}>{st.label}</Badge>
              </motion.div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Nova Compra/Proposta</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título" />
            <Input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Valor (R$)" type="number" step="0.01" />
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="purchase">Compra</SelectItem>
                <SelectItem value="proposal">Proposta</SelectItem>
                <SelectItem value="subscription">Assinatura</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={addPurchase} disabled={!title.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
