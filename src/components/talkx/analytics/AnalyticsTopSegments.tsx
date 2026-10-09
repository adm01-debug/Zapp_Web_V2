import { useMemo, useState } from 'react';
import { ArrowRight, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import type { TalkXSegment } from '@/hooks/integrations/useTalkXSegments';
import { IconTile, fmtInt } from '../talkxShared';

/**
 * X187 — Top segmentos.
 *
 * Antes o recorte por segmento existia só como o texto de um KPI ("Envio por
 * segmento" com 3 nomes) e não havia cartão próprio. Aqui o segmento ganha
 * cartão com métrica escolhida pelo usuário, barra, percentual e volume; a
 * sub-visão cheia (a que o TalkXView guarda em `?sub=segmentos`) mostra a lista
 * completa em vez do topo com "Outros".
 *
 * A taxa de conversão ainda não tem fonte no produto: nem `talkx_campaigns` nem
 * `talkx_campaign_metrics` têm coluna de conversão (grep por `converted_count` =
 * 0). Nessa métrica a linha fica sem número — "sem dados ainda" — em vez de
 * virar 0%, que afirmaria um resultado que ninguém mediu.
 */

export type SegmentMetric = 'resposta' | 'entrega' | 'conversao';
export type SegmentView = 'resumo' | 'segmentos';

const SEGMENT_METRICS: { value: SegmentMetric; label: string }[] = [
  { value: 'resposta', label: 'Taxa de resposta' },
  { value: 'entrega', label: 'Taxa de entrega' },
  { value: 'conversao', label: 'Conversão' },
];

/** Linhas do resumo antes de agrupar o resto em "Outros". */
const TOP_SEGMENTS_LIMIT = 7;

export interface SegmentAggregate {
  id: string;
  name: string;
  sent: number;
  delivered: number;
  replied: number;
  /** Percentual (0–100) da métrica escolhida; `null` quando a métrica não tem fonte. */
  value: number | null;
}

interface SegmentTotals { sent: number; delivered: number; replied: number }

function metricValue(totals: SegmentTotals, metric: SegmentMetric): number | null {
  if (metric === 'conversao' || totals.sent <= 0) return null;
  const num = metric === 'resposta' ? totals.replied : totals.delivered;
  return Math.round((num / totals.sent) * 1000) / 10;
}

/**
 * Agrega as campanhas do período por segmento. Segmento sem envio no período não
 * concorre (não entraria nem no volume, nem no "Outros").
 */
function aggregateSegments(
  campaigns: TalkXCampaign[],
  segmentNames: Map<string, string>,
  metric: SegmentMetric,
): SegmentAggregate[] {
  const map = new Map<string, SegmentTotals & { name: string }>();
  for (const c of campaigns) {
    if (!c.segment_id) continue;
    const current = map.get(c.segment_id) ?? {
      name: segmentNames.get(c.segment_id) ?? c.segment_id.slice(0, 8),
      sent: 0, delivered: 0, replied: 0,
    };
    current.sent += c.sent_count ?? 0;
    current.delivered += c.delivered_count ?? 0;
    current.replied += c.replied_count ?? 0;
    map.set(c.segment_id, current);
  }
  return [...map.entries()]
    .map(([id, totals]) => ({ id, name: totals.name, sent: totals.sent, delivered: totals.delivered, replied: totals.replied, value: metricValue(totals, metric) }))
    .filter((row) => row.sent > 0)
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || b.sent - a.sent || a.name.localeCompare(b.name));
}

/** Corta em `limit` linhas e soma o resto numa linha "Outros" (a métrica é recalculada sobre a soma). */
function withOthers(rows: SegmentAggregate[], metric: SegmentMetric, limit = TOP_SEGMENTS_LIMIT): SegmentAggregate[] {
  if (rows.length <= limit) return rows;
  const head = rows.slice(0, limit);
  const rest = rows.slice(limit).reduce<SegmentTotals>(
    (acc, row) => ({ sent: acc.sent + row.sent, delivered: acc.delivered + row.delivered, replied: acc.replied + row.replied }),
    { sent: 0, delivered: 0, replied: 0 },
  );
  return [...head, { id: '__outros__', name: 'Outros', ...rest, value: metricValue(rest, metric) }];
}

/** "43,2%" | "sem dados ainda" (métrica sem fonte). */
function metricLabel(value: number | null) {
  return value === null ? 'sem dados ainda' : `${value.toFixed(1).replace('.', ',')}%`;
}

export function AnalyticsTopSegments({
  campaigns,
  segments,
  view = 'resumo',
  onViewAll,
}: {
  campaigns: TalkXCampaign[];
  segments: TalkXSegment[];
  view?: SegmentView;
  onViewAll?: () => void;
}) {
  const [metric, setMetric] = useState<SegmentMetric>('resposta');

  const names = useMemo(() => new Map(segments.map((s) => [s.id, s.name])), [segments]);
  const rows = useMemo(() => {
    const all = aggregateSegments(campaigns, names, metric);
    return view === 'segmentos' ? all : withOthers(all, metric);
  }, [campaigns, names, metric, view]);
  const grouped = rows.length > 0 && rows[rows.length - 1].id === '__outros__';

  return (
    <section className="rounded-2xl bg-card border border-border/70 p-4">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <IconTile icon={Target} color="violet" size={36} />
          <div>
            <p className="text-[15px] font-bold text-foreground">Top segmentos</p>
            <p className="text-xs text-foreground-secondary">
              {view === 'segmentos' ? 'Todos os segmentos do período' : `Os ${TOP_SEGMENTS_LIMIT} melhores do período`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Métrica dos segmentos">
          {SEGMENT_METRICS.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={metric === m.value}
              onClick={() => setMetric(m.value)}
              className={cn('h-8 px-3.5 rounded-lg text-xs font-medium border transition-colors', metric === m.value ? 'border-primary bg-primary/10 text-foreground' : 'border-border/70 bg-input/40 text-foreground-secondary hover:bg-muted/50')}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground text-center py-6">Sem campanhas com segmento no período selecionado.</p>
      ) : (
        <>
          <ul aria-label="Top segmentos" className="space-y-2.5">
            {rows.map((row) => (
              <li key={row.id} className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] text-foreground truncate">{row.name}</span>
                  <span className="text-xs shrink-0 tabular-nums">
                    <span className={cn('font-semibold', row.value === null ? 'text-muted-foreground' : 'text-foreground')}>{metricLabel(row.value)}</span>
                    <span className="ml-1 text-muted-foreground">({fmtInt(row.sent)} envios)</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                  {row.value !== null && row.value > 0 && (
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, row.value)}%` }} />
                  )}
                </div>
              </li>
            ))}
          </ul>
          {grouped && (
            <p className="text-2xs text-muted-foreground mt-3 leading-snug">
              Os demais segmentos do período estão somados em "Outros".
            </p>
          )}
          {view === 'resumo' && onViewAll && (
            <button type="button" onClick={onViewAll} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors">
              Ver todos os segmentos
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </>
      )}
    </section>
  );
}
