// TalkXCampaignPaused.tsx — Tela 13: "Campanha Pausada" (X156 · F11 Acompanhar campanha)
//
// Antes desta tela, uma campanha `paused` abria `TalkXCampaignRunning` sob o
// título "Campanha em Andamento": não havia nome da campanha, data da pausa,
// banner de pausa nem confirmação para retomar/encerrar.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Pause, Play, RefreshCw, Square } from 'lucide-react';
import { toast } from 'sonner';
import { useTalkX, type TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { fromTable, supabase } from '@/lib/supabaseHelpers';
import {
  AlertCard, IconTile, TalkXConfirmDialog, TalkXEmptyState, TalkXQueryBoundary, TalkXSkeletonRows,
  fmtDateTime,
} from './talkxShared';
import { TalkXSentSummaryChart } from './tracking/TalkXSentSummaryChart';
import { TalkXKeyMetricsCard } from './tracking/TalkXKeyMetricsCard';
import {
  SUMMARY_WINDOWS, type TalkXSentSummaryPoint, type TalkXSummaryWindow,
} from './tracking/talkxSentSummary';
import type { TalkXKeyMetricsBenchmarks, TalkXKeyMetricsData } from './tracking/talkxKeyMetrics';

const HOUR_MS = 3_600_000;

/** Base mínima da CAP-083: sem 5 campanhas concluídas não há "vs. média" para comparar. */
const BENCHMARK_MIN_CAMPAIGNS = 5;

/** Linha de `talkx_recipients` que o resumo consome. */
interface SummaryRecipientRow {
  sent_at: string;
  delivered_at: string | null;
  replied_at: string | null;
}

/** KPIs de `talkx_campaign_report(p_campaign)` (20260930670000). */
interface TalkXReportKpis {
  sent_count?: number | null;
  delivered_count?: number | null;
  failed_count?: number | null;
  outcome_unknown_count?: number | null;
  avg_reply_secs?: number | null;
}

/** Médias históricas de `talkx_benchmarks()` (CAP-083). */
interface TalkXBenchmarksPayload {
  global?: {
    campaign_count?: number | null;
    avg_delivery_rate_pct?: number | null;
    avg_reply_rate_pct?: number | null;
  } | null;
}

/**
 * Série de hora em hora do "Resumo de Enviados" a partir das linhas REAIS da campanha.
 *
 * Não existe RPC de série por janela que traga as três linhas: o `talkx_campaign_report`
 * devolve `hourly_series` só com `sent`/`delivered` e sem recorte de janela. O Monitor já
 * monta a série dele no navegador a partir de até 2000 linhas ordenadas por `sent_at`
 * (F11:34) — esta tela faz o mesmo e filtra a janela na consulta.
 * Balde sem envio entra com zero para a linha do tempo não pular hora.
 */
function hourlySummaryPoints(
  rows: SummaryRecipientRow[],
  { minutes, now }: { minutes: number; now: number },
): TalkXSentSummaryPoint[] {
  // Nada no recorte (campanha sem envio, ou nenhum envio na janela): série vazia, para
  // o card dizer "nenhum envio" em vez de desenhar uma reta de zeros.
  if (rows.length === 0) return [];

  const inicio = Math.floor((now - minutes * 60_000) / HOUR_MS) * HOUR_MS;
  const baldes = new Map<number, { sent: number; delivered: number; replied: number }>();
  for (let t = inicio; t <= now; t += HOUR_MS) baldes.set(t, { sent: 0, delivered: 0, replied: 0 });

  for (const row of rows) {
    const sentMs = new Date(row.sent_at).getTime();
    if (Number.isNaN(sentMs)) continue;
    const balde = baldes.get(Math.floor(sentMs / HOUR_MS) * HOUR_MS);
    if (!balde) continue;
    // `sent` conta o que saiu (tem `sent_at`), inclusive o que já foi entregue ou respondido.
    balde.sent += 1;
    if (row.delivered_at) balde.delivered += 1;
    if (row.replied_at) balde.replied += 1;
  }

  return [...baldes.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, v]) => ({ bucket: new Date(t).toISOString(), ...v }));
}

interface Props {
  campaignId: string;
  onBack: () => void;
  /** Avisa o contêiner pai que a campanha saiu de "pausada" (retomada/encerrada por fora). */
  onStatusChange?: (campaign: TalkXCampaign) => void;
}

