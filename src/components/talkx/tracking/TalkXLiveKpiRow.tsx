// X146 · Talk X — faixa de KPIs ao vivo das telas 11 (Monitor) e 12 (Em andamento).
//
// O componente é APRESENTACIONAL: não faz consulta nenhuma. Toda a faixa vem do objeto
// `panel` — o mesmo payload que o painel `useTalkXMonitorPanel` (X144) entrega. É o que
// garante que a tela e o painel contem a mesma história, e é o que permite à tela 12
// continuar usando o que já tem hoje enquanto o painel não chega.
//
// Regra A9: comparativo sem dado NÃO vira "0%" nem "—"; a linha simplesmente não existe.
// Por isso os cartões usam a geometria `hero` do cartão de KPI — nela `delta={null}` não
// desenha linha (nas geometrias menores a mesma ausência aparece como "—").
import type { ReactNode } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, MessageSquareReply, ShieldOff, Zap,
} from 'lucide-react';
import { DashboardKpiCard, type KpiDelta } from '@/components/dashboard/overview/DashboardKpiCard';
import { fmtInt } from '../talkxShared';

/** Série de mini-barras de cada cartão (pontos por minuto, do painel). */
export interface TalkXLiveKpiSpark {
  sent?: number[];
  delivered?: number[];
  replied?: number[];
  failed?: number[];
  opt_outs?: number[];
  remaining?: number[];
}

/**
 * Payload do painel ao vivo (X144). Campo que o painel não tem ainda entra como `null`
 * e a linha que depender dele não é desenhada — nunca um número inventado.
 */
export interface TalkXLiveKpiPanel {
  /** talkx_campaigns.sent_count */
  sent: number;
  /** talkx_campaigns.delivered_count */
  delivered: number;
  /** talkx_campaigns.replied_count */
  replied: number;
  /** talkx_campaigns.failed_count */
  failed: number;
  /** talkx_campaigns.outcome_unknown_count — vira a linha "N a confirmar" do cartão Falhas. */
  outcome_unknown?: number | null;
  /** Opt-outs da campanha (CAP-026/T11-027). Sem o número o cartão não entra na faixa. */
  opt_outs?: number | null;
  /** Audiência da campanha: base do "N% da base" e do "de N contatos". */
  audience?: number | null;
  /** Previsão (CAP-087). Sem ela não existe a linha "vs. previsto". */
  forecast?: { vs_pct: number } | null;
  /** Comparativo com o dia anterior (CAP-018). Nulo não desenha a linha "vs. ontem". */
  vs_yesterday?: { replied_pct?: number | null; failed_pct?: number | null } | null;
  /** Tempo decorrido da campanha — a tela 12 já mostrava "N min decorridos" no cartão Restantes. */
  elapsed_minutes?: number | null;
  spark?: TalkXLiveKpiSpark;
}

export interface TalkXLiveKpiRowProps {
  panel: TalkXLiveKpiPanel;
  /** tela11 = Monitor ao Vivo; tela12 = Campanha em Andamento. */
  variant: 'tela11' | 'tela12';
  /** Tela 11: clique na linha "N a confirmar" filtra a tabela de destinatários. */
  onFilterOutcomeUnknown?: () => void;
}

/** Geometria `hero` do cartão: 7 barras ≈ 100px (mesmo corte que o cartão do kit faz, E13). */
const SPARK_POINTS = 7;

function sparkOf(series?: number[]): number[] | null {
  if (!series) return null;
  const points = series.filter((value) => Number.isFinite(value)).slice(-SPARK_POINTS);
  return points.length >= 2 ? points : null;
}

/** "↑ 12% vs. previsto" / "↓ 3% vs. ontem". `pct` é a variação COM sinal vinda do painel. */
function comparisonText(pct: number, label: string): string {
  return `${pct >= 0 ? '↑' : '↓'} ${Math.round(Math.abs(pct))}% ${label}`;
}

/** "94% de entrega" — entregues sobre enviadas; sem enviadas não há taxa (nunca "0%"). */
function deliveryText(delivered: number, sent: number): string | null {
  if (sent <= 0) return null;
  return `${Math.round((delivered / sent) * 100)}% de entrega`;
}

/** "1,4% da base" — uma casa decimal, vírgula. Sem base conhecida não há porcentagem. */
function optOutText(optOuts: number, audience: number | null): string | null {
  if (audience === null || audience <= 0) return null;
  return `${((optOuts / audience) * 100).toFixed(1).replace('.', ',')}% da base`;
}

/**
 * Só o texto com seta ganha tom: "↑" é bom quando `upIsGood`; "↓" é bom quando não é.
 * Linha neutra (taxa, porcentagem da base, "de N contatos") não pode virar verde por acaso.
 */
function deltaOf(text: string | null, upIsGood: boolean): KpiDelta {
  if (text === null) return null;
  const up = text.startsWith('↑');
  return { text, tone: up === upIsGood ? 'success' : 'muted' };
}

function neutral(text: string | null): KpiDelta {
  return text === null ? null : { text, tone: 'muted' };
}

