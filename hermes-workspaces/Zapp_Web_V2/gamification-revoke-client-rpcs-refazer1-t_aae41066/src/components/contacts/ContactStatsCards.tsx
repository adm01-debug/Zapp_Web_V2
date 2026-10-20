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

  /**
   * "Total de Contatos" é o número-âncora da tela e o aceite da etapa 98 exige que
   * ele bata com o badge da aba "Todos" no MESMO snapshot (toggle ligado e
   * desligado). Por isso ele (a) lê `totalAll`, a MESMA fonte do badge
   * (`contacts_count_by_type`), e (b) NÃO espera o agregado pesado
   * (`useContactsKpi`, que pagina a tabela inteira) nem anima por CountUp — as
   * duas coisas faziam o card exibir 0 ou um valor intermediário enquanto o badge
   * já mostrava o total (a "divergência de 29" registrada em
   * docs/audits/PLANO_CONTATOS_100_ETAPAS_2026-09-29.md, etapa 98).
   */
  const totalCard = (
    <ContactKpiCard
      label="Total de Contatos"
      value={totalAll}
      deltaPct={kpi?.deltaTotalPct ?? null}
      tile="blue"
      icon={Users}
      series={kpi?.seriesTotalCumulative12w ?? []}
      chart="line"
      animateValue={false}
    />
  );

  // Enquanto só o agregado carrega, o Total (que vem de fora, junto do badge) já
  // está pronto: três esqueletos, não quatro.
  if (isLoading || !kpi) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {totalCard}
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-[108px] rounded-[14px] border border-border/70 bg-card animate-shimmer" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {totalCard}
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
