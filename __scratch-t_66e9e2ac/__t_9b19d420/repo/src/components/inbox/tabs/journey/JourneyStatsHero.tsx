/**
 * JourneyStatsHero — faixa única de "Estatísticas do contato" da aba Journey (Histórico).
 *
 * Etapa S084 do PLANO_JOURNEY_HISTORICO_COMPLETO_100_ETAPAS (decisões D09 e D12):
 * substitui as duas faixas antigas (`ContactStatsStrip` + `KpiStrip`) por UMA área, com o
 * bloco "Do contato" (independe do período) e o bloco "No período" (com tendência contra o
 * período anterior), gráfico de linha próprio (SVG, sem biblioteca), distribuição por
 * categoria, ranking de quem atendeu e horário/dia mais ativo.
 *
 * Componente de APRESENTAÇÃO: não consulta banco nem Supabase e não guarda dado —
 * recebe tudo por props (o cálculo vive em `src/lib/journey/stats.ts`, outro cartão).
 * Ainda não é importado por ninguém: as ondas seguintes ligam o componente na aba.
 *
 * Efeitos (D12 — sutis, sempre desligados em `prefers-reduced-motion: reduce`):
 * - entrada em fade + deslize de 8 px escalonada (60 ms por cartão, teto de 8 cartões);
 * - número que "conta" de 0 até o valor (requestAnimationFrame, 600 ms, sem biblioteca);
 * - traço do gráfico se desenhando (stroke-dashoffset);
 * - barras da distribuição que crescem; esqueleto com shimmer na carga.
 * Cada efeito é CSS/Tailwind com `motion-safe:` (o global de `accessibility.css` já zera
 * animação/transição em movimento reduzido) ou JS que lê o mesmo `matchMedia`.
 * Nenhuma cor literal nova: só os tokens do projeto (`primary`, `success`, `warning`,
 * `info`, `muted`, `dash-violet`). Nenhum arquivo de tema/config foi tocado.
 */
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  CalendarDays,
  CheckSquare,
  Clock,
  FileText,
  Headphones,
  Mail,
  MessageSquare,
  Phone,
  Star,
  StickyNote,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Props (o chamador passa tudo já calculado e já formatado em pt-BR)
// ─────────────────────────────────────────────────────────────────────────────

export interface JourneyStatsHeroContact {
  /** Total de mensagens trocadas com o contato (todo o histórico). */
  messages: number;
  sent: number;
  received: number;
  calls: number;
  emails: number;
  /** Instante (ISO ou rótulo) do primeiro contato. */
  since: string | null;
  /** Instante (ISO ou rótulo) do último contato. */
  last: string | null;
  /** Rótulo pronto do último contato ("há 2 dias"). */
  lastLabel: string;
  /** Tempo médio de resposta já formatado ("12min", "1h30m" ou "—"). */
  avgResponseLabel: string;
  /** Atendimentos/episódios respondidos. */
  episodes: number;
  csat: { average: number | null; count: number };
}

export interface JourneyStatsHeroPeriod {
  /** Rótulo do período resolvido ("Últimos 30 dias"). */
  label: string;
  total: number;
  /** Tendência do total contra o período anterior (%), `null` = sem base de comparação. */
  totalTrendPct: number | null;
  lastContactLabel: string;
  avgResponseLabel: string;
  /** Tendência do tempo de resposta: MENOR é melhor (a seta é invertida). */
  avgResponseTrendPct: number | null;
  resolutions: number;
  calls: { total: number; answered: number; missed: number; talkLabel: string };
  emails: { sent: number; received: number; unanswered: number };
  tasks: { open: number; done: number; overdue: number };
  notes: number;
  files: number;
  deals: { count: number; valueLabel: string };
}

export interface JourneyStatsHeroSeriesPoint {
  date: string;
  count: number;
}

