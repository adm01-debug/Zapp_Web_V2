// TalkXCampaignPaused.tsx — Tela 13: "Campanha Pausada" (X156 · F11 Acompanhar campanha)
//
// Antes desta tela, uma campanha `paused` abria `TalkXCampaignRunning` sob o
// título "Campanha em Andamento": não havia nome da campanha, data da pausa,
// banner de pausa nem confirmação para retomar/encerrar.
import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, Pause, Play, RefreshCw, Square } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
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
  SUMMARY_WINDOWS,
  buildSentSummaryPoints,
  type TalkXReportHourBucket,
  type TalkXSummaryWindow,
} from './tracking/talkxSentSummary';
import {
  KEY_METRICS_NO_BASELINE,
  benchmarksFromJson,
  keyMetricsFromCampaign,
} from './tracking/talkxKeyMetrics';

interface Props {
  campaignId: string;
  onBack: () => void;
  /** Nome de quem pausou (resolvido pelo contêiner a partir de `paused_by`). */
  pausedByName?: string | null;
  /** Avisa o contêiner pai que a campanha saiu de "pausada" (retomada/encerrada por fora). */
  onStatusChange: (campaign: TalkXCampaign) => void;
}

export function TalkXCampaignPaused({ campaignId, onBack, pausedByName, onStatusChange }: Props) {
  const {
    campaigns, isLoading, isFetching, isError, error, refetchCampaigns,
    startCampaign, cancelCampaign,
  } = useTalkX();
  // Deriva sempre da consulta: a linha do banco é a única fonte do status.
  const campaign = campaigns.find((c) => c.id === campaignId) ?? null;

  // A pausa pode acabar sem passar por esta tela (retomada pelo Monitor, pelo
  // agendador dentro da janela de envio, ou encerrada em outra aba). Quem
  // decide o destino é o contêiner pai — aqui só avisamos a mudança.
  useEffect(() => {
    if (campaign && campaign.status !== 'paused') onStatusChange(campaign);
  }, [campaign, onStatusChange]);

  const [resumeOpen, setResumeOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [ending, setEnding] = useState(false);
  // Recusa da retomada explicada no modal (o toast da recusa já vem do hook).
  const [resumeError, setResumeError] = useState<string | null>(null);

  // Painéis X160 — dados do painel + RPC de benchmarks (T13-050…T13-066).
  // Best-effort por fonte: o painel nunca apaga o cabeçalho nem as ações; fonte
  // indisponível vira série vazia / métricas da linha / valores sem comparativo.
  const [summaryWindow, setSummaryWindow] = useState<TalkXSummaryWindow>('24h');
  const panelsQuery = useQuery({
    queryKey: ['talkx-paused-panels', campaign?.id ?? null, summaryWindow],
    queryFn: async () => {
      const fallback = {
        points: [],
        metrics: keyMetricsFromCampaign(campaign ?? {}, null),
        benchmarks: { ...KEY_METRICS_NO_BASELINE },
      };
      if (!campaign) return fallback;
      const minutes = SUMMARY_WINDOWS.find((w) => w.id === summaryWindow)?.minutes ?? 1440;

      let hourly: TalkXReportHourBucket[] = [];
      let avgReplySeconds: unknown = null;
      try {
        const { data, error } = await supabase.rpc('talkx_campaign_report', { p_campaign: campaign.id });
        if (error) throw error;
        const report = (data ?? {}) as { hourly_series?: unknown; kpis?: { avg_reply_secs?: unknown } };
        if (Array.isArray(report.hourly_series)) hourly = report.hourly_series as TalkXReportHourBucket[];
        avgReplySeconds = report.kpis?.avg_reply_secs ?? null;
      } catch {
        // painel indisponível: série vazia, métricas vêm da linha da campanha.
      }

      // Respostas por hora — o canal que o painel não devolve por balde.
      let replies: string[] = [];
      try {
        const { data, error } = await fromTable('talkx_recipients')
          .select('replied_at')
          .eq('campaign_id', campaign.id)
          .not('replied_at', 'is', null)
          .order('replied_at', { ascending: false })
          .limit(2000);
        if (error) throw error;
        replies = ((data ?? []) as Array<{ replied_at: unknown }>)
          .map((r) => r.replied_at)
          .filter((t): t is string => typeof t === 'string' && t.length > 0);
      } catch {
        // sem respostas por hora: a série mostra só enviados/entregues.
      }

      let benchmarks = { ...KEY_METRICS_NO_BASELINE };
      try {
        const { data, error } = await supabase.rpc('talkx_benchmarks');
        if (error) throw error;
        benchmarks = benchmarksFromJson(data);
      } catch {
        // sem base histórica: valores sem comparativo.
      }

      return {
        points: buildSentSummaryPoints(hourly, replies, minutes),
        metrics: keyMetricsFromCampaign(campaign, avgReplySeconds),
        benchmarks,
      };
    },
    enabled: !!campaign,
  });
  const panelsLoading = panelsQuery.isLoading;
  const panels = panelsQuery.data;

  const handleResume = useCallback(async () => {
    if (!campaign || resuming) return;
    setResuming(true);
    setResumeError(null);
    try {
      // `startCampaign` valida o corpo da resposta (a recusa por janela de envio
      // volta 200 com ok:false), mostra o toast do erro e devolve false quando o
      // servidor recusou — por isso aqui não há segundo toast (não duplicar).
      const started = await startCampaign(campaign.id);
      // Fecha o modal só com o aceite do servidor: na recusa o operador continua
      // no modal, com o motivo à vista, para tentar de novo. Sem onStatusChange.
      if (started) {
        setResumeOpen(false);
      } else {
        setResumeError('O servidor não aceitou a retomada. Confira a janela de envio e tente de novo.');
      }
    } catch {
      // O hook trata o próprio erro, mas se a chamada lançar o operador precisa
      // ver: o modal continua aberto para tentar de novo.
      toast.error('Erro ao retomar a campanha.');
    } finally {
      setResuming(false);
    }
  }, [campaign, resuming, startCampaign]);

  const handleEnd = useCallback(async () => {
    if (!campaign || ending) return;
    setEnding(true);
    try {
      await cancelCampaign(campaign.id);
      setEndOpen(false);
      toast.warning('Campanha encerrada.');
      onBack();
    } catch {
      toast.error('Erro ao encerrar a campanha.');
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
              {pausedByName
                ? `Pausada por ${pausedByName}${campaign.paused_at ? ` em ${fmtDateTime(campaign.paused_at)}` : ''}`
                : campaign.paused_at ? `Pausada em ${fmtDateTime(campaign.paused_at)}` : 'Pausada sem data registrada'}
            </p>
          </AlertCard>

          {/* Painéis de acompanhamento (X160): série real do painel + benchmarks */}
          <TalkXSentSummaryChart
            points={panels?.points ?? []}
            windowId={summaryWindow}
            onWindowChange={setSummaryWindow}
            pausedAt={campaign.paused_at ?? null}
            loading={panelsLoading}
          />
          <TalkXKeyMetricsCard
            metrics={panels?.metrics ?? keyMetricsFromCampaign(campaign, null)}
            benchmarks={panels?.benchmarks ?? { ...KEY_METRICS_NO_BASELINE }}
          />

          {/* Ações */}
          <div className="rounded-2xl bg-card border border-border/70 p-4">
            <p className="text-[13px] font-bold text-foreground mb-3">Ações da Campanha</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { setResumeError(null); setResumeOpen(true); }}
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
            onClose={() => { setResumeOpen(false); setResumeError(null); }}
            onConfirm={() => { void handleResume(); }}
            icon={Play}
            iconColor="blue"
            title="Retomar campanha?"
            entityName={campaign.name}
            description={resumeError ?? 'Os envios serão continuados a partir de onde pararam. Contatos já processados não são reenviados.'}
            confirmLabel="Retomar"
            loading={resuming}
          />

          {/* Modal: Encerrar */}
          <TalkXConfirmDialog
            open={endOpen}
            onClose={() => setEndOpen(false)}
            onConfirm={() => { void handleEnd(); }}
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
