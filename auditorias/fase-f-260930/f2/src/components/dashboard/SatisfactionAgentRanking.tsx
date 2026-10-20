import { motion } from 'framer-motion';
import { Award } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface AgentCSAT {
  agentId: string;
  agentName: string;
  csat: number;
  responses: number;
}

interface SatisfactionAgentRankingProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: AgentCSAT[];
}

const getCSATColor = (value: number) => {
  if (value >= 85) return 'text-success';
  if (value >= 70) return 'text-warning';
  return 'text-destructive';
};

export function SatisfactionAgentRanking({ open, onOpenChange, agents }: SatisfactionAgentRankingProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-warning" />
            Ranking de Agentes por CSAT
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-3">
            {agents.map((agent, index) => (
              <motion.div
                key={agent.agentId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center gap-4 p-3 rounded-lg border"
              >
                <div className="text-2xl font-bold text-muted-foreground w-8">
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{agent.agentName}</div>
                  <div className="text-sm text-muted-foreground">{agent.responses} avaliações</div>
                </div>
                <div className="text-right">
                  <div className={`text-xl font-bold ${getCSATColor(agent.csat)}`}>{agent.csat}%</div>
                  <Progress value={agent.csat} className="w-24 h-2" />
                </div>
              </motion.div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
