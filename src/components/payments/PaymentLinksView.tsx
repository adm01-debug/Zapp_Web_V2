import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'; import {
  Plus, DollarSign, Link2, Copy, Trash2, CheckCircle, Clock, XCircle,
  CreditCard, QrCode, ExternalLink, Send, FlaskConical
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaymentLink {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  payment_url: string | null;
  contact_id: string | null;
  paid_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export function PaymentLinksView() {
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);

  // Form
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formMethod, setFormMethod] = useState('pix');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('payment_links').select('*').order('created_at', { ascending: false });
    if (data) setLinks(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel('payment-links-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_links' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const createLink = async () => {
    if (!formTitle.trim() || !formAmount) return;
    const amount = parseFloat(formAmount);
    if (isNaN(amount) || amount <= 0) return;

    // Generate a simple payment URL (in production would integrate with Stripe/payment provider)
    const paymentUrl = `${window.location.origin}/pay/${crypto.randomUUID().slice(0, 8)}`;

    const { error } = await supabase.from('payment_links').insert({
      title: formTitle,
      description: formDescription || null,
      amount,
      payment_method: formMethod,
      payment_url: paymentUrl,
    });

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Link de pagamento criado!' });
    setShowDialog(false);
    setFormTitle(''); setFormDescription(''); setFormAmount(''); setFormMethod('pix');
    fetchData();
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: 'Link copiado!' });
  };

  const deleteLink = async (id: string) => {
    await supabase.from('payment_links').delete().eq('id', id);
    toast({ title: 'Link removido' });
    fetchData();
  };

  const statusConfig: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
    active: { label: 'Ativo', icon: Clock, className: 'text-info bg-info/20 border-info/30' },
    paid: { label: 'Pago', icon: CheckCircle, className: 'text-success bg-success/20 border-success/30' },
    expired: { label: 'Expirado', icon: XCircle, className: 'text-destructive bg-destructive/20 border-destructive/30' },
    cancelled: { label: 'Cancelado', icon: XCircle, className: 'text-muted-foreground bg-muted/20 border-border' },
  };

  const totalActive = links.filter(l => l.status === 'active').reduce((s, l) => s + l.amount, 0);
  const totalPaid = links.filter(l => l.status === 'paid').reduce((s, l) => s + l.amount, 0);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Links de Pagamento"
        subtitle="Crie e gerencie links de pagamento para enviar no chat"
        actions={
          <Button onClick={() => setShowDialog(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Novo Link
          </Button>
        }
      />

      <div className="px-6 pt-4">
        <Alert className="border-warning/30 bg-warning/10">
          <FlaskConical className="h-4 w-4 !text-warning" />
          <AlertTitle className="text-warning">Checkout ainda não está disponível</AlertTitle>
          <AlertDescription>
            A criação de links funciona normalmente e fica salva no sistema, mas a página de pagamento (/pay/&lt;id&gt;) ainda não está conectada a nenhum provedor — o link não processa cobranças reais. Em desenvolvimento.
          </AlertDescription>
        </Alert>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 px-6 pb-4">
        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Link2 className="w-3.5 h-3.5" /> Links Ativos
            </div>
            <p className="text-lg font-bold">
              R$ {totalActive.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <CheckCircle className="w-3.5 h-3.5 text-success" /> Recebidos
            </div>
            <p className="text-lg font-bold text-success">
              R$ {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <CreditCard className="w-3.5 h-3.5" /> Total Links
            </div>
            <p className="text-lg font-bold">{links.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Links List */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-3">
        <AnimatePresence>
          {links.map((link) => {
            const config = statusConfig[link.status] || statusConfig.active;
            const StatusIcon = config.icon;
            return (
              <motion.div key={link.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card className="bg-card/50 border-border/30 hover:border-secondary/30 transition-all group">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", config.className)}>
                      <StatusIcon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-semibold text-sm">{link.title}</h3>
                        <Badge variant="outline" className={cn("text-[10px] h-4", config.className)}>
                          {config.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {link.payment_method === 'pix' ? 'PIX' : 'Cartão'} • {new Date(link.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div className="text-right mr-2">
                      <p className="font-bold text-sm text-foreground">
                        R$ {link.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {link.payment_url && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyLink(link.payment_url!)}>
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteLink(link.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {links.length === 0 && !loading && (
          <div className="text-center py-16 text-muted-foreground">
            <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">Nenhum link de pagamento</p>
            <p className="text-sm">Crie links para enviar aos contatos no chat</p>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Novo Link de Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Ex: Plano Mensal" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valor (R$) *</Label>
                <Input type="number" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <Label>Método</Label>
                <Select value={formMethod} onValueChange={setFormMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="card">Cartão</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={createLink}>Criar Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
