import { AlertTriangle, CalendarDays, CheckCircle2, Loader, Timer, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WIP_LIMITS } from '@/hooks/tasks/workItem.types';
import type { KpiSnapshot } from '@/hooks/tasks/workItemAggregates';

/** Etapa 44: as 5 leituras do topo do módulo no padrão visual da casa
 *  (`ContactKpiCard`): card de 88px, tile de 44px com `bg-kpi-*`, ícone de 20px,
 *  valor 24/700 tabular e rótulo 13/500.
 *
 *  O valor fica em `text-2xl` (24px) e não nos 26px do plano: o guard-rail de
 *  tipografia do repo proíbe tamanho arbitrário acima de 16px (o teto é a
 *  escala) e o token mais próximo é justamente 24px — 2px do pedido. */

type Tile = 'blue' | 'green' | 'purple' | 'yellow' | 'destructive' | 'muted';

const TILES: Record<Tile, { bg: string; fg: string }> = {
  blue:        { bg: 'bg-kpi-blue',      fg: 'text-kpi-blue-fg'      },
  green:       { bg: 'bg-kpi-green',     fg: 'text-kpi-green-fg'     },
  purple:      { bg: 'bg-kpi-purple',    fg: 'text-kpi-purple-fg'    },
  yellow:      { bg: 'bg-kpi-yellow',    fg: 'text-kpi-yellow-fg'    },
  destructive: { bg: 'bg-destructive/15', fg: 'text-destructive'     },
  muted:       { bg: 'bg-muted',         fg: 'text-muted-foreground' },
};

interface KpiCardProps {
  label: string;
  value: string;
  tile: Tile;
  icon: LucideIcon;
}

function KpiCard({ label, value, tile, icon: Icon }: KpiCardProps) {
  const { bg, fg } = TILES[tile];
  return (
    <div
      data-testid="kpi-card"
      className="h-[88px] rounded-[14px] border border-border/70 bg-card px-3 flex items-center gap-3"
    >
      <div data-testid="kpi-tile" className={cn('h-11 w-11 rounded-xl flex items-center justify-center shrink-0', bg)}>
        <Icon className={cn('h-5 w-5', fg)} />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-muted-foreground truncate leading-tight">{label}</p>
        <p data-testid="kpi-value" className="text-2xl font-bold tabular-nums leading-none text-foreground">
          {value}
        </p>
      </div>
    </div>
  );
}

export function TasksKpiStrip({ kpis }: { kpis: KpiSnapshot }) {
  const wipHard = WIP_LIMITS.doing.hard ?? 0;

  return (
    <div data-testid="tasks-kpi-strip" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      <KpiCard
        label="Atrasadas"
        value={kpis.overdue.toLocaleString('pt-BR')}
        tile={kpis.overdue > 0 ? 'destructive' : 'yellow'}
        icon={AlertTriangle}
      />
      <KpiCard label="Para hoje" value={kpis.dueToday.toLocaleString('pt-BR')} tile="blue" icon={CalendarDays} />
      <KpiCard label="Fazendo" value={`${kpis.doingCount}/${wipHard}`} tile="purple" icon={Loader} />
      <KpiCard label="Concluídas (7d)" value={kpis.done7d.toLocaleString('pt-BR')} tile="green" icon={CheckCircle2} />
      <KpiCard
        label="Tempo médio"
        value={kpis.avgCycleTimeDays != null ? `${Math.round(kpis.avgCycleTimeDays)}d` : '—'}
        tile="muted"
        icon={Timer}
      />
    </div>
  );
}
