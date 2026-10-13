import type { KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { WarRoomAgent } from '@/hooks/business/useWarRoomData';

const statusColors = {
  online: 'bg-success',
  busy: 'bg-warning',
  away: 'bg-muted-foreground',
  offline: 'bg-destructive',
};

interface AgentCardProps {
  agent: WarRoomAgent;
  onClick: () => void;
}

export function WarRoomAgentCard({ agent, onClick }: AgentCardProps) {
  // Capacidade não configurada não é "0 de 0" nem "sobrecarregado": sem teto não há
  // utilização a medir nem estouro a acusar (a barra e o rótulo saem vazios).
  const hasCapacity = agent.maxChats > 0;
  const isOverloaded = hasCapacity && agent.activeChats >= agent.maxChats;
  const utilizationPercent = hasCapacity ? Math.min(100, (agent.activeChats / agent.maxChats) * 100) : 0;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <motion.div
      whileHover={{ y: -2 }}
      role="button"
      tabIndex={0}
      aria-label={`Agente ${agent.name}, ${agent.status}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cn("p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", isOverloaded && "border-warning bg-warning/5")}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="relative">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
            {agent.name.split(' ').map(n => n[0]).join('')}
          </div>
          <div className={cn("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card", statusColors[agent.status])} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{agent.name}</div>
          <div className="text-xs text-muted-foreground capitalize">{agent.status}</div>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Chats</span>
          <span className={cn(isOverloaded && "text-warning font-medium")}>{hasCapacity ? `${agent.activeChats}/${agent.maxChats}` : '—'}</span>
        </div>
        <Progress value={utilizationPercent} className="h-1.5" />
        <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
          {/* `avgResponseTime` null = nenhuma 1ª resposta medida hoje (não é "0s medido"). */}
          <div><div className="text-muted-foreground">Resp.</div><div className="font-medium">{agent.avgResponseTime === null ? '—' : `${agent.avgResponseTime}s`}</div></div>
          <div><div className="text-muted-foreground">Hoje</div><div className="font-medium">{agent.resolvedToday}</div></div>
        </div>
      </div>
    </motion.div>
  );
}
