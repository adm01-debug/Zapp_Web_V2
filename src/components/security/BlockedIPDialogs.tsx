import { useState } from 'react';
import { Loader2, Plus, Trash2, Clock, Globe, Search, Shield, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';

interface BlockIPDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function BlockIPDialog({ open, onClose, onSuccess }: BlockIPDialogProps) {
  const { user } = useAuth();
  const [newIP, setNewIP] = useState('');
  const [reason, setReason] = useState('');
  const [isPermanent, setIsPermanent] = useState(false);
  const [duration, setDuration] = useState('60');
  const [updating, setUpdating] = useState(false);

  const resetForm = () => { setNewIP(''); setReason(''); setIsPermanent(false); setDuration('60'); };

  const handleBlockIP = async () => {
    if (!newIP.trim() || !reason.trim()) { toast.error('Preencha todos os campos'); return; }
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(newIP)) { toast.error('Formato de IP inválido'); return; }

    setUpdating(true);
    const expiresAt = isPermanent ? null : new Date(Date.now() + parseInt(duration) * 60 * 1000).toISOString();
    const { error } = await supabase.from('blocked_ips').insert({ ip_address: newIP, reason, is_permanent: isPermanent, expires_at: expiresAt, blocked_by: user?.id });

    if (error) { toast.error(error.code === '23505' ? 'Este IP já está bloqueado' : 'Erro ao bloquear IP'); }
    else { toast.success('IP bloqueado com sucesso'); onClose(); resetForm(); onSuccess(); }
    setUpdating(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Bloquear IP</DialogTitle>
          <DialogDescription>Adicione um endereço IP à lista de bloqueio</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor="ip">Endereço IP</Label><Input id="ip" placeholder="192.168.1.1" value={newIP} onChange={(e) => setNewIP(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="reason">Motivo</Label><Input id="reason" placeholder="Ex: Tentativas de força bruta" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <div className="flex items-center justify-between"><Label htmlFor="permanent">Bloqueio permanente</Label><Switch id="permanent" checked={isPermanent} onCheckedChange={setIsPermanent} /></div>
          {!isPermanent && <div className="space-y-2"><Label htmlFor="duration">Duração (minutos)</Label><Input id="duration" type="number" value={duration} onChange={(e) => setDuration(e.target.value)} min="1" /></div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleBlockIP} disabled={updating}>{updating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Bloquear</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface UnblockIPDialogProps {
  ip: { id: string; ip_address: string } | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function UnblockIPDialog({ ip, onClose, onSuccess }: UnblockIPDialogProps) {
  const [updating, setUpdating] = useState(false);

  const handleUnblock = async () => {
    if (!ip) return;
    setUpdating(true);
    const { error } = await supabase.from('blocked_ips').delete().eq('id', ip.id);
    if (error) toast.error('Erro ao desbloquear IP');
    else { toast.success('IP desbloqueado'); onClose(); onSuccess(); }
    setUpdating(false);
  };

  return (
    <AlertDialog open={!!ip} onOpenChange={() => onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desbloquear IP?</AlertDialogTitle>
          <AlertDialogDescription>O IP <code className="font-mono">{ip?.ip_address}</code> poderá acessar o sistema novamente.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={updating}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleUnblock} disabled={updating}>{updating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Desbloquear</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
