import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Users, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAgents } from '@/hooks/crm/useAgents';
import { useAuth } from '@/hooks/auth/useAuth';

/** Resultado de um handoff: a atribuição sempre ocorreu quando o callback
 * resolve; `noteSaved=false` sinaliza sucesso PARCIAL (a nota interna não
 * persistiu) e vira aviso, não "transferida com sucesso". */
export interface HandoffResult {
  noteSaved: boolean;
}

interface HandoffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  /** `contacts.queue_id` do contato. Sem fila (`null`/`undefined`) o guard
   * `trg_prevent_contact_assignee_hijack` só permite atribuir para o próprio
   * usuário — a lista precisa refletir isso, como no `TransferDialog`. */
  queueId?: string | null;
  onHandoff: (agentId: string, comment: string) => Promise<HandoffResult>;
}

// `contactId` continua no contrato do componente (o chamador o informa), mas o
// diálogo não lê dado de contato: quem resolve o destino é o `onHandoff`.
export function HandoffDialog({ open, onOpenChange, queueId, onHandoff }: HandoffDialogProps) {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Mesma fonte e mesmo filtro do TransferDialog: presença real
  // (online/ausente) e, para contato SEM fila, só você mesmo (decisão de
  // produto de 2026-09-24, self-claim only). Antes o painel listava todo
  // `profiles.is_active` e a escolha de um colega num contato sem fila era
  // recusada pelo trigger depois do clique.
  const { agents, isLoading, error, refetch } = useAgents();
  const { user } = useAuth();

  const isQueueless = !queueId;
  // Filter online/away agents (active ones); sem fila, só você mesmo (ver isQueueless acima)
  const availableAgents = agents.filter(
    (a) => (a.status === 'online' || a.status === 'away') && (!isQueueless || a.user_id === user?.id)
  );

  const handleSubmit = async () => {
    if (!selectedAgent) return;
    setIsSubmitting(true);
    try {
      const result = await onHandoff(selectedAgent, comment);
      onOpenChange(false);
      setSelectedAgent(null);
      setComment('');
      if (result.noteSaved) {
        toast.success('Conversa transferida com sucesso!');
      } else {
        toast.warning('Conversa transferida, mas a nota não pôde ser salva.');
      }
    } catch {
      // Falha real (ID inválido, permissão negada, nada gravado): o diálogo
      // permanece aberto e o agente pode tentar de novo — nunca "sucesso".
      toast.error('Erro ao transferir conversa');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />Transferir Conversa
          </DialogTitle>
          <DialogDescription>Adicione um comentário para o próximo atendente</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Selecione o atendente</p>
            {isQueueless && (
              <p className="text-xs text-muted-foreground">
                Contato sem fila: só é possível assumir para você mesmo. Para transferir a outro atendente, mova para um departamento primeiro.
              </p>
            )}
            <ScrollArea className="h-48 border rounded-lg p-2">
              <div className="space-y-1">
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-4" role="status" aria-live="polite">
                    <Loader2 className="w-5 h-5 motion-safe:animate-spin text-muted-foreground" aria-hidden="true" />
                    <span className="text-sm text-muted-foreground">Carregando atendentes…</span>
                  </div>
                ) : error ? (
                  <div role="alert" className="space-y-2 py-4 text-center">
                    <p className="text-sm text-destructive">Não foi possível carregar os atendentes.</p>
                    <Button variant="outline" size="sm" onClick={() => void refetch()}>
                      Tentar novamente
                    </Button>
                  </div>
                ) : availableAgents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum atendente disponível no momento
                  </p>
                ) : (
                  availableAgents.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      aria-pressed={selectedAgent === agent.id}
                      onClick={() => setSelectedAgent(agent.id)}
                      className={cn(
                        'w-full flex items-center gap-3 p-2 rounded-lg transition-colors',
                        selectedAgent === agent.id ? 'bg-primary/20 border border-primary' : 'hover:bg-muted'
                      )}
                    >
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={agent.avatar_url || undefined} alt={agent.name || 'Agente'} />
                        <AvatarFallback>{(agent.name ?? '?').substring(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="flex-1 text-left text-sm">{agent.name}</span>
                      {selectedAgent === agent.id && <Check className="w-4 h-4 text-primary" />}
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
          <div className="space-y-2">
            <label htmlFor="handoff-comment" className="text-sm font-medium">Comentário (opcional)</label>
            <Input id="handoff-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ex: Cliente precisa de suporte técnico" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!selectedAgent || isSubmitting}>
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 motion-safe:animate-spin" />}Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
