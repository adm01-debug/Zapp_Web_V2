import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Timer, TrendingUp, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const getRateColor = (rate: number) => {
  if (rate >= 90) return 'text-success';
  if (rate >= 70) return 'text-warning';
  return 'text-destructive';
};

const getRateBadge = (rate: number) => {
  if (rate >= 90) return 'bg-success/20 text-success dark:text-success';
  if (rate >= 70) return 'bg-warning/20 text-warning dark:text-warning';
  return 'bg-destructive/20 text-destructive dark:text-destructive';
};

interface AgentData {
  agentId: string;
  agentName: string;
  avatarUrl?: string;
  overallRate: number;
  firstResponse: { rate: number; onTime: number; total: number };
}

interface SLAAgentTableProps {
  agents: AgentData[];
}

export function SLAAgentTable({ agents }: SLAAgentTableProps) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          SLA por Agente
        </CardTitle>
      </CardHeader>
      <CardContent>
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <Users className="w-7 h-7 text-muted-foreground/40" />
            </div>
            <p className="font-medium text-foreground mb-1">Sem dados de agentes</p>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Métricas individuais aparecerão quando agentes forem atribuídos a conversas monitoradas.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {agents.map((agent, index) => (
              <motion.div
                key={agent.agentId}
                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.1 }}
                className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <Avatar className="h-12 w-12">
                  <AvatarImage src={agent.avatarUrl} />
                  <AvatarFallback>{agent.agentName.split(' ').map(n => n[0]).join('').slice(0, 2)}</AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{agent.agentName}</p>
                    <Badge className={getRateBadge(agent.overallRate)}>{agent.overallRate.toFixed(0)}% SLA</Badge>
                  </div>
                  <div className="flex gap-6 mt-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Timer className="h-4 w-4 text-info" />
                      <span className="text-muted-foreground">1ª Resposta:</span>
                      <span className={getRateColor(agent.firstResponse.rate)}>{agent.firstResponse.rate.toFixed(0)}%</span>
                      <span className="text-muted-foreground">({agent.firstResponse.onTime}/{agent.firstResponse.total})</span>
                    </div>
                  </div>
                </div>

                <div className="hidden md:block w-32">
                  <Progress value={agent.overallRate} className="h-2" />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
