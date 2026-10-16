import React, { useCallback, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Copy, Eye, Pause, Pencil, Play, Square, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TalkXConfirmDialog, TalkXPrimaryButton, fmtInt } from './talkxShared';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

/**
 * X080 — ações de linha da campanha em um lugar só, para a tabela, a grade e
 * "Últimas campanhas". O hook não grava nada por conta própria: ele decide
 * QUAIS ações o status permite, pede a confirmação das que mudam o estado da
 * campanha e só dá a ação por concluída quando o responsável por gravá-la
 * responde — em caso de recusa do servidor o modal fica aberto com a mensagem e
 * nada é anunciado como sucesso antes da hora.
 *
 * A confirmação é a mesma em qualquer superfície: quem chama passa os
 * manipuladores (os mesmos que a Visão geral já recebe do contêiner) e usa
 * `actionsFor`/`run` no menu e `dialogs` uma única vez na tela.
 */

export type CampaignRowActionId = 'view' | 'edit' | 'start' | 'pause' | 'resume' | 'duplicate' | 'cancel' | 'delete';

/** Ações que mudam o estado da campanha e por isso passam por confirmação. */
export type CampaignRowConfirmKind = 'start' | 'pause' | 'resume' | 'duplicate' | 'cancel' | 'delete';

export interface CampaignRowAction {
  id: CampaignRowActionId;
  label: string;
  icon: LucideIcon;
  /** Vermelho do sistema (`text-dash-red`): a ação encerra ou remove a campanha. */
  destructive?: boolean;
}

function viewAction(label: string): CampaignRowAction {
  return { id: 'view', label, icon: Eye };
}
const EDIT: CampaignRowAction = { id: 'edit', label: 'Editar', icon: Pencil };
const START: CampaignRowAction = { id: 'start', label: 'Iniciar agora', icon: Play };
const PAUSE: CampaignRowAction = { id: 'pause', label: 'Pausar', icon: Pause };
const RESUME: CampaignRowAction = { id: 'resume', label: 'Retomar', icon: Play };
const DUPLICATE: CampaignRowAction = { id: 'duplicate', label: 'Duplicar', icon: Copy };
const CANCEL: CampaignRowAction = { id: 'cancel', label: 'Cancelar campanha', icon: Square, destructive: true };
const DELETE: CampaignRowAction = { id: 'delete', label: 'Excluir', icon: Trash2, destructive: true };

/**
 * Matriz das ações por status. Mantém exatamente o que a Visão geral já oferecia
 * em cada status (nenhuma ação sai da tela) e a regra do banco para excluir:
 * `delete_talkx_campaign` aceita rascunho e agendada (CAP-109), e cancelar vale
 * para o que já foi lançado (agendada, em envio ou pausada).
 */
export function campaignRowActions(
  campaign: Pick<TalkXCampaign, 'status' | 'total_recipients'>,
): CampaignRowAction[] {
  const hasAudience = (campaign.total_recipients ?? 0) > 0;
  switch (campaign.status) {
    case 'draft':
      return [viewAction('Monitorar'), EDIT, ...(hasAudience ? [START] : []), DUPLICATE, DELETE];
    case 'scheduled':
      return [viewAction('Ver agendamento'), EDIT, ...(hasAudience ? [START] : []), DUPLICATE, CANCEL, DELETE];
    case 'sending':
      return [viewAction('Em andamento'), PAUSE, DUPLICATE, CANCEL];
    case 'paused':
      return [viewAction('Em andamento'), RESUME, DUPLICATE, CANCEL];
    case 'completed':
      return [viewAction('Ver relatório'), DUPLICATE];
    case 'cancelled':
      return [viewAction('Monitorar'), DUPLICATE];
    default:
      return [viewAction('Monitorar')];
  }
}

export interface CampaignRowActionHandlers {
  onView: (c: TalkXCampaign) => void;
  onViewScheduled?: (c: TalkXCampaign) => void;
  onViewRunning?: (c: TalkXCampaign) => void;
  onEdit: (c: TalkXCampaign) => void;
  onStart: (id: string) => void | Promise<unknown>;
  onPause: (id: string, reason: string) => void | Promise<unknown>;
  onCancel: (id: string) => void | Promise<unknown>;
  onDelete: (id: string) => void | Promise<unknown>;
  onDuplicate: (c: TalkXCampaign) => void | Promise<unknown>;
}

export interface CampaignRowActions {
  /** Ações que o status da campanha permite, na ordem em que o menu as mostra. */
  actionsFor: (c: TalkXCampaign) => CampaignRowAction[];
  /** Executa a ação: navegação na hora, mudança de estado pelo modal de confirmação. */
  run: (action: CampaignRowActionId, c: TalkXCampaign) => void;
  /** Campanha com uma ação em andamento — o menu da linha gira e não aceita outro clique. */
  pendingId: string | null;
  /** Modais de confirmação; renderizar UMA vez na tela. */
  dialogs: React.ReactNode;
}

