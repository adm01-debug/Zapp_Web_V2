// TalkXKeyMetricsCard.tsx — X160 (T13-058…T13-066): card "Principais Métricas" da tela 13.
//
// Recebe os números JÁ CALCULADOS (painel da campanha) e as médias históricas da RPC
// `talkx_benchmarks()` (CAP-083). O comparativo "↑ N% vs. média" só aparece quando a base
// mínima existe (`hasBaseline`) E a média daquela métrica existe; sem base, a linha mostra
// só o valor. Taxa de falha e tempo médio de resposta ainda não têm média no RPC
// (T13-064/T13-066): a linha aparece sem comparativo em vez de inventar número.
// Contas ficam em `talkxKeyMetrics.ts`, testáveis sem React.
import React from 'react';
import { Gauge } from 'lucide-react';
import { RailCard } from '../talkxShared';
import {
  benchmarkDelta, formatReplySeconds, ratePct, rateValue,
  type TalkXKeyMetricsBenchmarks, type TalkXKeyMetricsData, type TalkXMetricDelta,
} from './talkxKeyMetrics';

interface TalkXKeyMetricsCardProps {
  metrics: TalkXKeyMetricsData;
  /** Ausente = sem base: todas as linhas ficam sem comparativo. */
  benchmarks?: TalkXKeyMetricsBenchmarks | null;
}

export function TalkXKeyMetricsCard({ metrics, benchmarks }: TalkXKeyMetricsCardProps) {
  const hasBaseline = benchmarks?.hasBaseline ?? false;
  const taxaEntrega = rateValue(metrics.delivered, metrics.sent);
  const taxaResposta = rateValue(metrics.replied, metrics.sent);
  const taxaFalha = rateValue(metrics.failed, metrics.processed);

  const linhas: { label: string; value: string; delta: TalkXMetricDelta | null }[] = [
    {
      label: 'Taxa de Entrega',
      value: ratePct(metrics.delivered, metrics.sent),
      delta: benchmarkDelta(taxaEntrega, benchmarks?.avgDeliveryRatePct ?? null, { hasBaseline, goodWhen: 'up' }),
    },
    {
      label: 'Taxa de Resposta',
      value: ratePct(metrics.replied, metrics.sent),
      delta: benchmarkDelta(taxaResposta, benchmarks?.avgReplyRatePct ?? null, { hasBaseline, goodWhen: 'up' }),
    },
    {
      label: 'Taxa de Falha',
      value: ratePct(metrics.failed, metrics.processed),
      delta: benchmarkDelta(taxaFalha, benchmarks?.avgFailureRatePct ?? null, { hasBaseline, goodWhen: 'down' }),
    },
    {
      label: 'Tempo Médio de Resposta',
      value: formatReplySeconds(metrics.avgReplySeconds),
      delta: benchmarkDelta(metrics.avgReplySeconds, benchmarks?.avgReplySeconds ?? null, { hasBaseline, goodWhen: 'down' }),
    },
  ];

  return (
    <RailCard icon={Gauge} color="violet" title="Principais Métricas">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {linhas.map((linha) => (
          <div key={linha.label} className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <p className="text-3xs font-medium text-muted-foreground uppercase tracking-wide">{linha.label}</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-semibold text-foreground tabular-nums">{linha.value}</span>
              {linha.delta && (
                <span
                  title="Média das campanhas concluídas nos últimos 90 dias"
                  className={`text-2xs font-semibold ${linha.delta.tone === 'good' ? 'text-success' : 'text-destructive'}`}
                >
                  {`${linha.delta.arrow} ${linha.delta.text}`}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </RailCard>
  );
}
