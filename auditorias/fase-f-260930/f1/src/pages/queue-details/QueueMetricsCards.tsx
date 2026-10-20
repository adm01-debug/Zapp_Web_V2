import { Card, CardContent } from '@/components/ui/card';
import { Users, Clock, CheckCircle, TrendingUp } from 'lucide-react';

interface QueueMetrics {
  totalContacts: number;
  assignedContacts: number;
  waitingContacts: number;
  avgResponseTime: string;
  resolvedToday: number;
}

export function QueueMetricsCards({ metrics }: { metrics: QueueMetrics }) {
  const cards = [
    { icon: Users, label: 'Total de Contatos', value: metrics.totalContacts, color: 'bg-primary/10 text-primary' },
    { icon: Clock, label: 'Aguardando', value: metrics.waitingContacts, color: 'bg-warning/10 text-warning' },
    { icon: CheckCircle, label: 'Resolvidos Hoje', value: metrics.resolvedToday, color: 'bg-success/10 text-success' },
    { icon: TrendingUp, label: 'Tempo Médio', value: metrics.avgResponseTime, color: 'bg-info/10 text-info' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(({ icon: Icon, label, value, color }) => (
        <Card key={label} className="border border-secondary/20 bg-card/50 backdrop-blur">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color.split(' ')[0]}`}>
                <Icon className={`w-5 h-5 ${color.split(' ')[1]}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold text-foreground">{value}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
