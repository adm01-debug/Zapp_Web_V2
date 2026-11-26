import React from 'react';
import { Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconTile, TalkXErrorState } from '../talkxShared';
import {
  describeNextReset,
  isEmptyPace,
  paceUsagePercent,
  useTalkXCampaignPace,
  type TalkXCampaignPaceNumbers,
} from '@/hooks/integrations/useTalkXCampaignPace';

/**
 * X018 — bloco "Orçamento de envio" do painel de campanha (Analytics).
 *
 * A conexão de WhatsApp tem teto por minuto e por dia (padrão 6/min e 500/dia,
 * `talkx_settings`), somando TalkX e Multiplix. A tela não existia: quando o
 * teto batia, a campanha parecia travada sem explicação. O número vem de
 * `talkx_campaign_pace` — nada é contado no cliente.
 */

export interface TalkXCampaignPaceCardProps {
  data: TalkXCampaignPaceNumbers;
  isLoading?: boolean;
  isError?: boolean;
  /** Falta de permissão (42501): a tela explica, não mostra "nenhum envio". */
  isForbidden?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  /** Injetável para o teste do "renova em" sem depender do relógio. */
  now?: Date;
}

function usageTone(percent: number): string {
  if (percent >= 100) return 'bg-dash-red';
  if (percent >= 80) return 'bg-dash-tile-amber';
  return 'bg-dash-green';
}

function PaceBar({
  id, label, hint, sent, limit, remaining, isLoading,
}: {
  id: string;
  label: string;
  hint: string;
  sent: number;
  limit: number;
  remaining: number;
  isLoading: boolean;
}) {
  const percent = paceUsagePercent(sent, limit);
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3" title={hint}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-2xs font-semibold text-foreground-secondary">{label}</p>
        {isLoading ? (
          <div className="h-4 w-16 rounded bg-muted/50 animate-pulse" aria-hidden="true" />
        ) : (
          <p className="text-[13px] font-bold tabular-nums text-foreground">
            {sent.toLocaleString('pt-BR')}
            <span className="text-foreground-secondary font-medium"> / {limit.toLocaleString('pt-BR')}</span>
          </p>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={isLoading ? 0 : percent}
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/50"
      >
        <div
          className={cn('h-full rounded-full transition-all', usageTone(percent))}
          style={{ width: `${isLoading ? 0 : percent}%` }}
        />
      </div>
      <p id={id} className="text-2xs text-foreground-secondary mt-1">
        {isLoading ? 'Calculando o que resta…' : `Restam ${remaining.toLocaleString('pt-BR')}`}
      </p>
    </div>
  );
}

export function TalkXCampaignPaceCard({
  data,
  isLoading = false,
  isError = false,
  isForbidden = false,
  errorMessage,
  onRetry,
  now,
}: TalkXCampaignPaceCardProps) {
  const semConexao = !isLoading && isEmptyPace(data);

  return (
    <section
      data-testid="talkx-campaign-pace"
      aria-label="Orçamento de envio da campanha"
      className="rounded-xl border border-border/60 bg-input/20 p-3"
    >
      <div className="flex items-center gap-2 mb-3">
        <IconTile icon={Gauge} color="amber" size={32} />
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-foreground">Orçamento de envio</p>
          <p className="text-2xs text-foreground-secondary">Teto da conexão desta campanha (TalkX e Multiplix)</p>
        </div>
      </div>

      {isForbidden ? (
        <p
          data-testid="talkx-campaign-pace-restrito"
          role="status"
          className="rounded-xl border border-border/60 bg-card p-3 text-xs text-foreground-secondary"
        >
          Apenas administradores e supervisores veem o orçamento de envio desta campanha.
        </p>
      ) : isError ? (
        <TalkXErrorState entity="cotas de envio" message={errorMessage ?? undefined} onRetry={onRetry} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <PaceBar
              id="pace-minuto"
              label="No último minuto"
              hint="Mensagens enviadas por esta conexão nos últimos 60 segundos."
              sent={data.minuteSent}
              limit={data.minuteLimit}
              remaining={data.minuteRemaining}
              isLoading={isLoading}
            />
            <PaceBar
              id="pace-dia"
              label="Hoje"
              hint="Mensagens enviadas por esta conexão desde 00:00 (America/Sao_Paulo)."
              sent={data.daySent}
              limit={data.dayLimit}
              remaining={data.dayRemaining}
              isLoading={isLoading}
            />
          </div>
          <p className="text-2xs text-foreground-secondary mt-2">
            {semConexao
              ? 'Campanha sem conexão de WhatsApp vinculada — o orçamento é sempre da conexão.'
              : describeNextReset(data.nextDayAt, now)}
          </p>
        </>
      )}
    </section>
  );
}

/** Container do painel E74: liga a campanha selecionada ao hook do servidor. */
export function TalkXCampaignPacePanel({ campaignId }: { campaignId: string | null | undefined }) {
  const pace = useTalkXCampaignPace(campaignId);
  return (
    <TalkXCampaignPaceCard
      data={pace}
      isLoading={pace.isLoading}
      isError={pace.isError}
      isForbidden={pace.isForbidden}
      errorMessage={pace.errorMessage}
      onRetry={pace.refetch}
    />
  );
}