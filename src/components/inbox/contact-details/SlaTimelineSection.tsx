/**
 * Seção "Linha do tempo de SLA" do painel do contato.
 *
 * Mostra os marcos REAIS gravados (`conversation_sla` + transferências de
 * `conversation_events`), montados pelo hook `useContactSlaTimeline` — nenhum
 * marco é inferido de mensagem. O filtro de período/tipo é do cliente: trocar
 * de filtro não refaz a leitura.
 *
 * Só tokens do sistema. O TRAÇO do trilho pinta com os tons do kit
 * (`RAIL_TONE` -> `toneClasses` -> `text-success`/`text-warning`/
 * `text-destructive`, isto é `hsl(var(--success|--warning|--destructive))`, os
 * tokens de PREENCHIMENTO) sobre `--card`: contraste `5,66:1`/`7,70:1` (ok),
 * `2,14:1`/`9,96:1` (warning) e `3,78:1`/`5,89:1` (breached), claro/escuro. O
 * par de TEXTO (`--warning-text` `4,82:1`, `--destructive-text` `5,63:1` no
 * claro), publicado na etapa 80/E.3 porque o âmbar/vermelho de preenchimento
 * não fecha 4,5:1 como texto, fica no SELO (`STATUS_BADGE`), não no traço.
 * Marco sem prazo fica neutro.
 *
 * A linha vertical que liga os marcos é um `DrawLine` por TRECHO: a cor de
 * cada trecho é a SITUAÇÃO do marco logo acima dele (`ok`→`success`,
 * `warning`→`warning`, `breached`→`destructive`) e o trecho de marco sem prazo
 * é neutro (`--muted-foreground`, o mesmo token do marcador neutro).
 *
 * Movimento: os `DrawLine` desenham o traço e a entrada dos itens desloca no
 * máximo 40 ms por item; com `prefers-reduced-motion` os traços nascem prontos
 * e nenhum item se desloca (`initial={false}`, `data-motion="reduced"`).
 *
 * Teclado: o grupo de filtros por tipo usa roving tabindex (só um chip na ordem
 * do Tab; ←/→/↑/↓ andam, Home/End vão às pontas, Enter/Espaço alternam) e Esc
 * limpa os filtros quando há algum ativo — sem listener global, tudo no próprio
 * elemento com foco.
 */
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRightLeft, CheckCircle2, Clock, MessageCircle, Timer } from 'lucide-react';
import { DrawLine, ShimmerSkeleton, SlidingSegmented, type MotionTone } from '@/components/inbox/chat/motion';
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
 * `DrawLine` por trecho, e o jsdom (nem o svg) mede a lista — a altura tem que
 * vir daqui.
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

/** Chips do filtro por tipo: o "Tudo" (sem tipo) vem primeiro, depois um por tipo. */
const KIND_CHIPS: Array<{ kind: SlaMilestoneKind | null; testId: string; label: string }> = [
  { kind: null, testId: 'sla-kind-all', label: 'Tudo' },
  ...KIND_OPTIONS.map((option) => ({ kind: option.value, testId: `sla-kind-${option.value}`, label: option.label })),
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

/**
 * Cor de cada trecho da linha, pela situação do marco acima dele. `ok`,
 * `warning` e `breached` usam o par de estado do kit de movimento. O marco sem
 * prazo (`na`) é NEUTRO: o kit não tem tom neutro e está fora do escopo deste
 * cartão, então o trecho pinta com `--muted-foreground` (o mesmo token do
 * marcador neutro) sobrepondo o tom padrão do `DrawLine`.
 */
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
  const [period, setPeriod] = useState<SlaTimelinePeriod>('all');
  const [kinds, setKinds] = useState<Set<SlaMilestoneKind>>(() => new Set());
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [chipIndex, setChipIndex] = useState(0);

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

  const clearFilters = () => {
    setPeriod('all');
    setKinds(new Set());
  };

  const activeFilters = period !== 'all' || kinds.size > 0;
  const railHeight = milestones.length > 1 ? (milestones.length - 1) * ROW_H : 0;

  /** Seta/Home/End movem o foco entre os chips (roving tabindex no próprio grupo). */
  const onChipsKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const passo =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    const total = KIND_CHIPS.length;
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const destino = event.key === 'Home' ? 0 : total - 1;
      setChipIndex(destino);
      chipRefs.current[destino]?.focus();
      return;
    }
    if (!passo) return;
    event.preventDefault();
    const destino = (chipIndex + passo + total) % total;
    setChipIndex(destino);
    chipRefs.current[destino]?.focus();
  };

  /** Esc limpa os filtros quando há algum ativo; sem filtro, a tecla segue para o painel. */
  const onFiltersKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || !activeFilters) return;
    event.preventDefault();
    event.stopPropagation();
    clearFilters();
  };

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
        <div className="space-y-2" onKeyDown={onFiltersKeyDown}>
          <div className="space-y-2">
            <SlidingSegmented
              items={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
              ariaLabel="Filtrar por período"
              layoutId="sla-timeline-period"
              className="w-full [&>button]:min-h-10 [&>button]:flex-1 [&>button]:justify-center"
            />
            <div
              role="group"
              aria-label="Filtrar por tipo de marco"
              data-testid="sla-kind-group"
              onKeyDown={onChipsKeyDown}
              className="flex flex-wrap gap-1.5"
            >
              {KIND_CHIPS.map((chip, i) => {
                const ativo = chip.kind === null ? kinds.size === 0 : kinds.has(chip.kind);
                const alternar = () => {
                  setChipIndex(i);
                  if (chip.kind === null) setKinds(new Set());
                  else toggleKind(chip.kind);
                };
                return (
                  <button
                    key={chip.testId}
                    ref={(el) => {
                      chipRefs.current[i] = el;
                    }}
                    type="button"
                    data-testid={chip.testId}
                    aria-pressed={ativo}
                    tabIndex={i === chipIndex ? 0 : -1}
                    onClick={alternar}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                        event.preventDefault();
                        alternar();
                      }
                    }}
                    className={chipClasse(ativo)}
                  >
                    {chip.label}
                  </button>
                );
              })}
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
