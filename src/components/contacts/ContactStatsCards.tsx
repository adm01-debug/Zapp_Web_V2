import { Users, UserPlus, Building2, Zap } from 'lucide-react';
import { useContactsKpi } from '@/hooks/crm/useContactsKpi';
import { ContactKpiCard } from './ContactKpiCard';

interface ContactStatsCardsProps {
  totalAll: number;
  leadsAll: number;
}

export function ContactStatsCards({ totalAll, leadsAll }: ContactStatsCardsProps) {
  const { data: kpi, isLoading } = useContactsKpi(false);

  if (isLoading || !kpi) {
    return (
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-[84px] rounded-[14px] border border-border/70 bg-card animate-shimmer" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      <ContactKpiCard
        label="Total de Contatos"
        value={totalAll}
        deltaPct={kpi.deltaTotalPct}
        tile="blue"
        icon={Users}
        series={kpi.seriesTotalCumulative12w}
        chart="line"
      />
      <ContactKpiCard
        label="Novos (30 dias)"
        value={kpi.novos30}
        deltaPct={kpi.deltaNovosPct}
        tile="green"
        icon={UserPlus}
        series={kpi.seriesNovosDaily30}
        chart="bars"
      />
      <ContactKpiCard
        label="Empresas"
        value={kpi.empresasDistinct}
        deltaPct={null}
        tile="purple"
        icon={Building2}
        series={kpi.seriesEmpresasWeekly12}
        chart="line"
      />
      <ContactKpiCard
        label="Leads"
        value={leadsAll}
        deltaPct={kpi.deltaLeadsPct}
        tile="yellow"
        icon={Zap}
        series={kpi.seriesLeadsWeekly12}
        chart="line"
      />
    </div>
  );
}