export function useCampaignRowActions(handlers: CampaignRowActionHandlers): CampaignRowActions {
  const [confirm, setConfirm] = useState<{ kind: CampaignRowConfirmKind; campaign: TalkXCampaign } | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Trava de reentrada: o mesmo modal não pode disparar a ação duas vezes
  // enquanto o servidor não responde (o estado só chega no próximo render).
  const inFlight = useRef(false);

  const openView = useCallback((c: TalkXCampaign) => {
    // Preserva o roteamento que a tabela já fazia: agendada vai para "Ver
    // agendamento", em envio/pausada para "Em andamento" e o resto para o
    // monitor/relatório — todas pela rota `campaign=<id>` do contêiner.
    if (c.status === 'scheduled' && handlers.onViewScheduled) { handlers.onViewScheduled(c); return; }
    if ((c.status === 'sending' || c.status === 'paused') && handlers.onViewRunning) { handlers.onViewRunning(c); return; }
    handlers.onView(c);
  }, [handlers]);

  const run = useCallback((action: CampaignRowActionId, c: TalkXCampaign) => {
    if (action === 'view') { openView(c); return; }
    if (action === 'edit') { handlers.onEdit(c); return; }
    setError(null);
    setReason('');
    setConfirm({ kind: action as CampaignRowConfirmKind, campaign: c });
  }, [handlers, openView]);

  const close = useCallback(() => {
    if (inFlight.current) return;
    setConfirm(null);
    setReason('');
    setError(null);
  }, []);

  const execute = useCallback(async () => {
    if (!confirm || inFlight.current) return;
    const { kind, campaign } = confirm;
    const motivo = reason.trim();
    if (kind === 'pause' && !motivo) return; // pausa sem motivo não vai ao servidor

    inFlight.current = true;
    setPendingId(campaign.id);
    setError(null);
    try {
      if (kind === 'start' || kind === 'resume') await handlers.onStart(campaign.id);
      else if (kind === 'pause') await handlers.onPause(campaign.id, motivo);
      else if (kind === 'duplicate') await handlers.onDuplicate(campaign);
      else if (kind === 'cancel') await handlers.onCancel(campaign.id);
      else await handlers.onDelete(campaign.id);
      setConfirm(null);
      setReason('');
    } catch (e) {
      // A recusa do servidor mantém o modal aberto com a mensagem e a linha na
      // lista: nada de sucesso (nem de linha sumida) antes da confirmação real.
      const message = e instanceof Error && e.message.trim() ? e.message.trim() : null;
      setError(message ?? 'A ação não foi aceita pelo servidor.');
    } finally {
      inFlight.current = false;
      setPendingId(null);
    }
  }, [confirm, handlers, reason]);

  const pending = pendingId !== null;
  const onConfirm = useCallback(() => { void execute(); }, [execute]);
  const reasonMissing = confirm?.kind === 'pause' && reason.trim() === '';

  const dialogs = (
    <>
      <TalkXConfirmDialog
        open={confirm?.kind === 'start'}
        onClose={close}
        onConfirm={onConfirm}
        loading={pending}
        icon={Play} iconColor="blue" tone="primary"
        title="Iniciar campanha?"
        description={error ?? `As mensagens serão enviadas agora para ${fmtInt(confirm?.campaign.total_recipients ?? 0)} contatos. Esta ação não pode ser desfeita.`}
        entityName={confirm?.campaign.name}
        confirmLabel="Iniciar envio" cancelLabel="Cancelar"
      />
      <TalkXConfirmDialog
        open={confirm?.kind === 'resume'}
        onClose={close}
        onConfirm={onConfirm}
        loading={pending}
        icon={Play} iconColor="blue" tone="primary"
        title="Retomar campanha?"
        description={error ?? 'O envio continua de onde parou; os contatos pendentes voltam a receber as mensagens.'}
        entityName={confirm?.campaign.name}
        confirmLabel="Retomar" cancelLabel="Cancelar"
      />
      <TalkXConfirmDialog
        open={confirm?.kind === 'duplicate'}
        onClose={close}
        onConfirm={onConfirm}
        loading={pending}
        icon={Copy} iconColor="violet" tone="violet"
        title="Duplicar campanha"
        description={error ?? 'Uma campanha nova em rascunho é criada com a mesma configuração, sem contatos e sem agendamento.'}
        entityName={confirm?.campaign.name}
        confirmLabel="Duplicar" cancelLabel="Cancelar"
      />
      <TalkXConfirmDialog
        open={confirm?.kind === 'cancel'}
        onClose={close}
        onConfirm={onConfirm}
        loading={pending}
        icon={Square} iconColor="red" tone="danger"
        title="Cancelar campanha"
        description={error ?? 'O envio será interrompido imediatamente e os contatos pendentes não receberão as mensagens.'}
        entityName={confirm?.campaign.name}
        confirmLabel="Cancelar campanha" cancelLabel="Voltar"
      />
      <TalkXConfirmDialog
        open={confirm?.kind === 'delete'}
        onClose={close}
        onConfirm={onConfirm}
        loading={pending}
        icon={Trash2} iconColor="red" tone="danger"
        title="Excluir campanha"
        description={error ?? 'Esta ação não pode ser desfeita.'}
        entityName={confirm?.campaign.name}
        confirmLabel="Excluir campanha" cancelLabel="Cancelar"
      />

      {/* Pausa: o motivo é obrigatório — é ele que fica registrado no evento da
          campanha (`talkx_campaign_events.paused`). */}
      <AlertDialog open={confirm?.kind === 'pause'} onOpenChange={(v) => { if (!v) close(); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg">Pausar campanha?</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">
              <span className="font-semibold text-foreground">&quot;{confirm?.campaign.name}&quot;</span> — o envio fica parado até você retomar. O motivo fica registrado no histórico da campanha.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="talkx-pause-reason" className="text-xs text-foreground">Motivo da pausa</Label>
            <Textarea
              id="talkx-pause-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: revisar o texto antes de continuar"
              rows={3}
              disabled={pending}
              className="text-[13px]"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={close} className="h-9 text-[13px]" disabled={pending}>Cancelar</AlertDialogCancel>
            <TalkXPrimaryButton
              glow loading={pending} disabled={reasonMissing || pending}
              onClick={onConfirm} className="h-9 text-[13px]"
            >
              Pausar campanha
            </TalkXPrimaryButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  return { actionsFor: campaignRowActions, run, pendingId, dialogs };
}
