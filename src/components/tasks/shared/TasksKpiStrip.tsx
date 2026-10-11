import { AlertTriangle, CalendarDays, CheckCircle2, Loader, Timer, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WIP_LIMITS } from '@/hooks/tasks/workItem.types';
import { formatLeadTime, type KpiSnapshot } from '@/hooks/tasks/workItemAggregates';

/** Etapa 44: as 5 leituras do topo do módulo no padrão visual da casa
 *  (`ContactKpiCard`): card de 88px, tile de 44px com `bg-kpi-*`, ícone de 20px,
 *  valor 24/700 tabular e rótulo 13/500.
 *
 *  O valor fica em `text-2xl` (24px) e não nos 26px do plano: o guard-rail de
 *  tipografia do repo proíbe tamanho arbitrário acima de 16px (o teto é a
 *  escala) e o token mais próximo é justamente 24px — 2px do pedido.
 *
 *  Etapas 017–020 e 022 (plano §3.1 linhas 41–45): cada card ganhou o
 *  SUBTÍTULO que a imagem 01 mostra e que muda com o estado (o desfecho é a
 *  primeira regra do §3.6 item 4 — a de "Limite atingido"/"Em andamento"):
 *    · 017 Atrasadas    — >0 vermelho + "Requer atenção"; 0 neutro + "Tudo em dia".
 *    · 018 Para hoje    — âmbar + "Vencem hoje"; 0 + "Nada vence hoje".
 *    · 019 Fazendo      — "n/3" com anel SVG do limite; "Em andamento" abaixo do
 *                         limite e "Limite atingido" (destrutivo) em 3/3 (§3.6
 *                         item 14: vale o vermelho das imagens 01/02, não o
 *                         cinza da 05).
 *    · 020 Concluídas   — "Concluídas · 7 dias" + "Últimos 7 dias", verde.
 *    · 022 Tempo médio  — relógio neutro + "Da criação à conclusão", usando
 *                         `avgLeadTimeDays` e `formatLeadTime` (D13, cartão T03).
 */

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
  subtitle: string;
  /** Tom do subtítulo. `destructive` só nos desfechos que pedem atenção. */
  subtitleTone?: 'muted' | 'destructive';
  tile: Tile;
  icon?: LucideIcon;
  /** No lugar do ícone: anel de progresso (etapa 019). */
  ring?: { value: number; max: number };
  /**
   * Valor em `text-xl` (20px) em vez de `text-2xl` (24px): o "1,4 dias" do
   * Tempo médio é o único texto com unidade e estoura os ~90px de coluna do
   * grid em 2 colunas (360px). As leituras continuam na escala do design system.
   */
  compactValue?: boolean;
}

/** Anel de progresso do limite de WIP — SVG estático (sem animação, portanto
 *  sem violar a regra de movimento). O valor "n/3" ao lado é quem informa. */
function ProgressRing({ value, max }: { value: number; max: number }) {
  const r = 18;
  const circunferencia = 2 * Math.PI * r;
  const fracao = max > 0 ? Math.min(Math.max(value, 0) / max, 1) : 0;

  return (
    <svg
      data-testid="kpi-ring"
      aria-hidden="true"
      viewBox="0 0 44 44"
      fill="none"
      className="h-8 w-8 -rotate-90"
    >
      <circle cx="22" cy="22" r={r} className="stroke-current opacity-25" strokeWidth="4" />
      <circle
        cx="22"
        cy="22"
        r={r}
        className="stroke-current"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={circunferencia}
        strokeDashoffset={circunferencia * (1 - fracao)}
      />
    </svg>
  );
}

function KpiCard({ label, value, subtitle, subtitleTone = 'muted', tile, icon: Icon, ring, compactValue }: KpiCardProps) {
  const { bg, fg } = TILES[tile];
  return (
    <div
      data-testid="kpi-card"
      className="h-[88px] rounded-[14px] border border-border/70 bg-card px-3 flex items-center gap-3"
    >
      <div data-testid="kpi-tile" className={cn('h-11 w-11 rounded-xl flex items-center justify-center shrink-0', bg, fg)}>
        {ring ? <ProgressRing value={ring.value} max={ring.max} /> : Icon ? <Icon className="h-5 w-5" /> : null}
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-muted-foreground truncate leading-tight">{label}</p>
        <p
          data-testid="kpi-value"
          className={cn(
            'font-bold tabular-nums leading-none text-foreground',
            compactValue ? 'text-xl' : 'text-2xl'
          )}
        >
          {value}
        </p>
        <p
          data-testid="kpi-subtitle"
          className={cn(
            'text-2xs leading-tight mt-0.5 truncate',
            subtitleTone === 'destructive' ? 'text-destructive' : 'text-muted-foreground/80'
          )}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}

export function TasksKpiStrip({ kpis }: { kpis: KpiSnapshot }) {
  const wipHard = WIP_LIMITS.doing.hard ?? 0;
  const atrasadas = kpis.overdue > 0;
  const noLimite = wipHard > 0 && kpis.doingCount >= wipHard;

  return (
    <div data-testid="tasks-kpi-strip" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      <KpiCard
        label="Atrasadas"
        value={kpis.overdue.toLocaleString('pt-BR')}
        subtitle={atrasadas ? 'Requer atenção' : 'Tudo em dia'}
        subtitleTone={atrasadas ? 'destructive' : 'muted'}
        tile={atrasadas ? 'destructive' : 'muted'}
        icon={AlertTriangle}
      />
      <KpiCard
        label="Para hoje"
        value={kpis.dueToday.toLocaleString('pt-BR')}
        subtitle={kpis.dueToday > 0 ? 'Vencem hoje' : 'Nada vence hoje'}
        tile="yellow"
        icon={CalendarDays}
      />
      <KpiCard
        label="Fazendo"
        value={`${kpis.doingCount}/${wipHard}`}
        subtitle={noLimite ? 'Limite atingido' : 'Em andamento'}
        subtitleTone={noLimite ? 'destructive' : 'muted'}
        tile="blue"
        icon={Loader}
        ring={{ value: kpis.doingCount, max: wipHard }}
      />
      <KpiCard
        label="Concluídas · 7 dias"
        value={kpis.done7d.toLocaleString('pt-BR')}
        subtitle="Últimos 7 dias"
        tile="green"
        icon={CheckCircle2}
      />
      <KpiCard
        label="Tempo médio"
        value={formatLeadTime(kpis.avgLeadTimeDays)}
        subtitle="Da criação à conclusão"
        tile="muted"
        icon={Timer}
        compactValue
      />
    </div>
  );
}
