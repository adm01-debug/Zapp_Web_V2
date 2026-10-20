import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { contactCrm360Key } from '@/hooks/crm/useContactCrm360';
import { contactPurchasesKey, useContactPurchases } from '@/hooks/crm/useContactPurchases';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, DollarSign, Package, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { log } from '@/lib/logger';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';

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

/** Teto de sanidade: acima disso é digitação errada, não venda. */
const MAX_AMOUNT = 100_000_000;
const AMOUNT_HINT = 'Informe um valor entre R$ 0,00 e R$ 100.000.000,00.';

/** Vazio → sem valor. Fora de [0, MAX_AMOUNT] ou não numérico → inválido. */
function parseAmount(raw: string): { value: number | null; invalid: boolean } {
  const text = raw.trim();
  if (!text) return { value: null, invalid: false };
  const value = Number.parseFloat(text.replace(',', '.'));
  if (!Number.isFinite(value) || value < 0 || value > MAX_AMOUNT) {
    return { value: null, invalid: true };
  }
  return { value, invalid: false };
}

/** `created_at`/`purchased_at` inválido não pode derrubar a lista: vira '—'. */
function formatPurchaseDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'dd/MM/yy', { locale: ptBR });
}

export function ContactPurchasesPanel({ contactId, profileId }: ContactPurchasesPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('purchase');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const queryClient = useQueryClient();
  const { data: purchases = [], isLoading, isError, refetch } = useContactPurchases(contactId);

  const amountParsed = parseAmount(amount);
  const semUsuario = !profileId;
  const canSubmit = !!title.trim() && !amountParsed.invalid && !semUsuario && !isSubmitting;

  const addPurchase = async () => {
    if (!title.trim()) return;
    const { error } = await supabase.from('contact_purchases').insert({
      contact_id: contactId,
      title: title.trim(),
      amount: amount ? Number.parseFloat(amount) : null,
      purchase_type: type,
      created_by: profileId,
    });
    if (!error) {
      toast.success('Registro adicionado');
      void queryClient.invalidateQueries({ queryKey: contactCrm360Key(contactId) });
      void queryClient.invalidateQueries({ queryKey: contactPurchasesKey(contactId) });
      setDialogOpen(false);
      setTitle('');
      setAmount('');
    } else {
      // Sem isso a falha do insert era silenciosa: o diálogo fechava como se tivesse salvado.
      log.error('Falha ao registrar compra/proposta:', error);
      toast.error('Não foi possível registrar. Tente novamente.');
    }
  };

  // Cancelado não entra no total (a lista continua mostrando o registro).
  const totalValue = purchases.reduce(
    (s, p) => (p.status === 'cancelled' ? s : s + (p.amount ?? 0)),
    0,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-3xs" data-testid="total-compras">
            <DollarSign className="w-3 h-3 mr-0.5" />
            R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (sem cancelados)
          </Badge>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDialogOpen(true)}>
          <Plus className="w-3 h-3 mr-1" /> Novo
        </Button>
      </div>

      {isError ? (
        <div className="text-center py-3 space-y-2">
          <p className="text-xs text-destructive">Falha ao carregar compras e propostas.</p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => { void refetch(); }}
          >
            Tentar de novo
          </Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-12 bg-muted/20 rounded-lg motion-safe:animate-pulse" />)}</div>
      ) : purchases.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">Nenhum registro de compra/proposta</p>
      ) : (
        <div className="space-y-1.5">
          {purchases.map((p, idx) => {
            const st = STATUS_CONFIG[p.status] || STATUS_CONFIG.pending;
            const dataRegistro = formatPurchaseDate(p.purchased_at ?? p.created_at);
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
                  <p className="text-3xs text-muted-foreground">{dataRegistro}</p>
                </div>
                {p.amount != null && (
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
        <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Nova Compra/Proposta</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título" />
            <Input
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="Valor (R$)"
              type="number"
              min={0}
              max={MAX_AMOUNT}
              step="0.01"
              aria-invalid={amountParsed.invalid || undefined}
              aria-describedby={amountParsed.invalid ? 'purchase-amount-erro' : undefined}
            />
            {amountParsed.invalid && (
              <p id="purchase-amount-erro" role="alert" className="text-xs text-destructive">
                {AMOUNT_HINT}
              </p>
            )}
            {semUsuario && (
              <p className="text-xs text-muted-foreground">
                Usuário não identificado — não é possível registrar.
              </p>
            )}
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
            <Button onClick={() => { void addPurchase(); }} disabled={!canSubmit}>
              {isSubmitting ? 'Criando…' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
