import { Users, UserPlus, Building2, Truck, Copy } from 'lucide-react';
import { useContactsKpi } from '@/hooks/crm/useContactsKpi';
import { ContactKpiCard } from './ContactKpiCard';

interface ContactStatsCardsProps {
  totalAll: number;
  fornecedoresAll: number;
  /** Mesmo estado do toggle "Mostrar legados" que alimenta lista e abas. */
  includeLegacy?: boolean;
  /**
   * Filtra a lista para os possíveis duplicados (a detecção é do CT-083).
   * Opcional: sem ele o indicador mostra o número sem ser clicável.
   */
  onDuplicatesClick?: () => void;
}

/**
 * Indicador de possíveis duplicados (`kpi.duplicateCandidates`): botão quando
 * há filtro para aplicar, texto estático quando o chamador não passa
 * `onDuplicatesClick`.
 */
function DuplicatesIndicator({ count, onClick }: { count: number; onClick?: () => void }) {
  const cls =
    'mt-3 w-full rounded-[14px] border border-border/70 bg-card px-4 py-2.5 flex items-center gap-3 text-left';
  const content = (
    <>
      <Copy className="w-[18px] h-[18px] text-muted-foreground shrink-0" aria-hidden />
      <span data-testid="kpi-duplicates-value" className="text-kpi-value font-bold tabular-nums leading-none text-foreground">
        {count.toLocaleString('pt-BR')}
      </span>
      <span className="text-sm font-medium text-muted-foreground leading-tight">Possíveis duplicados</span>
    </>
  );
  if (!onClick) {
    return (
      <div data-testid="kpi-duplicates" className={cls}>
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      data-testid="kpi-duplicates"
      aria-label={`Filtrar lista: ${count.toLocaleString('pt-BR')} possíveis duplicados`}
      onClick={onClick}
      className={cls}
    >
      {content}
    </button>
  );
}

export function ContactStatsCards({ totalAll, fornecedoresAll, includeLegacy = false, onDuplicatesClick }: ContactStatsCardsProps) {
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
    <div>
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
      <DuplicatesIndicator count={kpi.duplicateCandidates} onClick={onDuplicatesClick} />
    </div>
  );
}
