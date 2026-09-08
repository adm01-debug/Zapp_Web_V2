import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, Users } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAgents } from '@/hooks/crm/useAgents';
import { useQueues } from '@/hooks/business/useQueues';
import { useContactAssignment } from '@/hooks/crm/useContactAssignment';
import { Conversation } from '@/types/chat';
import { cn } from '@/lib/utils';

interface AssignmentSectionProps {
  conversation: Conversation;
}

export function AssignmentSection({ conversation }: AssignmentSectionProps) {
  const { agents } = useAgents();
  const { queues } = useQueues();
  const { assignAgent, assignQueue } = useContactAssignment(conversation.contact.id);

  const currentAgent = agents.find(a => a.id === conversation.assignedTo?.id);

  return (
    <div className="space-y-3">
      {/* Current assignment preview */}
      {currentAgent && (
        <div className="flex items-center gap-2.5 bg-primary/5 rounded-lg p-2.5 border border-primary/10">
          <div className="relative">
            <Avatar className="w-8 h-8 ring-1 ring-primary/20">
              <AvatarImage src={currentAgent.avatar_url || undefined} alt={currentAgent.name || 'Agente'} />
              <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                {currentAgent.name[0]}
              </AvatarFallback>
            </Avatar>
            <div className={cn(
              'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-card',
              currentAgent.is_active ? 'bg-success' : 'bg-muted-foreground/40'
            )} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">{currentAgent.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {currentAgent.is_active ? 'Online' : 'Offline'}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2.5">
        <div>
          <label className="text-[10px] text-muted-foreground mb-1 block uppercase tracking-wider flex items-center gap-1">
            <User className="w-3 h-3" />
            Atendente
          </label>
          <Select
            defaultValue={conversation.assignedTo?.id}
            onValueChange={(value) => assignAgent(value)}
          >
            <SelectTrigger className="w-full border-border/30 hover:border-primary/30 transition-colors bg-muted/20 h-9">
              <SelectValue placeholder="Selecionar atendente" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border/30">
              {agents.filter(a => a.is_active).map((agent) => (
                <SelectItem key={agent.id} value={agent.id} className="hover:bg-primary/10">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Avatar className="w-5 h-5 ring-1 ring-border/30">
                        <AvatarImage src={agent.avatar_url || undefined} alt={agent.name || 'Agente'} />
                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                          {agent.name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className={cn(
                        'absolute -bottom-px -right-px w-2 h-2 rounded-full ring-1 ring-card',
                        agent.is_active ? 'bg-success' : 'bg-muted-foreground/30'
                      )} />
                    </div>
                    <span>{agent.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground mb-1 block uppercase tracking-wider flex items-center gap-1">
            <Users className="w-3 h-3" />
            Fila
          </label>
          <Select
            defaultValue={conversation.queue?.id}
            onValueChange={(value) => assignQueue(value)}
          >
            <SelectTrigger className="w-full border-border/30 hover:border-primary/30 transition-colors bg-muted/20 h-9">
              <SelectValue placeholder="Selecionar fila" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border/30">
              {queues.map((queue) => (
                <SelectItem key={queue.id} value={queue.id} className="hover:bg-primary/10">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full ring-1 ring-border/20" style={{ backgroundColor: queue.color }} />
                    <span>{queue.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
