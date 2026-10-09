/**
 * X154 (TL-161) — Card "Ações da Campanha" + bloco "Configurações Atuais" (tela 12).
 *
 * O card de ações vivia em faixa horizontal no fim de `TalkXCampaignRunning`
 * (CR:673-722), sem mostrar as regras que estão valendo. Aqui ele passa a ser um
 * componente próprio, com os botões EMPILHADOS, e ganha o bloco "Configurações
 * Atuais", lido da campanha (regras em `./talkxCampaignRules`).
 *
 * É apresentacional de propósito: Pausar/Retomar/Cancelar continuam com os modais de
 * confirmação que a tela já guarda (X148 é quem leva esses modais para o kit).
 */
import { Pause, Play, Square, Settings2, Eye, SlidersHorizontal } from 'lucide-react';
import { RailCard, MetaRow } from '../talkxShared';
import { formatSendDays, formatSendWindow, type TalkXCampaignWithRules } from './talkxCampaignRules';

const ACTION_BUTTON =
  'w-full h-9 px-4 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

export interface TalkXCampaignActionsCardProps {
  campaign: TalkXCampaignWithRules;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onEditLimits: () => void;
  onViewMonitor: () => void;
  resuming?: boolean;
}

export function TalkXCampaignActionsCard({
  campaign, onPause, onResume, onCancel, onEditLimits, onViewMonitor, resuming = false,
}: TalkXCampaignActionsCardProps) {
  const maxPerMinute = typeof campaign.max_per_minute === 'number' ? campaign.max_per_minute : null;
  const windowLabel = formatSendWindow(campaign.send_window_start, campaign.send_window_end);
  const daysLabel = formatSendDays(campaign.send_days);
  const dnd = typeof campaign.respect_dnd === 'boolean' ? campaign.respect_dnd : null;
  const hasSettings = maxPerMinute !== null || windowLabel !== null || daysLabel !== null || dnd !== null;

  return (
    <RailCard
      icon={Settings2}
      color="amber"
      title="Ações da Campanha"
      subtitle={campaign.status === 'paused' ? 'Campanha pausada — retome ou encerre.' : 'Controle os envios desta campanha.'}
    >
      <div className="flex flex-col gap-2">
        {campaign.status === 'sending' && (
          <button
            type="button"
            onClick={onPause}
            className={`${ACTION_BUTTON} border-dash-amber/40 bg-dash-amber/10 text-dash-amber hover:bg-dash-amber/20`}
          >
            <Pause className="w-4 h-4" />Pausar
          </button>
        )}
        {campaign.status === 'paused' && (
          <button
            type="button"
            disabled={resuming}
            onClick={onResume}
            className={`${ACTION_BUTTON} border-primary/40 bg-primary/10 text-primary hover:bg-primary/20`}
          >
            <Play className="w-4 h-4" />{resuming ? 'Retomando…' : 'Retomar'}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className={`${ACTION_BUTTON} border-dash-red/40 bg-dash-red/10 text-dash-red hover:bg-dash-red/20`}
        >
          <Square className="w-4 h-4" />Cancelar campanha
        </button>
        <button
          type="button"
          onClick={onEditLimits}
          className={`${ACTION_BUTTON} border-border/70 bg-input/40 hover:bg-muted/50`}
        >
          <SlidersHorizontal className="w-4 h-4" />Editar Limites
        </button>
        <button
          type="button"
          onClick={onViewMonitor}
          className={`${ACTION_BUTTON} border-border/70 bg-input/40 hover:bg-muted/50`}
        >
          <Eye className="w-4 h-4" />Ver Monitor ao Vivo
        </button>
      </div>

      {hasSettings && (
        <div className="pt-3 border-t border-border/50">
          <p className="text-[13px] font-bold text-foreground mb-1">Configurações Atuais</p>
          <div className="space-y-0.5">
            {maxPerMinute !== null && (
              <MetaRow label="Limite de envio" value={`${maxPerMinute} mensagens/min`} />
            )}
            {windowLabel !== null && <MetaRow label="Horário de envio" value={windowLabel} />}
            {daysLabel !== null && <MetaRow label="Dias de envio" value={daysLabel} />}
            {dnd !== null && <MetaRow label="Respeitar DND" value={dnd ? 'Sim' : 'Não'} />}
          </div>
        </div>
      )}
    </RailCard>
  );
}
