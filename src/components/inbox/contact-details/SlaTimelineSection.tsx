/**
 * Seção "Linha do tempo de SLA" do painel do contato.
 *
 * Mostra os marcos REAIS gravados (`conversation_sla` + transferências de
 * `conversation_events`), montados pelo hook `useContactSlaTimeline` — nenhum
 * marco é inferido de mensagem. O filtro é do cliente: trocar de filtro não
 * refaz a leitura.
 *
 * Filtros: período (24h/7d/30d/tudo), tipo de marco e SITUAÇÃO (no prazo, em
 * risco, estourado, sem prazo). O atalho de um clique "Só em risco/estourado"
 * liga as duas situações de risco de uma vez — e o mesmo clique desliga. A
 * seleção é lembrada entre aberturas do painel (só preferência de tela, no
 * `localStorage` do aparelho; ver `slaTimelineFilterState`).
 *
 * Só tokens do sistema: cada situação pinta com o par de texto do estado
 * (`--success`; `--warning-text`/`--destructive-text`, publicados na etapa
 * 80/E.3 porque o âmbar/vermelho de preenchimento não fecha 4,5:1 como texto).
 *
 * Movimento: com `prefers-reduced-motion` os traços nascem prontos e nenhum
 * item se desloca (`initial={false}`, `data-motion="reduced"`).
 */
import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRightLeft, CheckCircle2, Clock, MessageCircle, Timer } from 'lucide-react';
import { DrawLine, ShimmerSkeleton, SlidingSegmented, type MotionTone } from '@/components/inbox/chat/motion';
import { cn } from '@/lib/utils';
import { zappTransition } from '@/lib/motion';
import {
  SLA_STATUS_LABEL,
  filterSlaMilestones,
  formatSlaDuration,
  type SlaMilestone,
  type SlaMilestoneKind,
  type SlaTimelinePeriod,
  type SlaTimelineStatus,
} from '@/lib/slaTimeline';
import { contactSlaTimelineKey, useContactSlaTimeline } from '@/hooks/sla/useContactSlaTimeline';
import { SidebarSection } from './sidebar/SidebarSection';
import { SidebarEmpty } from './sidebar/SidebarEmpty';
import {
  defaultSlaTimelineFilters,
  isRiskOnlyFilter,
  loadSlaTimelineFilters,
  saveSlaTimelineFilters,
  toSlaTimelineFilters,
  toggleRiskOnlyFilter,
  type SlaTimelineFilterSelection,
} from './slaTimelineFilterState';

interface SlaTimelineSectionProps {
  contactId: string;
  index: number;
}

/**
 * Altura fixa da linha do marco: a linha vertical é um único `DrawLine` por
 * trecho, e o jsdom (nem o svg) mede a lista — a altura tem que vir daqui.
 */
const ROW_H = 56;
/** Centro do marcador, a partir do topo da lista (o marcador tem 10 px). */
const DOT_CENTER = 22;

const PERIOD_OPTIONS: Array<{ value: SlaTimelinePeriod; label: string }> = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'all', label: 'Tudo' },
];

const KIND_OPTIONS: Array<{ value: SlaMilestoneKind; label: string }> = [
  { value: 'opened', label: 'Abertura' },
  { value: 'first_response', label: '1ª resp.' },
  { value: 'resolution', label: 'Resolução' },
  { value: 'transfer', label: 'Transf.' },
];

const KIND_LABEL: Record<SlaMilestoneKind, string> = {
  opened: 'Conversa aberta',
  first_response: '1ª resposta',
  resolution: 'Resolução',
  transfer: 'Transferência',
  closed_no_response: 'Encerrada sem resposta',
};

/** Rótulo do chip de situação: aqui `na` é "Sem prazo", não o travessão do selo. */
const STATUS_CHIP_LABEL: Record<SlaTimelineStatus, string> = {
  ok: 'No prazo',
  warning: 'Em risco',
  breached: 'Estourado',
  na: 'Sem prazo',
};