export function TalkXCampaignPaused({ campaignId, onBack, onStatusChange }: Props) {
  const {
    campaigns, isLoading, isFetching, isError, error, refetchCampaigns,
    startCampaign, cancelCampaign,
  } = useTalkX();
  // Deriva sempre da consulta: a linha do banco é a única fonte do status.
  const campaign = campaigns.find((c) => c.id === campaignId) ?? null;

  const [summaryWindow, setSummaryWindow] = useState<TalkXSummaryWindow>('24h');
  const windowMinutes = SUMMARY_WINDOWS.find((w) => w.id === summaryWindow)?.minutes ?? 1440;

  // Série do "Resumo de Enviados": a janela faz parte da chave, então trocar o
  // select pede o painel de novo (6/12/24 h) em vez de recortar o que já veio.
  const summaryQuery = useQuery({
    queryKey: ['talkx-paused-summary', campaignId, summaryWindow],
    enabled: !!campaign,
    queryFn: async () => {
      const now = Date.now();
      const { data, error } = await fromTable('talkx_recipients')
        .select('sent_at, delivered_at, replied_at')
        .eq('campaign_id', campaignId)
        .not('sent_at', 'is', null)
        .gte('sent_at', new Date(now - windowMinutes * 60_000).toISOString())
        .order('sent_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return { now, rows: (data ?? []) as SummaryRecipientRow[] };
    },
  });

  const summaryPoints = useMemo(
    () => (summaryQuery.data
      ? hourlySummaryPoints(summaryQuery.data.rows, { minutes: windowMinutes, now: summaryQuery.data.now })
      : []),
    [summaryQuery.data, windowMinutes],
  );

  // KPIs da campanha: o `talkx_campaign_report` traz o tempo médio de resposta, que
  // a linha da campanha não guarda.
  const kpisQuery = useQuery({
    queryKey: ['talkx-paused-kpis', campaignId],
    enabled: !!campaign,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('talkx_campaign_report', { p_campaign: campaignId });
      if (error) throw error;
      return ((data ?? null) as { kpis?: TalkXReportKpis } | null)?.kpis ?? null;
    },
  });

  // Médias históricas (CAP-083): sem base mínima o card mostra o valor e não compara.
  const benchmarksQuery = useQuery({
    queryKey: ['talkx-benchmarks'],
    enabled: !!campaign,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TalkXKeyMetricsBenchmarks> => {
      const { data, error } = await supabase.rpc('talkx_benchmarks');
      if (error) throw error;
      const global = ((data ?? null) as TalkXBenchmarksPayload | null)?.global ?? null;
      return {
        hasBaseline: (global?.campaign_count ?? 0) >= BENCHMARK_MIN_CAMPAIGNS,
        avgDeliveryRatePct: global?.avg_delivery_rate_pct ?? null,
        avgReplyRatePct: global?.avg_reply_rate_pct ?? null,
      };
    },
  });

  // "Quem pausou": `paused_by` não está no tipo do hook, e o nome sai do perfil (FK).
  const actorQuery = useQuery({
    queryKey: ['talkx-paused-ator', campaignId],
    enabled: !!campaign,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await fromTable('talkx_campaigns')
        .select('paused_by, ator:profiles!talkx_campaigns_paused_by_fkey(name)')
        .eq('id', campaignId)
        .maybeSingle();
      if (error) throw error;
      const nome = ((data ?? null) as { ator?: { name?: string | null } | null } | null)?.ator?.name;
      return nome?.trim() || null;
    },
  });

  const metrics = useMemo<TalkXKeyMetricsData>(() => {
    const kpis = kpisQuery.data;
    const sent = kpis?.sent_count ?? 0;
    const failed = kpis?.failed_count ?? 0;
    const unknown = kpis?.outcome_unknown_count ?? 0;
    return {
      sent,
      delivered: kpis?.delivered_count ?? 0,
      // `replied_count` não está nos KPIs do RPC: vem da linha da campanha, que é
      // a mesma origem dos demais contadores.
      replied: campaign?.replied_count ?? 0,
      failed,
      processed: sent + failed + unknown,
      avgReplySeconds: kpis?.avg_reply_secs ?? null,
    };
  }, [kpisQuery.data, campaign]);

  // A pausa pode acabar sem passar por esta tela (retomada pelo Monitor, pelo
  // agendador dentro da janela de envio, ou encerrada em outra aba). Quem
  // decide o destino é o contêiner pai — aqui só avisamos a mudança.
  useEffect(() => {
    if (campaign && campaign.status !== 'paused') onStatusChange?.(campaign);
  }, [campaign, onStatusChange]);

  const [resumeOpen, setResumeOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [ending, setEnding] = useState(false);

  const handleResume = useCallback(async () => {
    if (!campaign || resuming) return false;
    setResuming(true);
    try {
      // `startCampaign` valida o corpo da resposta (a recusa por janela de envio
      // volta 200 com ok:false) e mostra o toast do erro. Devolve false quando o
      // servidor recusou.
      const started = await startCampaign(campaign.id);
      // Fecha o modal só com o aceite do servidor: na recusa o operador continua
      // no modal para tentar de novo.
      if (started) setResumeOpen(false);
      return started;
    } catch {
      // O hook trata o próprio erro, mas se a chamada lançar o operador precisa
      // ver: o modal continua aberto para tentar de novo.
      toast.error('Erro ao retomar a campanha.');
      return false;
    } finally {
      setResuming(false);
    }
  }, [campaign, resuming, startCampaign]);

  const handleEnd = useCallback(async () => {
    if (!campaign || ending) return false;
    setEnding(true);
    try {
      await cancelCampaign(campaign.id);
      setEndOpen(false);
      toast.warning('Campanha encerrada.');
      onBack();
      return true;
    } catch {
      toast.error('Erro ao encerrar a campanha.');
      return false;
    } finally {
      setEnding(false);
    }
  }, [campaign, ending, cancelCampaign, onBack]);

  return (
    <TalkXQueryBoundary
      query={{ isLoading, isFetching, isError, error }}
      entity="campanhas"
      onRetry={() => { void refetchCampaigns(); }}
      skeleton={<TalkXSkeletonRows rows={3} variant="cards" />}
      isEmpty={!campaign}
      empty={(
        <TalkXEmptyState
          title="Campanha pausada não encontrada"
          description="Ela pode ter sido retomada, encerrada ou removida. Volte para a lista de campanhas e abra novamente."
        />
      )}
    >
      {campaign ? (
        <div className="min-h-full bg-background p-3 md:p-4 lg:p-6 space-y-4">
          {/* Cabeçalho */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <button type="button" onClick={onBack} aria-label="Voltar" className="p-1.5 rounded-lg hover:bg-muted/50 shrink-0">
                <ChevronLeft className="w-5 h-5 text-foreground-secondary" />
              </button>
              <IconTile icon={Pause} color="amber" size={40} glow />
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-foreground leading-tight truncate">
                  Campanha Pausada • {campaign.name}
                </h1>
                <p className="text-xs text-foreground-secondary">Retome para continuar os envios ou encerre a campanha</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => { void refetchCampaigns(); }}
                title="Atualizar"
                aria-label="Atualizar"
                className="h-9 w-9 flex items-center justify-center rounded-lg border border-border/70 bg-input/40 hover:bg-muted/50"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Banner de pausa */}
          <AlertCard tone="warning">
            <p className="font-semibold text-[13px]">Campanha pausada</p>
            <p className="mt-1">
              Nenhum novo contato será processado até que a campanha seja retomada. Mensagens já em voo continuam
              sendo entregues.
            </p>
            <p className="mt-1 text-2xs">
              {campaign.paused_at
                ? `Pausada em ${fmtDateTime(campaign.paused_at)}${actorQuery.data ? ` por ${actorQuery.data}` : ''}`
                : 'Pausada sem data registrada'}
            </p>
          </AlertCard>

          {/* Painel da campanha: resumo de enviados + principais métricas */}
          <TalkXQueryBoundary
            query={{
              isLoading: summaryQuery.isLoading || kpisQuery.isLoading || benchmarksQuery.isLoading,
              isFetching: summaryQuery.isFetching || kpisQuery.isFetching || benchmarksQuery.isFetching,
              isError: summaryQuery.isError || kpisQuery.isError || benchmarksQuery.isError,
              error: summaryQuery.error ?? kpisQuery.error ?? benchmarksQuery.error,
            }}
            entity="painel da campanha"
            onRetry={() => {
              void summaryQuery.refetch();
              void kpisQuery.refetch();
              void benchmarksQuery.refetch();
            }}
            skeleton={<TalkXSkeletonRows rows={6} variant="cards" />}
            isEmpty={false}
            empty={null}
          >
            <div className="space-y-4">
              <TalkXSentSummaryChart
                points={summaryPoints}
                pausedAt={campaign.paused_at}
                windowId={summaryWindow}
                onWindowChange={setSummaryWindow}
                loading={summaryQuery.isFetching}
              />
              <TalkXKeyMetricsCard metrics={metrics} benchmarks={benchmarksQuery.data ?? null} />
            </div>
          </TalkXQueryBoundary>

          {/* Ações */}
          <div className="rounded-2xl bg-card border border-border/70 p-4">
            <p className="text-[13px] font-bold text-foreground mb-3">Ações da Campanha</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setResumeOpen(true)}
                className="h-9 px-4 rounded-lg border border-primary/40 bg-primary/10 text-primary text-xs font-semibold flex items-center gap-2 hover:bg-primary/20"
              >
                <Play className="w-4 h-4" />Retomar campanha
              </button>
              <button
                type="button"
                onClick={() => setEndOpen(true)}
                className="h-9 px-4 rounded-lg border border-destructive/30 bg-destructive/8 text-destructive text-xs font-semibold flex items-center gap-2 hover:bg-destructive/15 ml-auto"
              >
                <Square className="w-4 h-4" />Encerrar campanha
              </button>
            </div>
          </div>

          {/* Modal: Retomar */}
          <TalkXConfirmDialog
            open={resumeOpen}
            onClose={() => setResumeOpen(false)}
            onConfirm={() => handleResume()}
            icon={Play}
            iconColor="blue"
            title="Retomar campanha?"
            entityName={campaign.name}
            description="Os envios serão continuados a partir de onde pararam. Contatos já processados não são reenviados."
            confirmLabel="Retomar"
            loading={resuming}
          />

          {/* Modal: Encerrar */}
          <TalkXConfirmDialog
            open={endOpen}
            onClose={() => setEndOpen(false)}
            onConfirm={() => handleEnd()}
            icon={Square}
            iconColor="red"
            tone="danger"
            title="Encerrar campanha?"
            entityName={campaign.name}
            description="Os destinatários restantes não receberão a mensagem. Esta ação não pode ser desfeita."
            confirmLabel="Encerrar"
            loading={ending}
          />
        </div>
      ) : null}
    </TalkXQueryBoundary>
  );
}
