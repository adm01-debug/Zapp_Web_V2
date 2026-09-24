/**
 * CRM360StatsCards — Summary metric cards for the CRM 360° Explorer
 */
import { memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users, ShoppingCart, DollarSign, TrendingUp, Building2, Phone,
  Mail, Share2, Truck, Package, BarChart3, Activity,
} from 'lucide-react';
import { useExternalSelect } from '@/hooks/integrations/useExternalDB';

interface StatCard {
  label: string;
  icon: React.ElementType;
  table: string;
  colorClass: string;
}

const STATS: StatCard[] = [
  { label: 'Clientes', icon: ShoppingCart, table: 'customers', colorClass: 'text-info' },
  { label: 'Scores RFM', icon: BarChart3, table: 'company_rfm_scores', colorClass: 'text-success' },
  { label: 'Vendas', icon: DollarSign, table: 'sales', colorClass: 'text-warning' },
  { label: 'Interações', icon: Activity, table: 'interactions', colorClass: 'text-accent' },
  { label: 'Fornecedores', icon: Package, table: 'suppliers', colorClass: 'text-warning' },
  { label: 'Transportadoras', icon: Truck, table: 'carriers', colorClass: 'text-info' },
];

function StatCardItem({ stat }: { stat: StatCard }) {
  const { data, isLoading } = useExternalSelect({
    table: stat.table,
    select: 'id',
    limit: 1,
    countMode: 'estimated',
    staleTime: 10 * 60 * 1000,
  });

  const Icon = stat.icon;
  const count = data?.meta?.record_count ?? 0;

  return (
    <Card className="border-border/50 hover:border-primary/30 transition-colors">
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-muted/30 ${stat.colorClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          {isLoading ? (
            <Skeleton className="h-5 w-12" />
          ) : (
            <p className="text-lg font-bold leading-none">
              {count > 1000 ? `${(count / 1000).toFixed(1)}k` : count.toLocaleString('pt-BR')}
            </p>
          )}
          <p className="text-3xs text-muted-foreground mt-0.5">{stat.label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export const CRM360StatsCards = memo(function CRM360StatsCards() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {STATS.map((stat) => (
        <StatCardItem key={stat.table} stat={stat} />
      ))}
    </div>
  );
});
