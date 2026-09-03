import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Plus, Trash2, Globe, Loader2, Search, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface WhitelistedIP {
  id: string;
  ip_address: string;
  description: string | null;
  added_by: string | null;
  created_at: string;
}

export function IPWhitelistPanel() {
  const { user } = useAuth();
  const [whitelistedIPs, setWhitelistedIPs] = useState<WhitelistedIP[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [ipToRemove, setIpToRemove] = useState<WhitelistedIP | null>(null);
  const [updating, setUpdating] = useState(false);

  // Form state
  const [newIP, setNewIP] = useState('');
  const [description, setDescription] = useState('');

  const fetchWhitelistedIPs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ip_whitelist')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setWhitelistedIPs(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchWhitelistedIPs();
  }, []);

  const handleAddIP = async () => {
    if (!newIP.trim()) {
      toast.error('Informe o endereço IP');
      return;
    }

    // Validate IP format (also allow CIDR notation)
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    if (!ipRegex.test(newIP)) {
      toast.error('Formato de IP inválido');
      return;
    }

    setUpdating(true);
    const { error } = await supabase
      .from('ip_whitelist')
      .insert({
        ip_address: newIP,
        description: description || null,
        added_by: user?.id
      });

    if (error) {
      if (error.code === '23505') {
        toast.error('Este IP já está na whitelist');
      } else {
        toast.error('Erro ao adicionar IP');
      }
    } else {
      toast.success('IP adicionado à whitelist');
      setShowAddDialog(false);
      resetForm();
      fetchWhitelistedIPs();
    }
    setUpdating(false);
  };

  const handleRemoveIP = async () => {
    if (!ipToRemove) return;

    setUpdating(true);
    const { error } = await supabase
      .from('ip_whitelist')
      .delete()
      .eq('id', ipToRemove.id);

    if (error) {
      toast.error('Erro ao remover IP');
    } else {
      toast.success('IP removido da whitelist');
      setIpToRemove(null);
      fetchWhitelistedIPs();
    }
    setUpdating(false);
  };

  const resetForm = () => {
    setNewIP('');
    setDescription('');
  };

  const filteredIPs = whitelistedIPs.filter(ip =>
    ip.ip_address.includes(search) ||
    ip.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-success/10 dark:bg-success/20/30 rounded-full flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-success dark:text-success" />
              </div>
              <div>
                <CardTitle>Whitelist de IPs</CardTitle>
                <CardDescription>
                  IPs que nunca serão bloqueados pelo rate limiting
                </CardDescription>
              </div>
            </div>
            <Button onClick={() => setShowAddDialog(true)} size="sm" variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Adicionar IP
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por IP ou descrição..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredIPs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Globe className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p>Nenhum IP na whitelist</p>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {filteredIPs.map((ip) => (
                  <motion.div
                    key={ip.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center justify-between p-3 rounded-lg border bg-success/10/50 dark:bg-success/20/10 border-success dark:border-success"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-success/10 dark:bg-success/20/30 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-success dark:text-success" />
                      </div>
                      <div>
                        <code className="font-mono font-medium">{ip.ip_address}</code>
                        {ip.description && (
                          <p className="text-sm text-muted-foreground">{ip.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Adicionado em {format(new Date(ip.created_at), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIpToRemove(ip)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add IP Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Adicionar à Whitelist</DialogTitle>
            <DialogDescription>
              IPs na whitelist nunca serão bloqueados pelo rate limiting
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ip">Endereço IP</Label>
              <Input
                id="ip"
                placeholder="192.168.1.1 ou 192.168.1.0/24"
                value={newIP}
                onChange={(e) => setNewIP(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Suporta notação CIDR para ranges (ex: 192.168.1.0/24)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição (opcional)</Label>
              <Input
                id="description"
                placeholder="Ex: Servidor de produção"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddIP} disabled={updating}>
              {updating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation */}
      <AlertDialog open={!!ipToRemove} onOpenChange={() => setIpToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover da Whitelist?</AlertDialogTitle>
            <AlertDialogDescription>
              O IP <code className="font-mono">{ipToRemove?.ip_address}</code> passará a ser monitorado pelo rate limiting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveIP} disabled={updating}>
              {updating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
