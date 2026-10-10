/**
 * X153 (tela 12): card "Pico de Respostas" da Visão Geral (inventário T12-041…T12-044).
 *
 * Regras do mock, provadas pelo teste:
 *  - título "Pico de Respostas" + selo "Em tempo real";
 *  - a variação "+N% nas respostas" só aparece com pelo menos 5 respostas na janela
 *    ANTERIOR de 10 minutos — abaixo disso a série não tem base de comparação e o
 *    card diz que ainda não há respostas suficientes;
 *  - o cartão "Ótimo engajamento!" só aparece quando existe média histórica (CAP-083)
 *    E a base mínima dessa média está satisfeita; sem benchmark o card não afirma
 *    que a campanha está "acima do normal" (fonte inexistente hoje).
 * Componente de apresentação: recebe as contagens já calculadas pelo chamador.
 */
import React from 'react';
import { MessageSquare } from 'lucide-react';
import { Pill } from '@/components/dashboard/overview/DashboardCard';
import { RailCard } from '../kit/rail';

/** Respostas necessárias na janela anterior para a variação ter base de comparação. */
export const REPLY_PEAK_MIN_BASE = 5;

export interface TalkXReplyPeakBenchmark {
  /** Taxa de resposta média histórica, em % (CAP-083). */
  averageRatePct: number;
  /** Menor número de respostas na janela para a média histórica valer como referência. */
  minimumBase: number;
}

export interface TalkXReplyPeakCardProps {
  /** Respostas nos últimos 10 minutos. */
  currentWindow: number;
  /** Respostas nos 10 minutos anteriores (base de comparação). */
  previousWindow: number;
  /** Respostas por minuto, do mais antigo para o mais recente (mini-barras). */
  spark: number[];
  /** Taxa de resposta atual, em % (respondidos ÷ enviados). */
  replyRatePct: number;
  /** Média histórica; sem ela o card não afirma "Ótimo engajamento". */
  benchmark?: TalkXReplyPeakBenchmark | null;
  className?: string;
}

export function TalkXReplyPeakCard({
  currentWindow,
  previousWindow,
  spark,
  replyRatePct,
  benchmark = null,
  className,
}: TalkXReplyPeakCardProps) {
  const hasBase = previousWindow >= REPLY_PEAK_MIN_BASE;
  const variation = hasBase
    ? Math.round(((currentWindow - previousWindow) / previousWindow) * 100)
    : null;
  const variationText = variation === null
    ? null
    : `${variation > 0 ? '+' : ''}${variation}% nas respostas`;
  const peakMax = spark.length > 0 ? Math.max(...spark) : 0;
  const showEngagement = Boolean(
    benchmark
    && benchmark.minimumBase > 0
    && currentWindow >= benchmark.minimumBase
    && replyRatePct > benchmark.averageRatePct,
  );

  return (
    <RailCard
      icon={MessageSquare}
      color="violet"
      title="Pico de Respostas"
      right={<Pill label="Em tempo real" tone="success" dot />}
      className={className}
    >
      <div className="space-y-3 pt-1">
        {variation !== null && variation > 0 ? (
          <div>
            <p className="text-[13px] font-semibold text-foreground tabular-nums">{variationText}</p>
            <p className="text-2xs text-foreground-secondary">
              Houve um aumento significativo de respostas nos últimos 10 minutos.
            </p>
          </div>
        ) : variation !== null ? (
          <div>
            <p className="text-[13px] font-semibold text-foreground tabular-nums">{variationText}</p>
          </div>
        ) : (
          <div>
            <p className="text-[13px] font-semibold text-foreground">Ainda sem respostas suficientes</p>
            <p className="text-2xs text-foreground-secondary">
              {`São necessárias ${REPLY_PEAK_MIN_BASE} respostas nos 10 minutos anteriores para comparar.`}
            </p>
          </div>
        )}

        {spark.length > 0 && (
          <div className="flex h-10 items-end gap-1" aria-hidden="true">
            {spark.map((value, index) => (
              <span
                key={index}
                data-testid="talkx-reply-peak-bar"
                className="w-1.5 shrink-0 rounded-sm bg-dash-violet/70 motion-safe:transition-all"
                style={{ height: peakMax > 0 ? `${Math.max(4, Math.round((value / peakMax) * 100))}%` : '4px' }}
              />
            ))}
          </div>
        )}

        {showEngagement && benchmark && (
          <div className="rounded-xl border border-dash-green/30 bg-dash-green/8 px-3 py-2.5">
            <p className="text-xs font-semibold text-dash-green">Ótimo engajamento!</p>
            <p className="text-2xs text-foreground-secondary">
              Sua campanha está gerando mais resultados que o normal.
            </p>
          </div>
        )}
      </div>
    </RailCard>
  );
}
