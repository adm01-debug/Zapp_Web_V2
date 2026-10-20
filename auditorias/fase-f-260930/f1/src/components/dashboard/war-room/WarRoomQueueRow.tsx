import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { WarRoomQueue } from '@/hooks/business/useWarRoomData';

interface QueueRowProps {
  queue: WarRoomQueue;
  onClick: () => void;
}

export function WarRoomQueueRow({ queue, onClick }: QueueRowProps) {
  const utilizationPercent = (queue.inProgress / (queue.waiting + queue.inProgress)) * 100 || 0;
  const hasCritical = queue.slaBreaches > 0;

  return (
    <motion.div
      whileHover={{ x: 4 }}
      onClick={onClick}
      className={cn(
        "p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md",
        hasCritical && "border-destructive/50 bg-destructive/5"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: queue.color }} />
          <span className="font-medium">{queue.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {queue.slaBreaches > 0 && <Badge variant="destructive" className="animate-pulse">{queue.slaBreaches} violações</Badge>}
          {queue.slaWarnings > 0 && <Badge variant="secondary" className="bg-warning/20 text-warning">{queue.slaWarnings} em risco</Badge>}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4 text-sm">
        <div><div className="text-muted-foreground text-xs">Aguardando</div><div className="font-semibold">{queue.waiting}</div></div>
        <div><div className="text-muted-foreground text-xs">Em Atendimento</div><div className="font-semibold">{queue.inProgress}</div></div>
        <div><div className="text-muted-foreground text-xs">Tempo Médio</div><div className="font-semibold">{queue.avgWaitTime.toFixed(1)}min</div></div>
        <div><div className="text-muted-foreground text-xs mb-1">Utilização</div><Progress value={utilizationPercent} className="h-2" /></div>
      </div>
    </motion.div>
  );
}
