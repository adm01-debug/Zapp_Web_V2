import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Users, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface HandoffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  onHandoff: (agentId: string, comment: string) => Promise<void>;
}

export function HandoffDialog({ open, onOpenChange, contactId, onHandoff }: HandoffDialogProps) {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: agents } = useQuery({
    queryKey: ['agents-for-handoff'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, name, avatar_url').eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const handleSubmit = async () => {
    if (!selectedAgent) return;
    setIsSubmitting(true);
    try {
      await onHandoff(selectedAgent, comment);
      onOpenChange(false);
      setSelectedAgent(null);
      setComment('');
      toast.success('Conversa transferida com sucesso!');
    } catch {
      toast.error('Erro ao transferir conversa');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />Transferir Conversa
          </DialogTitle>
          <DialogDescription>Adicione um comentário para o próximo atendente</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Selecione o atendente</label>
            <ScrollArea className="h-48 border rounded-lg p-2">
              <div className="space-y-1">
                {agents?.map((agent) => (
                  <button key={agent.id} onClick={() => setSelectedAgent(agent.id)}
                    className={cn('w-full flex items-center gap-3 p-2 rounded-lg transition-colors',
                      selectedAgent === agent.id ? 'bg-primary/20 border border-primary' : 'hover:bg-muted')}>
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={agent.avatar_url || undefined} />
                      <AvatarFallback>{agent.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="flex-1 text-left text-sm">{agent.name}</span>
                    {selectedAgent === agent.id && <Check className="w-4 h-4 text-primary" />}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Comentário (opcional)</label>
            <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ex: Cliente precisa de suporte técnico" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!selectedAgent || isSubmitting}>
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
