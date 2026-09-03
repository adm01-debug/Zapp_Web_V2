import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Target, Timer, CheckCircle2, XCircle, Users } from 'lucide-react';
import { Sparkline } from '@/components/ui/sparkline';
import { cn } from '@/lib/utils';

const getRateColor = (rate: number) => {
  if (rate >= 90) return 'text-success';
  if (rate >= 70) return 'text-warning';
  return 'text-destructive';
};

const getRateBg = (rate: number) => {
  if (rate >= 90) return 'bg-success/10';
  if (rate >= 70) return 'bg-warning/10';
  return 'bg-destructive/10';
};

interface OverallData {
  overallRate: number;
  totalConversations: number;
  firstResponse: { rate: number; onTime: number; breached: number };
}

interface SLAMetricCardsProps {
  data: OverallData;
  periodLabel: string;
  sparkOverall: number[];
  sparkFR: number[];
  sparkConversations: number[];
}

export function SLAMetricCards({ data, periodLabel, sparkOverall, sparkFR, sparkConversations }: SLAMetricCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className={cn("border-l-4 border-l-primary", getRateBg(data.overallRate))}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Taxa de SLA Geral</p>
                <p className={cn("text-3xl font-bold", getRateColor(data.overallRate))}>{data.overallRate.toFixed(1)}%</p>
              </div>
              <div className={cn("p-3 rounded-full", getRateBg(data.overallRate))}>
                <Target className={cn("h-6 w-6", getRateColor(data.overallRate))} />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <Progress value={data.overallRate} className="h-2 flex-1" />
              {sparkOverall.length >= 2 && <Sparkline data={sparkOverall} width={64} height={20} color="hsl(var(--primary))" />}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="border-l-4 border-l-info">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Primeira Resposta</p>
                <p className={cn("text-3xl font-bold", getRateColor(data.firstResponse.rate))}>{data.firstResponse.rate.toFixed(1)}%</p>
              </div>
              <div className="p-3 rounded-full bg-info/10"><Timer className="h-6 w-6 text-info" /></div>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <div className="flex gap-4 text-sm flex-1">
                <span className="text-success flex items-center gap-1"><CheckCircle2 className="h-4 w-4" />{data.firstResponse.onTime} no prazo</span>
                <span className="text-destructive flex items-center gap-1"><XCircle className="h-4 w-4" />{data.firstResponse.breached} atrasados</span>
              </div>
              {sparkFR.length >= 2 && <Sparkline data={sparkFR} width={64} height={20} color="hsl(var(--info))" />}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card className="border-l-4 border-l-warning">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Conversas</p>
                <p className="text-3xl font-bold">{data.totalConversations}</p>
              </div>
              <div className="p-3 rounded-full bg-warning/10"><Users className="h-6 w-6 text-warning" /></div>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <p className="text-sm text-muted-foreground flex-1">{periodLabel}</p>
              {sparkConversations.length >= 2 && <Sparkline data={sparkConversations} width={64} height={20} color="hsl(var(--warning))" />}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