export function TalkXLiveKpiRow({ panel, variant, onFilterOutcomeUnknown }: TalkXLiveKpiRowProps) {
  const tela12 = variant === 'tela12';
  const audience = panel.audience ?? null;
  const optOuts = panel.opt_outs ?? null;
  const outcomeUnknown = panel.outcome_unknown ?? 0;
  const elapsed = panel.elapsed_minutes ?? null;
  const processed = panel.sent + panel.failed + outcomeUnknown;
  const remaining = audience === null ? 0 : Math.max(0, audience - processed);

  const forecastPct = panel.forecast?.vs_pct ?? null;
  const repliedPct = panel.vs_yesterday?.replied_pct ?? null;
  const failedPct = panel.vs_yesterday?.failed_pct ?? null;

  const cards: ReactNode[] = [
    <DashboardKpiCard
      key="enviadas"
      size="hero"
      index={0}
      label={tela12 ? 'Mensagens Enviadas' : 'Enviadas'}
      value={fmtInt(panel.sent)}
      delta={forecastPct === null ? null : deltaOf(comparisonText(forecastPct, 'vs. previsto'), true)}
      tile="blue"
      icon={Zap}
      bars={sparkOf(panel.spark?.sent)}
      barsColor="blue"
    />,
    <DashboardKpiCard
      key="entregues"
      size="hero"
      index={1}
      label="Entregues"
      value={fmtInt(panel.delivered)}
      delta={neutral(deliveryText(panel.delivered, panel.sent))}
      tile="green"
      icon={CheckCircle2}
      bars={sparkOf(panel.spark?.delivered)}
      barsColor="green"
    />,
    <DashboardKpiCard
      key="respondidas"
      size="hero"
      index={2}
      label={tela12 ? 'Respostas' : 'Respondidas'}
      value={fmtInt(panel.replied)}
      delta={repliedPct === null ? null : deltaOf(comparisonText(repliedPct, 'vs. ontem'), true)}
      tile="violet"
      icon={MessageSquareReply}
      bars={sparkOf(panel.spark?.replied)}
      barsColor="violet"
    />,
    <DashboardKpiCard
      key="falhas"
      size="hero"
      index={3}
      label="Falhas"
      value={fmtInt(panel.failed)}
      // Falha que cai é boa notícia: ↑ é ruim, ↓ é bom.
      delta={failedPct === null ? null : deltaOf(comparisonText(failedPct, 'vs. ontem'), false)}
      tile="red"
      icon={AlertTriangle}
      bars={sparkOf(panel.spark?.failed)}
      barsColor="red"
      footer={outcomeUnknown > 0 ? outcomeUnknownFooter(outcomeUnknown, onFilterOutcomeUnknown) : undefined}
    />,
  ];

  if (tela12) {
    cards.push(
      <DashboardKpiCard
        key="restantes"
        size="hero"
        index={4}
        label="Destinatários Restantes"
        value={audience === null ? '—' : fmtInt(remaining)}
        delta={audience === null ? null : { text: `de ${fmtInt(audience)} contatos`, tone: 'muted' }}
        tile="amber"
        icon={Clock}
        bars={sparkOf(panel.spark?.remaining)}
        barsColor="amber"
        // A barra que vivia no bloco "Progresso geral" (CR) passa a morar aqui.
        footer={audience !== null && audience > 0 ? (
          <div className="space-y-1">
            <RemainingBar processed={processed} audience={audience} />
            {elapsed !== null && (
              <p className="text-3xs text-foreground-secondary">{`${elapsed} min decorridos`}</p>
            )}
          </div>
        ) : undefined}
      />,
    );
  } else if (optOuts !== null) {
    cards.push(
      <DashboardKpiCard
        key="optouts"
        size="hero"
        index={4}
        label="Opt-outs"
        value={fmtInt(optOuts)}
        delta={neutral(optOutText(optOuts, audience))}
        tile="amber"
        icon={ShieldOff}
        bars={sparkOf(panel.spark?.opt_outs)}
        barsColor="amber"
      />,
    );
  }

  return (
    <div
      data-testid="talkx-live-kpi-row"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3"
    >
      {cards}
    </div>
  );
}

/** "N a confirmar" — clique quando a tela tiver tabela para filtrar; senão é só o número. */
function outcomeUnknownFooter(n: number, onFilter?: () => void): ReactNode {
  if (!onFilter) {
    return <p className="text-xs font-semibold text-dash-amber">{`${fmtInt(n)} a confirmar`}</p>;
  }
  return (
    <button
      type="button"
      onClick={onFilter}
      className="text-xs font-semibold text-dash-amber hover:underline"
    >
      {`${fmtInt(n)} a confirmar`}
    </button>
  );
}

function RemainingBar({ processed, audience }: { processed: number; audience: number }) {
  const percent = Math.min(100, (processed / audience) * 100);
  return (
    <div
      className="h-2 rounded-full bg-muted overflow-hidden"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      aria-label="Progresso da campanha"
    >
      <div className="h-full rounded-full bg-primary transition-all motion-safe:duration-500" style={{ width: `${percent}%` }} />
    </div>
  );
}