const STATUS_OPTIONS: Array<{ value: SlaTimelineStatus; label: string }> = (
  ['ok', 'warning', 'breached', 'na'] as const
).map((value) => ({ value, label: STATUS_CHIP_LABEL[value] }));

const STATUS_BADGE: Record<SlaTimelineStatus, string> = {
  ok: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-[hsl(var(--warning-text))]',
  breached: 'bg-destructive/15 text-[hsl(var(--destructive-text))]',
  na: '',
};

const DOT_CLASSES: Record<SlaTimelineStatus, string> = {
  ok: 'bg-success',
  warning: 'bg-warning',
  breached: 'bg-destructive',
  na: 'bg-muted-foreground/50',
};

/** Cor de cada trecho da linha, pela situação do marco acima dele. */
const RAIL_TONE: Record<SlaTimelineStatus, MotionTone> = {
  ok: 'success',
  warning: 'warning',
  breached: 'destructive',
  na: 'primary',
};
const RAIL_NEUTRAL_CLASS = '[&>path]:!text-muted-foreground';

const DT_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0 },
};

function kindIcon(kind: SlaMilestoneKind) {
  switch (kind) {
    case 'first_response':
      return <MessageCircle />;
    case 'resolution':
      return <CheckCircle2 />;
    case 'transfer':
      return <ArrowRightLeft />;
    default:
      return <Clock />;
  }
}

function shortDateTime(iso: string): string {
  const at = new Date(iso);
  return Number.isFinite(at.getTime()) ? DT_FORMAT.format(at) : '—';
}

/** Linha de apoio: duração consumida contra o prazo; sem desfecho, o prazo; sem nada, o instante. */
function detailLine(milestone: SlaMilestone): string {
  if (milestone.durationMs !== null && milestone.limitMinutes !== null) {
    return `${formatSlaDuration(milestone.durationMs)} de ${milestone.limitMinutes}min`;
  }
  if (milestone.deadlineAt) return `prazo ${shortDateTime(milestone.deadlineAt)}`;
  return shortDateTime(milestone.at);
}

