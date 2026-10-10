import { useState } from 'react';
import { useConnectionQueues } from '@/hooks/inbox/useConnectionQueues';
import { useQueues } from '@/hooks/business/useQueues';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Link2 } from 'lucide-react';
import { toast } from 'sonner';

interface ConnectionQueuesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string;
  connectionName: string;
}

export function ConnectionQueuesDialog({
  open,
  onOpenChange,
  connectionId,
  connectionName,
}: ConnectionQueuesDialogProps) {
  const { connectionQueues, isLoading, addQueue, removeQueue } = useConnectionQueues(connectionId);
  const { queues } = useQueues();
  const [saving, setSaving] = useState<string | null>(null);

  const linkedQueueIds = new Set(connectionQueues.map(cq => cq.queue_id));

  const handleToggle = async (queueId: string, isLinked: boolean) => {
    setSaving(queueId);
    try {
      if (isLinked) {
        await removeQueue(queueId);
        toast.success('Fila desvinculada');
      } else {
        await addQueue(queueId);
        toast.success('Fila vinculada');
      }
    } catch {
      toast.error('Erro ao atualizar vínculo');
    } finally {
      setSaving(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" />
            Filas de "{connectionName}"
          </DialogTitle>
          <DialogDescription>
            Vincule filas de atendimento a esta conexão WhatsApp. Contatos serão roteados para as filas vinculadas.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : queues.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma fila cadastrada. Crie filas primeiro.
          </p>
        ) : (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {queues.map((queue) => {
              const isLinked = linkedQueueIds.has(queue.id);
              return (
                <div
                  key={queue.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/30 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={isLinked}
                      disabled={saving === queue.id}
                      onCheckedChange={() => handleToggle(queue.id, isLinked)}
                    />
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: queue.color }}
                    />
                    <span className="text-sm font-medium">{queue.name}</span>
                  </div>
                  {saving === queue.id && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isLinked && saving !== queue.id && (
                    <Badge variant="secondary" className="text-xs">Vinculada</Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
