// TalkXCampaignPaused.tsx — Tela 13: "Campanha Pausada" (X156 · F11 Acompanhar campanha)
//
// Antes desta tela, uma campanha `paused` abria `TalkXCampaignRunning` sob o
// título "Campanha em Andamento": não havia nome da campanha, data da pausa,
// banner de pausa nem confirmação para retomar/encerrar.
import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, Pause, Play, RefreshCw, Square } from 'lucide-react';
import { toast } from 'sonner';
import { useTalkX, type TalkXCampaign } from '@/hooks/integrations/useTalkX';
import {
  AlertCard, IconTile, TalkXConfirmDialog, TalkXEmptyState, TalkXQueryBoundary, TalkXSkeletonRows,
  fmtDateTime,
} from './talkxShared';

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
    if (!campaign || resuming) return;
    setResuming(true);
    try {
      // `startCampaign` valida o corpo da resposta (a recusa por janela de envio
      // volta 200 com ok:false) e mostra o toast do erro. Devolve false quando o
      // servidor recusou.
      const started = await startCampaign(campaign.id);
      // Fecha o modal só com o aceite do servidor: na recusa o operador continua
      // no modal para tentar de novo.
      if (started) setResumeOpen(false);
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
              {campaign.paused_at ? `Pausada em ${fmtDateTime(campaign.paused_at)}` : 'Pausada sem data registrada'}
            </p>
          </AlertCard>

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
            onConfirm={() => { void handleResume(); }}
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