export interface JourneyStatsHeroDistributionSlice {
  key: string;
  label: string;
  count: number;
  /** Classe de cor da barra — vem de quem usa (não existe paleta aqui). */
  barClass: string;
  /** Classe de cor do ponto da legenda — vem de quem usa. */
  dotClass: string;
}

export interface JourneyStatsHeroRankingEntry {
  id: string;
  name: string;
  avatarUrl: string | null;
  count: number;
  pct: number;
}

export interface JourneyStatsHeroPeak {
  hourLabel: string;
  weekdayLabel: string;
}

export interface JourneyStatsHeroProps {
  loading: boolean;
  contact: JourneyStatsHeroContact;
  period: JourneyStatsHeroPeriod;
  series: JourneyStatsHeroSeriesPoint[];
  distribution: JourneyStatsHeroDistributionSlice[];
  ranking: JourneyStatsHeroRankingEntry[];
  peak: JourneyStatsHeroPeak | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Movimento reduzido + contagem animada
// ─────────────────────────────────────────────────────────────────────────────

const CONSULTA_MOVIMENTO_REDUZIDO = '(prefers-reduced-motion: reduce)';
const DURACAO_CONTAGEM_MS = 600;
/** Teto de cartões com entrada escalonada (D12) e o passo entre eles. */
const MAX_ESCALONADOS = 8;
const PASSO_ESCALONADO_MS = 60;

function movimentoReduzidoAgora(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(CONSULTA_MOVIMENTO_REDUZIDO).matches
  );
}

/**
 * Leitura VIVA de `prefers-reduced-motion` (mesmo padrão de `tasks/shared/pointerMedia`):
 * assina o `matchMedia` e reprocessa quando a preferência muda — sem estado local e sem
 * efeito escrevendo estado. Fora do browser vale `false`.
 */
function usePrefersReducedMotion(): boolean {
  const assinar = useCallback((aoMudar: () => void) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
    const mq = window.matchMedia(CONSULTA_MOVIMENTO_REDUZIDO);
    mq.addEventListener?.('change', aoMudar);
    return () => mq.removeEventListener?.('change', aoMudar);
  }, []);

  return useSyncExternalStore(assinar, movimentoReduzidoAgora, () => false);
}

/**
 * Número que "conta" de 0 até `alvo` em 600 ms (requestAnimationFrame, sem biblioteca).
 * Com movimento reduzido devolve o alvo na hora — nenhum quadro é agendado.
 */
