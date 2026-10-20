import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface RejectResetDialogProps {
  open: boolean;
  email: string;
  processing: boolean;
  onClose: () => void;
  onReject: (reason: string) => void;
}

export function RejectResetDialog({ open, email, processing, onClose, onReject }: RejectResetDialogProps) {
  const [reason, setReason] = useState('');

  const handleReject = () => { onReject(reason); setReason(''); };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Rejeitar Solicitação</DialogTitle>
          <DialogDescription>A solicitação de <strong>{email}</strong> será rejeitada.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Motivo da Rejeição (opcional)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: Atividade suspeita detectada" />
          </div>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">O usuário será notificado por email sobre a rejeição.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" onClick={handleReject} disabled={processing}>{processing ? 'Rejeitando...' : 'Rejeitar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