export function SlaTimelineSection({ contactId, index }: SlaTimelineSectionProps) {
  const reduceMotion = useReducedMotion() ?? false;
  // Nasce da preferência salva: reabrir o painel devolve o último filtro do usuário.
  const [selection, setSelection] = useState<SlaTimelineFilterSelection>(loadSlaTimelineFilters);

  useEffect(() => {
    saveSlaTimelineFilters(selection);
  }, [selection]);

  const filters = useMemo(() => toSlaTimelineFilters(selection), [selection]);

  const { milestones: scopedMilestones, incomplete, limitsReady, loading } = useContactSlaTimeline(
    contactId,
    filters,
  );

  /**
   * O hook `useContactSlaTimeline` hoje repassa ao filtro puro só período e tipo.
   * A situação é aplicada aqui para o atalho "Só em risco/estourado" valer já
   * nesta entrega (é idempotente quando o hook passar a repassar `statuses`).
   */
  const milestones = useMemo(
    () => filterSlaMilestones(scopedMilestones, { statuses: filters.statuses }),
    [scopedMilestones, filters.statuses],
  );

  /**
   * O hook devolve só marcos/incompleto/limitsReady/loading — sem o erro. Uma
   * falha de leitura chegaria aqui como lista vazia e a tela diria "sem marcos"
   * para um dado que não chegou. Leio o cache pela chave pública do hook só
   * para separar falha de vazio.
   */
  const queryClient = useQueryClient();
  const readFailed = queryClient
    .getQueryCache()
    .findAll({ queryKey: contactSlaTimelineKey(contactId) })
    .some((query) => query.state.status === 'error');

  const toggleKind = (kind: SlaMilestoneKind) =>
    setSelection((previous) => ({
      ...previous,
      kinds: previous.kinds.includes(kind)
        ? previous.kinds.filter((k) => k !== kind)
        : [...previous.kinds, kind],
    }));

  const toggleStatus = (status: SlaTimelineStatus) =>
    setSelection((previous) => ({
      ...previous,
      statuses: previous.statuses.includes(status)
        ? previous.statuses.filter((s) => s !== status)
        : [...previous.statuses, status],
    }));

  const clearFilters = () => setSelection(defaultSlaTimelineFilters());

  const activeFilters =
    selection.period !== 'all' || selection.kinds.length > 0 || selection.statuses.length > 0;
  const riskOnly = isRiskOnlyFilter(selection);
  const railHeight = milestones.length > 1 ? (milestones.length - 1) * ROW_H : 0;

  const chipClasse = (ativo: boolean) =>
    cn(
      'inline-flex min-h-10 items-center rounded-md border px-2 py-1 text-3xs font-medium transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      ativo
        ? 'border-primary/40 bg-primary/10 text-primary'
        : 'border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground',
    );

  return (
    <SidebarSection
      index={index}
      value="sla-timeline"
      tone="blue"
      icon={<Timer />}
      title="Linha do tempo de SLA"
      subtitle="Prazos e marcos do atendimento"
    >
      {loading ? (
        <div data-testid="sla-timeline-loading" className="space-y-2">
          {[0, 1, 2].map((i) => (
            <ShimmerSkeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : readFailed || !limitsReady ? (
        <SidebarEmpty
          cause={readFailed ? 'sla-timeline-erro' : 'sla-timeline-sem-prazo'}
          icon={<Clock />}
          message={
            readFailed
              ? 'Não consegui ler a linha do tempo agora. A lista não está vazia — ela está indisponível.'
              : 'Não foi possível carregar o prazo de SLA deste contato. Tente reabrir o painel.'
          }
        />
      ) : (
        <div className="space-y-2" data-testid="sla-filters">
          <div className="space-y-2">
            <SlidingSegmented
              items={PERIOD_OPTIONS}
              value={selection.period}
              onChange={(period) => setSelection((previous) => ({ ...previous, period }))}
              ariaLabel="Filtrar por período"
              layoutId="sla-timeline-period"
              className="w-full [&>button]:min-h-10 [&>button]:flex-1 [&>button]:justify-center"
            />

            <div role="group" aria-label="Filtrar por tipo de marco" data-testid="sla-kind-group" className="flex flex-wrap gap-1.5">
              <button
                type="button"
                data-testid="sla-kind-all"
                aria-pressed={selection.kinds.length === 0}
                onClick={() => setSelection((previous) => ({ ...previous, kinds: [] }))}
                className={chipClasse(selection.kinds.length === 0)}
              >
                Tudo
              </button>
              {KIND_OPTIONS.map((option) => {
                const ativo = selection.kinds.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    data-testid={`sla-kind-${option.value}`}
                    aria-pressed={ativo}
                    onClick={() => toggleKind(option.value)}
                    className={chipClasse(ativo)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div role="group" aria-label="Filtrar por situação" data-testid="sla-status-group" className="flex flex-wrap gap-1.5">
              <button
                type="button"
                data-testid="sla-status-all"
                aria-pressed={selection.statuses.length === 0}
                onClick={() => setSelection((previous) => ({ ...previous, statuses: [] }))}
                className={chipClasse(selection.statuses.length === 0)}
              >
                Todas
              </button>
              {STATUS_OPTIONS.map((option) => {
                const ativo = selection.statuses.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    data-testid={`sla-status-chip-${option.value}`}
                    aria-pressed={ativo}
                    onClick={() => toggleStatus(option.value)}
                    className={chipClasse(ativo)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-1.5">
              <button
                type="button"
                data-testid="sla-risk-shortcut"
                aria-pressed={riskOnly}
                onClick={() => setSelection(toggleRiskOnlyFilter)}
                className={cn(
                  'inline-flex min-h-10 items-center rounded-md border px-2 py-1 text-3xs font-semibold transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  riskOnly
                    ? 'border-destructive/40 bg-destructive/10 text-[hsl(var(--destructive-text))]'
                    : 'border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                )}
              >
                Só em risco/estourado
              </button>
              {activeFilters && (
                <button
                  type="button"
                  data-testid="sla-clear-filters"
                  onClick={clearFilters}
                  className="inline-flex min-h-10 items-center rounded-md px-2 py-1 text-3xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          </div>

          {incomplete && (
            <p data-testid="sla-timeline-incomplete" className="flex items-center gap-1.5 text-3xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
              Leitura parcial: a lista pode estar incompleta.
            </p>
          )}

          {milestones.length === 0 ? (
            <SidebarEmpty
              cause="sla-timeline-vazio"
              icon={<Timer />}
              message={
                activeFilters
                  ? 'Nenhum marco nos filtros escolhidos. Amplie o período, os tipos ou as situações.'
                  : 'Sem marcos de SLA para este contato. Eles aparecem quando houver resposta, resolução ou transferência.'
              }
            />
          ) : (
            <ul
              data-testid="sla-timeline-list"
              aria-label="Marcos de SLA"
              className="relative m-0 list-none p-0"
              style={{ height: milestones.length * ROW_H }}
            >
              {railHeight > 0 &&
                milestones.slice(0, -1).map((milestone, i) => (
                  <span
                    key={milestone.id}
                    aria-hidden="true"
                    data-testid={`sla-rail-${milestone.id}`}
                    data-status={milestone.status}
                    data-motion={reduceMotion ? 'reduced' : 'full'}
                    className="pointer-events-none absolute"
                    style={{ left: 4, top: DOT_CENTER + i * ROW_H, height: ROW_H }}
                  >
                    <DrawLine
                      d={`M 1 0 L 1 ${ROW_H}`}
                      length={ROW_H}
                      width={2}
                      height={ROW_H}
                      tone={RAIL_TONE[milestone.status]}
                      className={milestone.status === 'na' ? RAIL_NEUTRAL_CLASS : undefined}
                    />
                  </span>
                ))}
              {milestones.map((milestone, i) => (
                <motion.li
                  key={milestone.id}
                  data-testid={`sla-milestone-${milestone.id}`}
                  data-motion={reduceMotion ? 'reduced' : 'full'}
                  className="relative z-10 flex h-14 items-start gap-2.5"
                  initial={reduceMotion ? false : 'hidden'}
                  animate="visible"
                  variants={ITEM_VARIANTS}
                  transition={{ ...zappTransition.normal, delay: reduceMotion ? 0 : Math.min(i, 6) * 0.04 }}
                >
                  <span
                    aria-hidden="true"
                    data-testid={`sla-dot-${milestone.id}`}
                    className={cn('mt-[17px] h-2.5 w-2.5 shrink-0 rounded-full', DOT_CLASSES[milestone.status])}
                  />
                  <div className="min-w-0 flex-1 pt-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="inline-flex shrink-0 text-muted-foreground [&>svg]:h-3 [&>svg]:w-3" aria-hidden="true">
                        {kindIcon(milestone.kind)}
                      </span>
                      <span className="truncate text-xs font-medium text-foreground">{KIND_LABEL[milestone.kind]}</span>
                      {milestone.status !== 'na' && (
                        <span
                          data-testid={`sla-status-${milestone.id}`}
                          className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-3xs font-semibold', STATUS_BADGE[milestone.status])}
                        >
                          {SLA_STATUS_LABEL[milestone.status]}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-3xs text-muted-foreground">{`${shortDateTime(milestone.at)} · ${detailLine(milestone)}`}</div>
                  </div>
                </motion.li>
              ))}
            </ul>
          )}
        </div>
      )}
    </SidebarSection>
  );
}
