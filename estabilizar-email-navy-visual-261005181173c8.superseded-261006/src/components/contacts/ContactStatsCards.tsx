import { Users, UserPlus, Building2, Truck } from 'lucide-react';
import { useContactsKpi } from '@/hooks/crm/useContactsKpi';
import { ContactKpiCard } from './ContactKpiCard';

interface ContactStatsCardsProps {
  totalAll: number;
  fornecedoresAll: number;
  /** Mesmo estado do toggle "Mostrar legados" que alimenta lista e abas. */
  includeLegacy?: boolean;
}

export function ContactStatsCards({ totalAll, fornecedoresAll, includeLegacy = false }: ContactStatsCardsProps) {
  const { data: kpi, isLoading } = useContactsKpi(includeLegacy);

  if (isLoading || !kpi) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-[108px] rounded-[14px] border border-border/70 bg-card animate-shimmer" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
        series={kpi.seriesEmpresasCumulative12w}
        chart="line"
      />
      <ContactKpiCard
        label="Fornecedores"
        value={fornecedoresAll}
        deltaPct={kpi.deltaFornecedoresPct}
        tile="purple"
        icon={Truck}
        series={kpi.seriesFornecedoresWeekly12}
        chart="line"
      />
    </div>
  );
}
