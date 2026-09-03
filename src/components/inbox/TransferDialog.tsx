import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { User, Users, Send, ArrowRight, Loader2, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgents } from '@/hooks/crm/useAgents';
import { useQueues } from '@/hooks/business/useQueues';
import { supabase } from '@/integrations/supabase/client';

interface TransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransfer: (type: 'agent' | 'queue' | 'connection', targetId: string, message?: string) => void;
}

export function TransferDialog({ open, onOpenChange, onTransfer }: TransferDialogProps) {
  const [transferType, setTransferType] = useState<'agent' | 'queue' | 'connection'>('agent');
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [message, setMessage] = useState('');
  const [connections, setConnections] = useState<{ id: string; name: string; phone_number: string; status: string }[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);

  const { agents, isLoading: loadingAgents } = useAgents();
  const { queues, loading: loadingQueues } = useQueues();

  // Fetch WhatsApp connections
  useEffect(() => {
    if (transferType !== 'connection' || !open) return;
    setLoadingConnections(true);
    supabase
      .from('whatsapp_connections')
      .select('id, name, phone_number, status')
      .eq('status', 'connected')
      .then(({ data }) => {
        setConnections(data || []);
        setLoadingConnections(false);
      });
  }, [transferType, open]);

  const [isTransferring, setIsTransferring] = useState(false);

  const handleTransfer = async () => {
    if (!selectedTarget || isTransferring) return;
    setIsTransferring(true);
    try {
      onTransfer(transferType, selectedTarget, message || undefined);
      onOpenChange(false);
      setSelectedTarget('');
      setMessage('');
    } finally {
      setIsTransferring(false);
    }
  };

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedTarget('');
      setMessage('');
      setIsTransferring(false);
    }
  }, [open]);

  // Filter online/away agents (active ones)
  const availableAgents = agents.filter((a) => a.status === 'online' || a.status === 'away');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="w-5 h-5 text-whatsapp" />
            Transferir Chat
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Transfer Type */}
            <RadioGroup
              value={transferType}
              onValueChange={(v) => {
                setTransferType(v as 'agent' | 'queue' | 'connection');
                setSelectedTarget('');
              }}
              className="grid grid-cols-3 gap-3"
            >
            <Label
              htmlFor="agent"
              className={cn(
                'flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all',
                transferType === 'agent'
                  ? 'border-whatsapp bg-whatsapp/5'
                  : 'border-border hover:border-muted-foreground'
              )}
            >
              <RadioGroupItem value="agent" id="agent" className="sr-only" />
              <User className={cn(
                'w-5 h-5',
                transferType === 'agent' ? 'text-whatsapp' : 'text-muted-foreground'
              )} />
              <div>
                <p className="font-medium">Usuário</p>
                <p className="text-xs text-muted-foreground">Transferir para um atendente</p>
              </div>
            </Label>

            <Label
              htmlFor="queue"
              className={cn(
                'flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all',
                transferType === 'queue'
                  ? 'border-whatsapp bg-whatsapp/5'
                  : 'border-border hover:border-muted-foreground'
              )}
            >
              <RadioGroupItem value="queue" id="queue" className="sr-only" />
              <Users className={cn(
                'w-5 h-5',
                transferType === 'queue' ? 'text-whatsapp' : 'text-muted-foreground'
              )} />
              <div>
                <p className="font-medium">Departamento</p>
                <p className="text-xs text-muted-foreground">Transferir para uma fila</p>
              </div>
            </Label>

            <Label
              htmlFor="connection"
              className={cn(
                'flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all',
                transferType === 'connection'
                  ? 'border-whatsapp bg-whatsapp/5'
                  : 'border-border hover:border-muted-foreground'
              )}
            >
              <RadioGroupItem value="connection" id="connection" className="sr-only" />
              <Smartphone className={cn(
                'w-5 h-5',
                transferType === 'connection' ? 'text-whatsapp' : 'text-muted-foreground'
              )} />
              <div>
                <p className="font-medium">Conexão</p>
                <p className="text-xs text-muted-foreground">Outro WhatsApp</p>
              </div>
            </Label>
          </RadioGroup>

          {/* Target Selection */}
          {transferType === 'agent' && (
            <div className="space-y-2">
              <Label>Selecione um atendente</Label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {loadingAgents ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : availableAgents.length > 0 ? (
                  availableAgents.map((agent) => (
                    <motion.button
                      key={agent.id}
                      whileHover={{ x: 4 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedTarget(agent.id)}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
                        selectedTarget === agent.id
                          ? 'border-whatsapp bg-whatsapp/5'
                          : 'border-border hover:border-muted-foreground'
                      )}
                    >
                      <div className="relative">
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={agent.avatar_url || undefined} />
                          <AvatarFallback>{agent.name[0]}</AvatarFallback>
                        </Avatar>
                        <span className={cn(
                          'absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background',
                          agent.status === 'online' && 'bg-status-online',
                          agent.status === 'away' && 'bg-status-away'
                        )} />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{agent.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {agent.activeChats}/{agent.max_chats || 5} chats ativos
                        </p>
                      </div>
                    </motion.button>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum atendente disponível no momento
                  </p>
                )}
              </div>
            </div>
          )}

          {transferType === 'connection' && (
            <div className="space-y-2">
              <Label>Selecione uma conexão WhatsApp</Label>
              {loadingConnections ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : connections.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {connections.map((conn) => (
                    <motion.button
                      key={conn.id}
                      whileHover={{ x: 4 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedTarget(conn.id)}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
                        selectedTarget === conn.id
                          ? 'border-whatsapp bg-whatsapp/5'
                          : 'border-border hover:border-muted-foreground'
                      )}
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Smartphone className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{conn.name}</p>
                        <p className="text-xs text-muted-foreground">{conn.phone_number}</p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma conexão disponível
                </p>
              )}
            </div>
          )}

          {transferType === 'queue' && (
            <div className="space-y-2">
              <Label>Selecione um departamento</Label>
              {loadingQueues ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Select value={selectedTarget} onValueChange={setSelectedTarget}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha um departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {queues.map((queue) => (
                      <SelectItem key={queue.id} value={queue.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: queue.color }}
                          />
                          <span>{queue.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Optional Message */}
          <div className="space-y-2">
            <Label>Mensagem (opcional)</Label>
            <Textarea
              placeholder="Deixe uma mensagem para o próximo atendente..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                onClick={handleTransfer}
                disabled={!selectedTarget || isTransferring}
                className="bg-whatsapp hover:bg-whatsapp-dark"
              >
                {isTransferring ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                {isTransferring ? 'Transferindo...' : 'Transferir'}
              </Button>
            </motion.div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