function useContagemAnimada(alvo: number, animar: boolean): number {
  const [visivel, setVisivel] = useState(animar ? 0 : alvo);

  useEffect(() => {
    if (!animar) return;
    let quadro = 0;
    const inicio = performance.now();
    const passo = (agora: number) => {
      const progresso = Math.min(1, (agora - inicio) / DURACAO_CONTAGEM_MS);
      setVisivel(Math.round(alvo * progresso));
      if (progresso < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [alvo, animar]);

  return animar ? visivel : alvo;
}

/** `true` depois do primeiro quadro pintado — é o gatilho das transições de entrada. */
function usePrimeiroQuadro(): boolean {
  const [pintou, setPintou] = useState(false);
  useEffect(() => {
    let segundo = 0;
    const primeiro = requestAnimationFrame(() => {
      segundo = requestAnimationFrame(() => setPintou(true));
    });
    return () => {
      cancelAnimationFrame(primeiro);
      cancelAnimationFrame(segundo);
    };
  }, []);
  return pintou;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatação (pt-BR, sem dependência de fuso)
// ─────────────────────────────────────────────────────────────────────────────

/** `2024-03-05` / `2024-03-05T…` → `05/03/2024`. Outro texto já pronto volta como veio. */
function rotuloDeData(valor: string | null): string {
  if (!valor) return '—';
  const partes = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(valor);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : valor;
}

function iniciais(nome: string): string {
  const letras = nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((pedaco) => pedaco[0] ?? '')
    .join('');
  return letras ? letras.toLocaleUpperCase('pt-BR') : '?';
}

function numero(valor: number): string {
  return valor.toLocaleString('pt-BR');
}

/** Sinal explícito (+/−) além da cor: a cor nunca é o único sinal da tendência. */
function textoDaTendencia(pct: number | null): { rotulo: string; bom: boolean; plano: boolean; pct: number } | null {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return null;
  if (pct === 0) return { rotulo: '0%', bom: false, plano: true, pct };
  const subiu = pct > 0;
  return {
    rotulo: `${subiu ? '+' : '\u2212'}${Math.abs(pct)}%`,
    bom: subiu,
    plano: false,
    pct,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Peças
// ─────────────────────────────────────────────────────────────────────────────

interface TrendBadgeProps {
  pct: number | null;
  /** Em tempo de resposta, cair é MELHOR: a leitura de "bom" se inverte. */
  menorEhMelhor?: boolean;
  testId: string;
}

function TrendBadge({ pct, menorEhMelhor = false, testId }: TrendBadgeProps) {
  const tendencia = textoDaTendencia(pct);
  if (!tendencia) return null;

  const bom = menorEhMelhor ? !tendencia.bom : tendencia.bom;
  const descricao = tendencia.plano
    ? 'sem mudança'
    : `${tendencia.bom ? 'aumento' : 'queda'} de ${Math.abs(tendencia.pct)}%`;

  return (
    <span
      data-testid={testId}
      className={cn(
        'inline-flex items-center gap-0.5 text-2xs font-medium tabular-nums',
        tendencia.plano ? 'text-muted-foreground' : bom ? 'text-success' : 'text-destructive',
      )}
    >
      {!tendencia.plano &&
        (tendencia.bom ? (
          <TrendingUp aria-hidden="true" className="h-3 w-3" />
        ) : (
          <TrendingDown aria-hidden="true" className="h-3 w-3" />
        ))}
      <span aria-hidden="true">{tendencia.rotulo}</span>
      {/* A cor nunca é o único sinal: a seta e o sinal (+/−) aparecem, e o texto abaixo
          entrega a leitura para quem usa leitor de tela. */}
      <span className="sr-only">{`Tendência: ${descricao}`}</span>
    </span>
  );
}

function CountUp({ valor, animar, testId }: { valor: number; animar: boolean; testId: string }) {
  const visivel = useContagemAnimada(valor, animar);
  return (
    <span data-testid={testId} className="tabular-nums">
      {numero(visivel)}
    </span>
  );
}

interface StatCardProps {
  index: number;
  icon: LucideIcon;
  /** Cor do círculo do ícone — token do projeto, nunca cor literal. */
  iconClass: string;
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
  sublabel?: React.ReactNode;
  trend?: { pct: number | null; menorEhMelhor?: boolean };
  ariaLabel: string;
  testId: string;
}

/**
 * Movimento reduzido visto pelos cartões. Quem lê o `matchMedia` é o `JourneyStatsHero`
 * (uma assinatura para a árvore inteira); os cartões consomem daqui em vez de repetir a
 * leitura 17 vezes. Com movimento reduzido o cartão nem monta a classe de entrada.
 */
const MovimentoReduzidoContext = createContext(false);

function StatCard({
  index,
  icon: Icon,
  iconClass,
  label,
  value,
  valueClassName,
  sublabel,
  trend,
  ariaLabel,
  testId,
}: StatCardProps) {
  const reduzirMovimento = useContext(MovimentoReduzidoContext);
  const escalonado = reduzirMovimento ? 0 : Math.min(index, MAX_ESCALONADOS - 1) * PASSO_ESCALONADO_MS;

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-testid={testId}
      style={escalonado ? { animationDelay: `${escalonado}ms` } : undefined}
      className={cn(
        'group/card flex flex-col gap-1.5 rounded-xl border border-border/60 bg-card p-3',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        // D12: elevação leve + brilho de borda no hover, afundar ao pressionar (200 ms).
        'motion-safe:transition-[transform,box-shadow,border-color] motion-safe:duration-200',
        'motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md motion-safe:hover:border-primary/40',
        'motion-safe:active:scale-[0.99]',
        // D12: entrada em fade + deslize de 8 px, escalonada. O `motion-safe:` já desliga
        // isso no CSS; a flag do matchMedia evita ATÉ montar a classe quando o usuário
        // pede movimento reduzido.
        !reduzirMovimento &&
          'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-backwards',
      )}
    >
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', iconClass)}>
          <Icon className="h-4 w-4" />
        </span>
        {/* Sem `truncate`/`line-clamp`: o rótulo quebra linha em vez de virar "respos…". */}
        <p data-testid={`${testId}-label`} className="min-w-0 break-words text-xs leading-snug text-muted-foreground">
          {label}
        </p>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span className={cn('break-words font-semibold tabular-nums text-foreground', valueClassName ?? 'text-xl')}>
          {value}
        </span>
        {trend && <TrendBadge pct={trend.pct} menorEhMelhor={trend.menorEhMelhor} testId={`${testId}-trend`} />}
      </div>

      {sublabel && (
        <p data-testid={`${testId}-sublabel`} className="break-words text-2xs leading-snug text-muted-foreground">
          {sublabel}
        </p>
      )}
    </div>
  );
}

const SERIE_LARGURA = 320;
const SERIE_ALTURA = 64;
const SERIE_MARGEM = 6;

interface PontoDaSerie {
  x: number;
  y: number;
  date: string;
  count: number;
}

function geometriaDaSerie(serie: JourneyStatsHeroSeriesPoint[]): { pontos: PontoDaSerie[]; comprimento: number; maximo: number } {
  const maximo = Math.max(1, ...serie.map((ponto) => ponto.count));
  const passo = serie.length > 1 ? SERIE_LARGURA / (serie.length - 1) : 0;
  const pontos: PontoDaSerie[] = serie.map((ponto, i) => ({
    date: ponto.date,
    count: ponto.count,
    x: serie.length > 1 ? i * passo : SERIE_LARGURA / 2,
    y: SERIE_MARGEM + (SERIE_ALTURA - SERIE_MARGEM * 2) * (1 - ponto.count / maximo),
  }));
  const comprimento = pontos.reduce(
    (soma, ponto, i) => (i === 0 ? 0 : soma + Math.hypot(ponto.x - pontos[i - 1].x, ponto.y - pontos[i - 1].y)),
    0,
  );
  return { pontos, comprimento: Number(comprimento.toFixed(2)), maximo };
}

function SerieDiaria({ serie, reduzirMovimento }: { serie: JourneyStatsHeroSeriesPoint[]; reduzirMovimento: boolean }) {
  const pintou = usePrimeiroQuadro();
  const { pontos, comprimento, maximo } = geometriaDaSerie(serie);
  const total = serie.reduce((soma, ponto) => soma + ponto.count, 0);
  const desenhado = reduzirMovimento || pintou;

  const resumo =
    serie.length === 0
      ? 'Série diária: sem dados no período.'
      : `Série diária: ${serie.length} ${serie.length === 1 ? 'dia' : 'dias'}, de ${serie[0].date} a ${serie[serie.length - 1].date}, ${total} interações no total, máximo de ${maximo} em um dia.`;

  return (
    <figure
      data-testid="journey-stats-hero-series"
      className="flex flex-col gap-1.5 rounded-xl border border-border/60 bg-card p-3"
    >
      <figcaption className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
        Interações por dia
      </figcaption>

      {serie.length === 0 ? (
        <div role="img" aria-label={resumo} className="text-xs text-muted-foreground">
          Sem dados no período.
        </div>
      ) : (
        <svg
          role="img"
          aria-label={resumo}
          className="h-16 w-full"
          viewBox={`0 0 ${SERIE_LARGURA} ${SERIE_ALTURA}`}
          preserveAspectRatio="none"
        >
          {serie.length > 1 && (
            <polyline
              data-testid="journey-stats-hero-series-line"
              fill="none"
              className="stroke-primary"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              points={pontos.map((ponto) => `${ponto.x.toFixed(2)},${ponto.y.toFixed(2)}`).join(' ')}
              style={{
                strokeDasharray: comprimento,
                strokeDashoffset: desenhado ? 0 : comprimento,
                transition: reduzirMovimento ? undefined : 'stroke-dashoffset 600ms ease-out',
              }}
            />
          )}
          {serie.length === 1 && (
            <circle cx={pontos[0].x} cy={pontos[0].y} r={2.5} className="fill-primary" />
          )}
        </svg>
      )}
    </figure>
  );
}

function Distribuicao({
  distribution,
  reduzirMovimento,
}: {
  distribution: JourneyStatsHeroDistributionSlice[];
  reduzirMovimento: boolean;
}) {
  const total = distribution.reduce((soma, fatia) => soma + fatia.count, 0);
  const resumo =
    total === 0
      ? 'Distribuição no período: sem dados.'
      : `Distribuição no período: ${distribution
          .filter((fatia) => fatia.count > 0)
          .map((fatia) => `${fatia.label} ${fatia.count}`)
          .join(', ')}.`;

  return (
    <div
      data-testid="journey-stats-hero-distribution"
      className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-3"
    >
      <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Distribuição por categoria</p>

      <div role="img" aria-label={resumo} className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {total > 0 &&
          distribution
            .filter((fatia) => fatia.count > 0)
            .map((fatia) => (
              <div
                key={fatia.key}
                data-testid={`journey-stats-hero-distribution-${fatia.key}`}
                className={cn(
                  'h-full origin-left',
                  fatia.barClass,
                  reduzirMovimento ? null : 'motion-safe:animate-in motion-safe:zoom-in-0 motion-safe:duration-500',
                )}
                style={{ width: `${(fatia.count / total) * 100}%` }}
              />
            ))}
      </div>

      {total === 0 ? (
        <p className="text-xs text-muted-foreground">Sem dados no período.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {distribution.map((fatia) => (
            <li key={fatia.key} data-testid={`journey-stats-hero-legend-${fatia.key}`} className="flex items-center gap-2">
              <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', fatia.dotClass)} />
              <span className="min-w-0 break-words text-xs text-muted-foreground">{fatia.label}</span>
              <span className="ml-auto shrink-0 text-xs font-medium tabular-nums text-foreground">{numero(fatia.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Ranking({ ranking }: { ranking: JourneyStatsHeroRankingEntry[] }) {
  const topo = ranking.slice(0, 3);

  return (
    <div
      data-testid="journey-stats-hero-ranking"
      className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-3"
    >
      <p className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
        <Users aria-hidden="true" className="h-3.5 w-3.5" />
        Quem atendeu
      </p>

      {topo.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem atendimentos no período.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {topo.map((pessoa, i) => (
            <li
              key={pessoa.id}
              data-testid={`journey-stats-hero-ranking-${pessoa.id}`}
              aria-label={`${i + 1}º lugar: ${pessoa.name}, ${pessoa.count} atendimentos, ${pessoa.pct}% do total`}
              className="flex items-center gap-2"
            >
              {pessoa.avatarUrl ? (
                <img
                  src={pessoa.avatarUrl}
                  alt=""
                  className="h-7 w-7 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-2xs font-semibold text-primary"
                >
                  {iniciais(pessoa.name)}
                </span>
              )}
              <span className="min-w-0 break-words text-xs text-foreground">{pessoa.name}</span>
              <span className="ml-auto shrink-0 text-2xs tabular-nums text-muted-foreground">{pessoa.pct}%</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Esqueleto da carga: shimmer (mesmo `Skeleton` do design system) em 2/4 colunas. */
function JourneyStatsHeroSkeleton() {
  return (
    <div
      data-testid="journey-stats-hero-loading"
      role="status"
      aria-label="Carregando estatísticas do contato"
      className="grid grid-cols-2 gap-2.5 md:grid-cols-4"
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-14" />
        </div>
      ))}
      <span className="sr-only">Carregando estatísticas do contato…</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────────────────────

export function JourneyStatsHero({
  loading,
  contact,
  period,
  series,
  distribution,
  ranking,
  peak,
}: JourneyStatsHeroProps) {
  const reduzirMovimento = usePrefersReducedMotion();
  const animar = !reduzirMovimento;

  if (loading) return <JourneyStatsHeroSkeleton />;

  const semAvaliacao = contact.csat.average === null;
  const notaCsat = semAvaliacao
    ? '—'
    : contact.csat.average!.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const estrelasCheias = semAvaliacao ? 0 : Math.round(contact.csat.average!);
  const desde = rotuloDeData(contact.since);
  const ultimo = rotuloDeData(contact.last);

  return (
    <MovimentoReduzidoContext.Provider value={reduzirMovimento}>
    <section data-testid="journey-stats-hero" aria-label="Estatísticas do contato" className="space-y-3">
      {/* ── Bloco 1: do contato (independe do período) ─────────────────────── */}
      <div className="space-y-2">
        <h3 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Do contato</h3>
        <div data-testid="journey-stats-hero-contact-grid" className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <StatCard
            index={0}
            testId="journey-stat-mensagens"
            icon={MessageSquare}
            iconClass="bg-primary/15 text-primary"
            label="Mensagens"
            value={<CountUp valor={contact.messages} animar={animar} testId="journey-stat-mensagens-value" />}
            sublabel={`${numero(contact.sent)} enviadas · ${numero(contact.received)} recebidas`}
            ariaLabel={`Mensagens: ${numero(contact.messages)} no total, ${numero(contact.sent)} enviadas e ${numero(contact.received)} recebidas`}
          />
          <StatCard
            index={1}
            testId="journey-stat-ligacoes"
            icon={Phone}
            iconClass="bg-success/15 text-success"
            label="Ligações"
            value={<CountUp valor={contact.calls} animar={animar} testId="journey-stat-ligacoes-value" />}
            sublabel="Chamadas no histórico"
            ariaLabel={`Ligações: ${numero(contact.calls)} no histórico do contato`}
          />
          <StatCard
            index={2}
            testId="journey-stat-emails"
            icon={Mail}
            iconClass="bg-info/15 text-info"
            label="E-mails"
            value={<CountUp valor={contact.emails} animar={animar} testId="journey-stat-emails-value" />}
            sublabel="Enviados e recebidos"
            ariaLabel={`E-mails: ${numero(contact.emails)} trocados com o contato`}
          />
          <StatCard
            index={3}
            testId="journey-stat-atendimentos"
            icon={Headphones}
            iconClass="bg-dash-violet/15 text-dash-violet"
            label="Atendimentos"
            value={<CountUp valor={contact.episodes} animar={animar} testId="journey-stat-atendimentos-value" />}
            sublabel="Episódios respondidos"
            ariaLabel={`Atendimentos: ${numero(contact.episodes)} episódios respondidos`}
          />
          <StatCard
            index={4}
            testId="journey-stat-tempo-resposta"
            icon={Clock}
            iconClass="bg-warning/15 text-warning"
            label="Tempo médio de resposta"
            value={contact.avgResponseLabel}
            sublabel="Média do contato"
            ariaLabel={`Tempo médio de resposta do contato: ${contact.avgResponseLabel}`}
          />
          <StatCard
            index={5}
            testId="journey-stat-csat"
            icon={Star}
            iconClass="bg-warning/15 text-warning"
            label="CSAT"
            value={
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="inline-flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={cn(
                        'h-3.5 w-3.5',
                        i < estrelasCheias ? 'fill-warning text-warning' : 'text-muted-foreground/40',
                      )}
                    />
                  ))}
                </span>
                <span className="tabular-nums">{notaCsat}</span>
              </span>
            }
            valueClassName="text-base"
            sublabel={contact.csat.count > 0 ? `${numero(contact.csat.count)} avaliações` : 'Sem avaliações'}
            ariaLabel={
              semAvaliacao
                ? 'CSAT: sem avaliações'
                : `CSAT: média ${notaCsat} de 5 em ${numero(contact.csat.count)} avaliações`
            }
          />
          <StatCard
            index={6}
            testId="journey-stat-desde"
            icon={CalendarDays}
            iconClass="bg-info/15 text-info"
            label="Cliente desde / último contato"
            value={desde}
            valueClassName="text-base"
            sublabel={`Último contato: ${ultimo} · ${contact.lastLabel}`}
            ariaLabel={`Cliente desde ${desde}; último contato em ${ultimo}`}
          />
        </div>
      </div>

      {/* ── Bloco 2: no período (com tendência) ────────────────────────────── */}
      <div className="space-y-2">
        <h3 className="flex flex-wrap items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          No período
          <span
            data-testid="journey-stats-hero-period-label"
            className="rounded-full bg-muted px-2 py-0.5 text-2xs font-medium normal-case tracking-normal text-muted-foreground"
          >
            {period.label}
          </span>
        </h3>
        <div data-testid="journey-stats-hero-period-grid" className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <StatCard
            index={7}
            testId="journey-stat-total"
            icon={BarChart3}
            iconClass="bg-primary/15 text-primary"
            label="Total de interações"
            value={<CountUp valor={period.total} animar={animar} testId="journey-stat-total-value" />}
            trend={{ pct: period.totalTrendPct }}
            sublabel={`Contra o período anterior · ${period.label}`}
            ariaLabel={`Total de interações no período ${period.label}: ${numero(period.total)}`}
          />
          <StatCard
            index={8}
            testId="journey-stat-ultimo-contato"
            icon={CalendarDays}
            iconClass="bg-info/15 text-info"
            label="Último contato"
            value={period.lastContactLabel}
            valueClassName="text-base"
            ariaLabel={`Último contato no período: ${period.lastContactLabel}`}
          />
          <StatCard
            index={9}
            testId="journey-stat-tempo-periodo"
            icon={Clock}
            iconClass="bg-warning/15 text-warning"
            label="Tempo médio de resposta"
            value={period.avgResponseLabel}
            trend={{ pct: period.avgResponseTrendPct, menorEhMelhor: true }}
            sublabel="Menor é melhor"
            ariaLabel={`Tempo médio de resposta no período ${period.label}: ${period.avgResponseLabel}`}
          />
          <StatCard
            index={10}
            testId="journey-stat-resolucoes"
            icon={CheckSquare}
            iconClass="bg-success/15 text-success"
            label="Resoluções"
            value={<CountUp valor={period.resolutions} animar={animar} testId="journey-stat-resolucoes-value" />}
            sublabel="Episódios encerrados"
            ariaLabel={`Resoluções no período ${period.label}: ${numero(period.resolutions)}`}
          />
        </div>
      </div>

      {/* ── Bloco 3: detalhe do período ────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
        <StatCard
          index={11}
          testId="journey-stat-ligacoes-periodo"
          icon={Phone}
          iconClass="bg-success/15 text-success"
          label="Ligações no período"
          value={<CountUp valor={period.calls.total} animar={animar} testId="journey-stat-ligacoes-periodo-value" />}
          sublabel={`${numero(period.calls.answered)} atendidas · ${numero(period.calls.missed)} perdidas · ${period.calls.talkLabel} falados`}
          ariaLabel={`Ligações no período: ${numero(period.calls.total)}, ${numero(period.calls.answered)} atendidas, ${numero(period.calls.missed)} perdidas, ${period.calls.talkLabel} falados`}
        />
        <StatCard
          index={12}
          testId="journey-stat-emails-periodo"
          icon={Mail}
          iconClass="bg-info/15 text-info"
          label="E-mails no período"
          value={<CountUp valor={period.emails.sent + period.emails.received} animar={animar} testId="journey-stat-emails-periodo-value" />}
          sublabel={`${numero(period.emails.sent)} enviados · ${numero(period.emails.received)} recebidos · ${numero(period.emails.unanswered)} sem resposta`}
          ariaLabel={`E-mails no período: ${numero(period.emails.sent)} enviados, ${numero(period.emails.received)} recebidos, ${numero(period.emails.unanswered)} sem resposta`}
        />
        <StatCard
          index={13}
          testId="journey-stat-tarefas-periodo"
          icon={CheckSquare}
          iconClass="bg-warning/15 text-warning"
          label="Tarefas no período"
          value={<CountUp valor={period.tasks.open + period.tasks.done} animar={animar} testId="journey-stat-tarefas-periodo-value" />}
          sublabel={`${numero(period.tasks.open)} abertas · ${numero(period.tasks.done)} concluídas · ${numero(period.tasks.overdue)} atrasadas`}
          ariaLabel={`Tarefas no período: ${numero(period.tasks.open)} abertas, ${numero(period.tasks.done)} concluídas, ${numero(period.tasks.overdue)} atrasadas`}
        />
        <StatCard
          index={14}
          testId="journey-stat-notas-periodo"
          icon={StickyNote}
          iconClass="bg-dash-violet/15 text-dash-violet"
          label="Notas no período"
          value={<CountUp valor={period.notes} animar={animar} testId="journey-stat-notas-periodo-value" />}
          ariaLabel={`Notas no período: ${numero(period.notes)}`}
        />
        <StatCard
          index={15}
          testId="journey-stat-arquivos-periodo"
          icon={FileText}
          iconClass="bg-muted-foreground/15 text-muted-foreground"
          label="Arquivos no período"
          value={<CountUp valor={period.files} animar={animar} testId="journey-stat-arquivos-periodo-value" />}
          ariaLabel={`Arquivos no período: ${numero(period.files)}`}
        />
        <StatCard
          index={16}
          testId="journey-stat-propostas-periodo"
          icon={TrendingUp}
          iconClass="bg-success/15 text-success"
          label="Propostas no período"
          value={<CountUp valor={period.deals.count} animar={animar} testId="journey-stat-propostas-periodo-value" />}
          sublabel={period.deals.valueLabel}
          ariaLabel={`Propostas no período: ${numero(period.deals.count)}, ${period.deals.valueLabel}`}
        />
      </div>

      {/* ── Gráfico, distribuição, ranking e pico ──────────────────────────── */}
      <SerieDiaria serie={series} reduzirMovimento={reduzirMovimento} />

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        <Distribuicao distribution={distribution} reduzirMovimento={reduzirMovimento} />
        <Ranking ranking={ranking} />
      </div>

      {peak && (
        <div
          data-testid="journey-stats-hero-peak"
          role="group"
          aria-label={`Horário mais ativo: ${peak.hourLabel}; dia mais ativo: ${peak.weekdayLabel}`}
          className="flex items-center gap-2 rounded-xl border border-border/60 bg-card p-3"
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
          >
            <CalendarDays className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-2xs uppercase tracking-wider text-muted-foreground">Horário/dia mais ativo</p>
            <p className="break-words text-sm font-medium text-foreground">
              {peak.hourLabel} · {peak.weekdayLabel}
            </p>
          </div>
        </div>
      )}

    </section>
    </MovimentoReduzidoContext.Provider>
  );
}
