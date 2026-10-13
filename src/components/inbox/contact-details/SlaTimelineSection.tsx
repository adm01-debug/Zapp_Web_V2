/**
 * Seção "Linha do tempo de SLA" do painel do contato.
 *
 * Mostra os marcos REAIS gravados (`conversation_sla` + transferências de
 * `conversation_events`), montados pelo hook `useContactSlaTimeline` — nenhum
 * marco é inferido de mensagem. O filtro de período/tipo é do cliente: trocar
 * de filtro não refaz a leitura.
 *
 * Só tokens do sistema: cada situação pinta com o par de texto do estado
 * (`--success`; `--warning-text`/`--destructive-text`, que a etapa 80/E.3
 * publicou justamente porque o âmbar/vermelho de preenchimento não fecha
 * 4,5:1 como texto). Marco sem prazo fica neutro.
 *
 * Movimento: o `DrawLine` do kit desenha a linha vertical que liga os marcos e
 * a entrada dos itens desloca no máximo 40 ms por item; com
 * `prefers-reduced-motion` o traço nasce pronto e nenhum item se desloca.
 */
import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRightLeft, CheckCircle2, Clock, MessageCircle, Timer } from 'lucide-react';
import { DrawLine, ShimmerSkeleton, SlidingSegmented } from '@/components/inbox/chat/motion';
import { cn } from '@/lib/utils';
import { zappTransition } from '@/lib/motion';
import {
  SLA_STATUS_LABEL,
  formatSlaDuration,
  type SlaMilestone,
  type SlaMilestoneKind,
  type SlaTimelinePeriod,
  type SlaTimelineStatus,
} from '@/lib/slaTimeline';
import { contactSlaTimelineKey, useContactSlaTimeline } from '@/hooks/sla/useContactSlaTimeline';
import { SidebarSection } from './sidebar/SidebarSection';
import { SidebarEmpty } from './sidebar/SidebarEmpty';

interface SlaTimelineSectionProps {
  contactId: string;
  index: number;
}

/**
 * Altura fixa da linha do marco: a linha vertical é desenhada por um único
 * `DrawLine`, e o jsdom (nem o svg) mede a lista — a altura tem de vir daqui.
 */
const ROW_H = 56;
/** Centro do marcador, a partir do topo da lista (o marcador tem 10 px). */
const DOT_CENTER = 22;
/** Escalonamento da entrada dos marcos — teto de 40 ms por item (regra de movimento). */
const ITEM_STAGGER_S = 0.04;
/** Do 7º marco em diante a entrada é a mesma, senão a lista demora a ficar inteira. */
const STAGGER_CAP = 6;

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
};

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
  const [period, setPeriod] = useState<SlaTimelinePeriod>('all');
  const [kinds, setKinds] = useState<Set<SlaMilestoneKind>>(() => new Set());

  const filters = useMemo(
    () => ({
      period,
      kinds: kinds.size === 0 ? ('all' as const) : ([...kinds].sort() as SlaMilestoneKind[]),
    }),
    [period, kinds],
  );

  const { milestones, incomplete, limitsReady, loading } = useContactSlaTimeline(contactId, filters);

  /**
   * O hook devolve só marcos/incompleto/limitsReady/loading — sem o erro. Uma
   * falha de leitura chegaria aqui como lista vazia e a tela diria "sem marcos"
   * para um dado que não chegou. Leio o cache pela chave pública do hook
   * (prefixo: ele acrescenta os limites ao fim) só para separar falha de vazio.
   */
  const queryClient = useQueryClient();
  const readFailed = queryClient
    .getQueryCache()
    .findAll({ queryKey: contactSlaTimelineKey(contactId) })
    .some((query) => query.state.status === 'error');

  const toggleKind = (kind: SlaMilestoneKind) => {
    setKinds((previous) => {
      const next = new Set(previous);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const activeFilters = period !== 'all' || kinds.size > 0;
  const railHeight = milestones.length > 1 ? (milestones.length - 1) * ROW_H : 0;

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
        <div className="space-y-2">
          <div className="space-y-2">
            <SlidingSegmented
              items={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
              ariaLabel="Filtrar por período"
              layoutId="sla-timeline-period"
              className="w-full [&>button]:min-h-10 [&>button]:flex-1 [&>button]:justify-center"
            />
            <div role="group" aria-label="Filtrar por tipo de marco" className="flex flex-wrap gap-1.5">
              <button
                type="button"
                data-testid="sla-kind-all"
                aria-pressed={kinds.size === 0}
                onClick={() => setKinds(new Set())}
                className={cn(
                  'inline-flex min-h-10 items-center rounded-md border px-2 py-1 text-3xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  kinds.size === 0
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                )}
              >
                Tudo
              </button>
              {KIND_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  data-testid={`sla-kind-${option.value}`}
                  aria-pressed={kinds.has(option.value)}
                  onClick={() => toggleKind(option.value)}
                  className={cn(
                    'inline-flex min-h-10 items-center rounded-md border px-2 py-1 text-3xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    kinds.has(option.value)
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                  )}
                >
                  {option.label}
                </button>
              ))}
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
                  ? 'Nenhum marco no período e tipos escolhidos. Amplie o período ou volte para "Tudo".'
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
              {railHeight > 0 && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute"
                  style={{ left: 4, top: DOT_CENTER, height: railHeight }}
                >
                  <DrawLine
                    d={`M 1 0 L 1 ${railHeight}`}
                    length={railHeight}
                    width={2}
                    height={railHeight}
                    tone="primary"
                  />
                </span>
              )}
              {milestones.map((milestone, i) => (
                <motion.li
                  key={milestone.id}
                  data-testid={`sla-milestone-${milestone.id}`}
                  className="relative z-10 flex h-14 items-start gap-2.5"
                  initial={reduceMotion ? false : 'hidden'}
                  animate="visible"
                  variants={ITEM_VARIANTS}
                  transition={{
                    ...zappTransition.normal,
                    delay: reduceMotion ? 0 : Math.min(i, STAGGER_CAP) * ITEM_STAGGER_S,
                  }}
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
