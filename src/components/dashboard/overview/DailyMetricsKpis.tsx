import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowDownLeft, ArrowUpRight, UserPlus, MessagesSquare, CheckCircle2, Timer } from 'lucide-react';
import { DashboardKpiCard, type KpiDelta } from './DashboardKpiCard';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DAILY_KPIS_DEFAULT_DAYS,
  useDailyMetricsKpis,
  type DailyMetricRow,
} from '@/hooks/dashboard/useDailyMetricsKpis';
import { formatShortDuration } from './formatShortDuration';
import { lastDayVariationPct } from './dailyMetricsKpisMath';

/**
 * DASHBOARD-03 (PB-22) — faixa de KPIs dos últimos 7 dias na Visão Geral.
 *
 * Lê a série diária de `useDailyMetricsKpis` (RPC dashboard_daily_series, que
 * preenche com 0 os dias sem movimento e ordena por dia civil de São Paulo).
 * Cada cartão mostra:
 *   - valor: TOTAL do período (soma dos dias que a RPC devolveu);
 *   - variação: último dia do período contra o dia anterior (`vs. dia anterior`),
 *     em %; sem dia anterior ou base 0 a variação é omitida (nunca inventa %);
 *   - mini-série: um ponto por dia do período, na ordem dos dias.
 * O rodapé da faixa diz exatamente isso, para o número do topo não ser lido como
 * se fosse "hoje" (os KPIs de hoje já estão na faixa acima).
 *
 * Só staff: o hook já não dispara a consulta sem o papel confirmado; aqui a faixa
 * nem entra na árvore para quem não é admin/supervisor.
 */

type TileColor = 'blue' | 'red' | 'green' | 'violet' | 'amber';

interface MetricDef {
  key: string;
  label: string;
  icon: LucideIcon;
  tile: TileColor;
  /** Extrai o número do dia; `null` quando o dia não tem amostra (ex.: mediana de SLA). */
  pick: (row: DailyMetricRow) => number | null;
  /** Mediana de tempo é apresentada em duração; as demais em contagem. */
  format: 'count' | 'duration';
}

const COUNT_METRICS: MetricDef[] = [
  { key: 'received', label: 'Recebidas', icon: ArrowDownLeft, tile: 'blue', pick: (r) => r.messages_received, format: 'count' },
  { key: 'sent', label: 'Enviadas', icon: ArrowUpRight, tile: 'violet', pick: (r) => r.messages_sent, format: 'count' },
  { key: 'new_contacts', label: 'Novos contatos', icon: UserPlus, tile: 'amber', pick: (r) => r.new_contacts, format: 'count' },
  { key: 'opened', label: 'Conversas abertas', icon: MessagesSquare, tile: 'blue', pick: (r) => r.conversations_opened, format: 'count' },
  { key: 'resolved', label: 'Resolvidas', icon: CheckCircle2, tile: 'green', pick: (r) => r.conversations_resolved, format: 'count' },
];

/** Cartão extra: mediana de 1ª resposta. Não tem variação % (comparar duas
 * medianas de amostras diferentes engana) — mostra o último dia com amostra e a
 * mini-série dos dias que têm amostra. */
const RESPONSE_METRIC: MetricDef = {
  key: 'response',
  label: 'Tempo de resposta',
  icon: Timer,
  tile: 'violet',
  pick: (r) => r.median_response_time_seconds,
  format: 'duration',
};

function formatValue(value: number, format: MetricDef['format']): string {
  return format === 'duration' ? formatShortDuration(value) : value.toLocaleString('pt-BR');
}

interface MetricCard {
  def: MetricDef;
  value: number;
  bars: number[] | null;
  delta: KpiDelta;
}

function buildCards(rows: DailyMetricRow[]): MetricCard[] {
  return [...COUNT_METRICS, RESPONSE_METRIC].map((def) => {
    const series = rows.map(def.pick);
    // Dias sem amostra (mediana null) ficam fora da mini-série: virar 0 puxaria
    // a barra mínima e mentiria sobre o dia.
    const bars = series.filter((v): v is number => v != null);

    if (def.format === 'duration') {
      const latest = bars.length > 0 ? bars[bars.length - 1] : null;
      return {
        def,
        value: latest ?? 0,
        bars: bars.length >= 2 ? bars : null,
        delta: null,
      };
    }

    const total = series.reduce<number>((acc, v) => acc + (v ?? 0), 0);
    const pct = lastDayVariationPct(rows, def.pick);
    return { def, value: total, bars, delta: pct == null ? null : { pct, label: 'vs. dia anterior' } };
  });
}

interface DailyMetricsKpisProps {
  /** Período em dias (a RPC aceita [1, 90]); padrão 7, como no título da faixa. */
  days?: number;
}

export function DailyMetricsKpis({ days = DAILY_KPIS_DEFAULT_DAYS }: DailyMetricsKpisProps) {
  const { data, isLoading, isError, isStaff } = useDailyMetricsKpis(days);
  const rows = useMemo(() => data ?? [], [data]);
  const cards = useMemo(() => buildCards(rows), [rows]);

  // Quem não é staff não vê a faixa (espelha o `enabled` do hook: nada de 42501
  // na cara de um agente).
  if (isStaff !== true) return null;

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5" data-testid="daily-kpis-skeleton">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[95px] w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className="rounded-xl bg-card border border-border/70 p-4 text-center"
        data-testid="daily-kpis-error"
      >
        <p className="text-sm font-medium text-foreground">Não foi possível carregar os KPIs dos últimos {days} dias.</p>
        <p className="text-2xs text-muted-foreground mt-1">Tente atualizar o painel em instantes.</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        className="rounded-xl bg-card border border-border/70 p-4 flex flex-col items-center gap-1 text-center"
        data-testid="daily-kpis-empty"
      >
        <Timer className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Sem métricas diárias nos últimos {days} dias.</p>
        <p className="text-2xs text-muted-foreground">Quando houver movimento, os números aparecem aqui.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5" data-testid="daily-metrics-kpis">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        {cards.map((card, i) => (
          <DashboardKpiCard
            key={card.def.key}
            index={i}
            testid={`daily-kpi-${card.def.key}`}
            label={card.def.label}
            value={card.def.format === 'duration' && card.value === 0 ? '—' : formatValue(card.value, card.def.format)}
            delta={card.delta}
            tile={card.def.tile}
            icon={card.def.icon}
            bars={card.bars}
            barsColor={card.def.tile}
          />
        ))}
      </div>
      <p className="text-2xs text-muted-foreground" data-testid="daily-kpis-caption">
        Totais dos últimos {days} dias · variação do último dia contra o anterior
      </p>
    </div>
  );
}
