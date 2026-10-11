import { useEffect, useMemo, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import { AlertTriangle, CalendarDays, CheckCircle2, Loader, Timer, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { zappSpring } from '@/lib/motion';
import { WIP_LIMITS } from '@/hooks/tasks/workItem.types';
import { formatLeadTime, type KpiSnapshot } from '@/hooks/tasks/workItemAggregates';
import type { TasksDensity } from './tasksUi';

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
 *
 *  Chegaram aqui as etapas 023 e 025–028 (cartão T13, 11/10/2026):
 *    · 023 KPIs clicáveis — Atrasadas e Para hoje viram BOTÕES de recorte de
 *          prazo (`aria-pressed`, chip visível, clicar de novo remove); Fazendo
 *          leva ao Quadro, onde o limite de WIP se resolve. Quem escreve no
 *          filtro é o módulo (o card só publica `onToggleDue`/`onOpenBoard`).
 *    · 025 Faixa compacta — a variante da imagem 05 (5 leituras em uma linha com
 *          separadores, rótulo acima do valor) que o Quadro usa para ganhar
 *          altura. A densidade vem do MODO (D2), por prop — não é estado novo.
 *    · 026 Responsividade — 5 colunas a partir de 1280px, 3 em 768px e 2 em
 *          360px; a faixa compacta QUEBRA em 2 linhas (flex-wrap) em vez de
 *          estourar a página na horizontal.
 *    · 027 Esqueleto — `TasksKpiStripSkeleton`, com a MESMA grade e a mesma
 *          altura do card (sem salto de layout quando o dado chega) e brilho
 *          sutil que respeita `prefers-reduced-motion` (`motion-safe:animate-pulse`).
 *    · 028 Mola — o número conta até o valor com a mola do repo
 *          (`zappSpring.soft`, o token de "número que conta") e a região viva
 *          (`role="status"`) narra o valor FINAL a cada mudança. Com movimento
 *          reduzido nada anda: o valor entra no mesmo render. A mola é de
 *          NÚMERO em JS — nenhuma propriedade de layout anima (o valor já é
 *          `tabular-nums`), então não há salto de página.
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

/** Etapa 023: os únicos recortes de prazo que um KPI aplica. */
export type KpiDueRecorte = 'overdue' | 'today';

/** Formata os contadores inteiros (pt-BR, milhar) — identidade ESTÁVEL: é a
 *  dependência da mola e uma função nova por render reiniciaria a contagem. */
function formatarInteiro(n: number): string {
  return Math.round(n).toLocaleString('pt-BR');
}

/** Fallback da mola quando o card não tem número por trás (ex.: "—"). */
function formatarTexto(n: number): string {
  return formatarInteiro(n);
}

/**
 * Etapa 028: conta de `valor` até o alvo com a mola do repo e devolve o texto
 * do quadro atual. Regras que importam:
 *  - a PRIMEIRA passagem mostra o valor direto (o dado chegou pronto, via
 *    esqueleto) — a mola é para o que MUDA na tela, não para a carga;
 *  - sai do caminho com movimento reduzido: o valor entra no mesmo render;
 *  - o `onUpdate` escreve no estado (callback assíncrono da mola), nunca um
 *    `setState` síncrono dentro do efeito.
 */
function useContagemComMola(
  valor: number,
  formatar: (n: number) => string,
  animar: boolean
): string {
  const reduceMotion = useReducedMotion() ?? false;
  const [texto, setTexto] = useState(() => formatar(valor));
  const exibido = useRef(valor);
  const montou = useRef(false);

  useEffect(() => {
    if (!montou.current || !animar || reduceMotion) {
      montou.current = true;
      exibido.current = valor;
      return;
    }
    let vivo = true;
    const controles = animate(exibido.current, valor, {
      ...zappSpring.soft,
      onUpdate: (v: number) => {
        exibido.current = v;
        setTexto(formatar(v));
      },
    });
    // Fecha no valor EXATO: a mola pode parar no quadro anterior ao alvo e o
    // número na tela tem de bater com o do dado (o leitor de tela e o teste
    // leem o texto, não o quadro intermediário).
    void controles.then(() => {
      if (vivo) setTexto(formatar(valor));
    });
    return () => {
      vivo = false;
      controles.stop();
    };
  }, [valor, animar, reduceMotion, formatar]);

  return animar && !reduceMotion ? texto : formatar(valor);
}

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
  /** Etapa 025: densidade do MÓDULO (D2) — 'compact' é a faixa em linha. */
  density?: TasksDensity;
  /** Etapa 028: número por trás do texto; a mola conta até ele. */
  contagem?: { valor: number; formatar: (n: number) => string };
  /** Etapa 023: quando existe, o card vira botão que aplica/remove o recorte. */
  action?: { onClick: () => void; pressed: boolean; label: string; chip: string };
}

/** Anel de progresso do limite de WIP — SVG estático (sem animação, portanto
 *  sem violar a regra de movimento). O valor "n/3" ao lado é quem informa. */
function ProgressRing({ value, max, small = false }: { value: number; max: number; small?: boolean }) {
  const r = 18;
  const circunferencia = 2 * Math.PI * r;
  const fracao = max > 0 ? Math.min(Math.max(value, 0) / max, 1) : 0;

  return (
    <svg
      data-testid="kpi-ring"
      aria-hidden="true"
      viewBox="0 0 44 44"
      fill="none"
      className={small ? 'h-5 w-5 -rotate-90' : 'h-8 w-8 -rotate-90'}
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

function KpiCard({
  label,
  value,
  subtitle,
  subtitleTone = 'muted',
  tile,
  icon: Icon,
  ring,
  compactValue,
  density = 'comfortable',
  contagem,
  action,
}: KpiCardProps) {
  const { bg, fg } = TILES[tile];
  const compacta = density === 'compact';
  const contado = useContagemComMola(
    contagem?.valor ?? 0,
    contagem?.formatar ?? formatarTexto,
    contagem !== undefined
  );
  // O texto exibido só vem da mola quando há número por trás dele.
  const valorExibido = contagem ? contado : value;

  const chip = action?.pressed ? (
    <span
      aria-hidden="true"
      data-testid="kpi-chip"
      className="ml-1 inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-px text-2xs font-medium text-primary"
    >
      {action.chip}
      <X className="h-3 w-3" />
    </span>
  ) : null;

  const conteudo = (
    <>
      <div
        data-testid="kpi-tile"
        className={cn(
          'rounded-xl flex items-center justify-center shrink-0',
          compacta ? 'h-7 w-7' : 'h-11 w-11',
          bg,
          fg
        )}
      >
        {ring
          ? <ProgressRing value={ring.value} max={ring.max} small={compacta} />
          : Icon ? <Icon className={compacta ? 'h-4 w-4' : 'h-5 w-5'} /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'font-medium text-muted-foreground truncate leading-tight',
            compacta ? 'text-2xs' : 'text-[13px]'
          )}
        >
          {label}
          {chip}
        </p>
        <p
          data-testid="kpi-value"
          className={cn(
            'font-bold tabular-nums leading-none text-foreground',
            compacta ? 'text-lg' : compactValue ? 'text-xl' : 'text-2xl'
          )}
        >
          {valorExibido}
        </p>
        <p
          data-testid="kpi-subtitle"
          className={cn(
            'text-2xs leading-tight truncate',
            compacta ? 'mt-0' : 'mt-0.5',
            subtitleTone === 'destructive' ? 'text-destructive' : 'text-muted-foreground/80'
          )}
        >
          {subtitle}
        </p>
      </div>
    </>
  );

  return (
    <div
      data-testid="kpi-card"
      data-density={density}
      className={cn(
        'rounded-[14px] border border-border/70 bg-card flex items-center gap-3',
        compacta ? 'min-h-[44px] px-2' : 'h-[88px] px-3'
      )}
    >
      {action ? (
        <button
          type="button"
          data-testid="kpi-acao"
          onClick={action.onClick}
          aria-pressed={action.pressed}
          aria-label={action.label}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {conteudo}
        </button>
      ) : (
        conteudo
      )}
      {/* Etapa 028: a mudança do número é narrada — e quem narra é o valor
          FINAL, não o quadro da mola. Fora do botão para não entrar no nome. */}
      <span className="sr-only" role="status" aria-live="polite" data-testid="kpi-live">
        {`${label}: ${value}`}
      </span>
    </div>
  );
}

export interface TasksKpiStripProps {
  kpis: KpiSnapshot;
  /** Etapa 025: densidade da faixa (D2). No Quadro é 'compact'. */
  density?: TasksDensity;
  /** Etapa 023: recorte de prazo ativo — o KPI que o aplicou fica pressionado. */
  activeDue?: KpiDueRecorte | null;
  /** Etapa 023: aplica/remove o recorte de prazo. Sem ele o card não vira botão. */
  onToggleDue?: (due: KpiDueRecorte) => void;
  /** Etapa 023: 'Fazendo' leva ao Quadro. */
  onOpenBoard?: () => void;
}

export function TasksKpiStrip({
  kpis,
  density = 'comfortable',
  activeDue = null,
  onToggleDue,
  onOpenBoard,
}: TasksKpiStripProps) {
  const wipHard = WIP_LIMITS.doing.hard ?? 0;
  const atrasadas = kpis.overdue > 0;
  const noLimite = wipHard > 0 && kpis.doingCount >= wipHard;
  const compacta = density === 'compact';

  // Identidade estável (a mola reinicia quando a função de formatação muda).
  const formatarFazendo = useMemo(() => (n: number) => `${Math.round(n)}/${wipHard}`, [wipHard]);

  const cards = [
    <KpiCard
      key="atrasadas"
      label="Atrasadas"
      density={density}
      value={formatarInteiro(kpis.overdue)}
      contagem={{ valor: kpis.overdue, formatar: formatarInteiro }}
      subtitle={atrasadas ? 'Requer atenção' : 'Tudo em dia'}
      subtitleTone={atrasadas ? 'destructive' : 'muted'}
      tile={atrasadas ? 'destructive' : 'muted'}
      icon={AlertTriangle}
      action={onToggleDue && {
        onClick: () => onToggleDue('overdue'),
        pressed: activeDue === 'overdue',
        label: `Atrasadas: ${formatarInteiro(kpis.overdue)}. ${
          activeDue === 'overdue' ? 'Remover o filtro' : 'Mostrar só as atrasadas'
        }`,
        chip: 'Filtrando',
      }}
    />,
    <KpiCard
      key="hoje"
      label="Para hoje"
      density={density}
      value={formatarInteiro(kpis.dueToday)}
      contagem={{ valor: kpis.dueToday, formatar: formatarInteiro }}
      subtitle={kpis.dueToday > 0 ? 'Vencem hoje' : 'Nada vence hoje'}
      tile="yellow"
      icon={CalendarDays}
      action={onToggleDue && {
        onClick: () => onToggleDue('today'),
        pressed: activeDue === 'today',
        label: `Para hoje: ${formatarInteiro(kpis.dueToday)}. ${
          activeDue === 'today' ? 'Remover o filtro' : 'Mostrar só as que vencem hoje'
        }`,
        chip: 'Filtrando',
      }}
    />,
    <KpiCard
      key="fazendo"
      label="Fazendo"
      density={density}
      value={`${formatarInteiro(kpis.doingCount)}/${wipHard}`}
      contagem={{ valor: kpis.doingCount, formatar: formatarFazendo }}
      subtitle={noLimite ? 'Limite atingido' : 'Em andamento'}
      subtitleTone={noLimite ? 'destructive' : 'muted'}
      tile="blue"
      icon={Loader}
      ring={{ value: kpis.doingCount, max: wipHard }}
      action={onOpenBoard && {
        onClick: onOpenBoard,
        pressed: false,
        label: `Fazendo: ${formatarInteiro(kpis.doingCount)} de ${wipHard}. Abrir o Quadro`,
        chip: '',
      }}
    />,
    <KpiCard
      key="concluidas"
      label="Concluídas · 7 dias"
      density={density}
      value={formatarInteiro(kpis.done7d)}
      contagem={{ valor: kpis.done7d, formatar: formatarInteiro }}
      subtitle="Últimos 7 dias"
      tile="green"
      icon={CheckCircle2}
    />,
    <KpiCard
      key="tempo-medio"
      label="Tempo médio"
      density={density}
      // A mola fica de fora: o texto do Tempo médio é da `formatLeadTime`
      // (D13) — singular/plural e o travessão do "sem dado" não cabem numa
      // contagem de decimais.
      value={formatLeadTime(kpis.avgLeadTimeDays)}
      subtitle="Da criação à conclusão"
      tile="muted"
      icon={Timer}
      compactValue
    />,
  ];

  if (compacta) {
    // Etapa 025/026: uma linha com separadores e QUEBRA em 2 linhas nas telas
    // estreitas — sem rolagem horizontal em 360/768/1280px.
    return (
      <div
        data-testid="tasks-kpi-strip"
        data-density="compact"
        className="flex flex-wrap items-stretch rounded-[14px] border border-border/70 bg-card px-1"
      >
        {cards.map((card, i) => (
          <div
            key={card.key}
            className={cn('flex min-w-[104px] flex-1 px-2 py-1.5', i > 0 && 'border-l border-border/70')}
          >
            {card}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div data-testid="tasks-kpi-strip" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      {cards}
    </div>
  );
}

/**
 * Etapa 027: esqueleto dos KPIs enquanto o dado não chega. Ele repete a MESMA
 * geometria da faixa real (grade, `gap` e altura dos cards), então nada pula
 * quando o valor entra; o brilho é o `animate-pulse` do Tailwind atrás de
 * `motion-safe:`, que já se desliga em `prefers-reduced-motion`.
 */
export function TasksKpiStripSkeleton({ density = 'comfortable' }: { density?: TasksDensity }) {
  const caixas = [0, 1, 2, 3, 4];

  if (density === 'compact') {
    return (
      <div
        data-testid="tasks-kpi-strip-skeleton"
        data-density="compact"
        role="status"
        aria-busy="true"
        className="flex flex-wrap items-stretch rounded-[14px] border border-border/70 bg-card px-1"
      >
        {caixas.map(i => (
          <div
            key={i}
            className={cn('flex min-w-[104px] flex-1 flex-col justify-center gap-1 px-2 py-2', i > 0 && 'border-l border-border/70')}
          >
            <div className="h-3 w-16 rounded bg-muted motion-safe:animate-pulse" />
            <div className="h-4 w-10 rounded bg-muted motion-safe:animate-pulse" />
          </div>
        ))}
        <span className="sr-only">Carregando os indicadores de Tarefas…</span>
      </div>
    );
  }

  return (
    <div
      data-testid="tasks-kpi-strip-skeleton"
      role="status"
      aria-busy="true"
      className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3"
    >
      {caixas.map(i => (
        <div
          key={i}
          data-testid="kpi-skeleton-card"
          className="h-[88px] rounded-[14px] border border-border/70 bg-card px-3 flex items-center gap-3"
        >
          <div className="h-11 w-11 shrink-0 rounded-xl bg-muted motion-safe:animate-pulse" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3 w-16 rounded bg-muted motion-safe:animate-pulse" />
            <div className="h-6 w-10 rounded bg-muted motion-safe:animate-pulse" />
            <div className="h-3 w-20 rounded bg-muted motion-safe:animate-pulse" />
          </div>
        </div>
      ))}
      <span className="sr-only">Carregando os indicadores de Tarefas…</span>
    </div>
  );
}
