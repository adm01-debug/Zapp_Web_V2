import { Card, CardContent } from '@/components/ui/card';
import { Target, TrendingUp, Trophy, DollarSign } from 'lucide-react';

interface PipelineKPICardsProps {
  totalPipeline: number;
  activeDeals: number;
  totalWon: number;
  conversionRate: number;
}

export function PipelineKPICards({ totalPipeline, activeDeals, totalWon, conversionRate }: PipelineKPICardsProps) {
  const cards = [
    { icon: Target, label: 'Pipeline Total', value: `R$ ${totalPipeline.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, color: '' },
    { icon: TrendingUp, label: 'Deals Ativos', value: String(activeDeals), color: '' },
    { icon: Trophy, label: 'Ganhos', value: `R$ ${totalWon.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, color: 'text-success' },
    { icon: DollarSign, label: 'Taxa Conversão', value: `${conversionRate}%`, color: '' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 pb-4">
      {cards.map(({ icon: Icon, label, value, color }) => (
        <Card key={label} className="bg-card/50 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Icon className={`w-3.5 h-3.5 ${color}`} /> {label}
            </div>
            <p className={`text-lg font-bold ${color || 'text-foreground'}`}>{value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
