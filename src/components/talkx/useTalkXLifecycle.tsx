/* eslint-disable react-refresh/only-export-components -- TL-054A (X050): o contrato do cartão mantém o controlador, o texto (`talkXLifecycleCopy`) e o diálogo único no mesmo arquivo. */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useTalkX } from '@/hooks/integrations/useTalkX';

/**
 * TL-054A (X050) — controlador ÚNICO do ciclo de vida de campanha do Talk X.
 *
 * Antes: cada tela chamava `startCampaign`, `pauseCampaign`, `cancelCampaign` e
 * `updateCampaign` por conta própria, com estados de pendência e de erro
 * duplicados. Aqui existe UMA porta: `request({ kind, target })` abre o
 * diálogo de confirmação, `confirm()` executa a ação pelas operações que já
 * existem em `useTalkX` (nenhuma dependência nova) e o controlador guarda o
 * estado pendente e o erro.
 *
 * Garantias que as telas dependem:
 * - Enquanto uma ação roda (`isPending`), `request` e `close` são no-op: não dá
 *   para disparar outra ação nem fechar o diálogo no meio.
 * - Quando a ação falha, o erro fica em `error` e a intenção CONTINUA montada,
 *   então o diálogo segue aberto para a tela mostrar e o usuário tentar de novo.
 * - O hook não escreve evento de ciclo de vida: a trilha é do servidor (X024).
 * - `request` aceita `details` (linhas de contexto do diálogo) e, para `start`,
 *   `run` (executor próprio da tela): o `confirm()` chama `run()` e só fecha no
 *   aceite — `run()` devolvendo `false` mantém o diálogo aberto com erro.
 */

/** `start` é o disparo (iniciar/launch); `resume` retoma uma campanha pausada. */
export type TalkXLifecycleKind = 'start' | 'pause' | 'resume' | 'cancel' | 'schedule';

export interface TalkXLifecycleTarget {
  id: string;
  name?: string | null;
  /** Total de destinatários, quando a tela já tem o número (ex.: wizard). */
  total_recipients?: number;
}

/** Linha de resumo do pedido (rótulo/valor) exibida no diálogo único. */
export interface TalkXLifecycleDetail {
  label: string;
  value: string;
}

export interface TalkXLifecycleRequest {
  kind: TalkXLifecycleKind;
  target: TalkXLifecycleTarget;
  /** Para `schedule`: instante ISO do agendamento. */
  scheduledAt?: string;
  /** Linhas de contexto do pedido (segmento, destinatários, envio). */
  details?: TalkXLifecycleDetail[];
  /**
   * Só para `kind: 'start'`: executor próprio da tela. Quando existir, o
   * `confirm()` chama `run()` no lugar de `startCampaign(target.id)` — é o que
   * deixa o wizard salvar o rascunho e criar o snapshot antes de iniciar.
   * `run()` devolvendo `false` mantém o diálogo aberto com erro.
   */
  run?: () => Promise<boolean> | boolean;
}

export type TalkXLifecycleIntent = TalkXLifecycleRequest;

export interface TalkXLifecycleController {
  /** Intenção montada; `null` = diálogo fechado. */
  intent: TalkXLifecycleIntent | null;
  /** Ação em andamento. */
  isPending: boolean;
  /** Último erro da ação; enquanto existir, o diálogo continua aberto. */
  error: string | null;
  /** Motivo da pausa digitado no diálogo. */
  reason: string;
  setReason: (reason: string) => void;
  /** Abre o diálogo para a ação. Devolve `false` quando já há ação em andamento. */
  request: (request: TalkXLifecycleRequest) => boolean;
  /** Executa a intenção corrente. */
  confirm: () => Promise<void>;
  /** Fecha o diálogo. Devolve `false` quando há ação em andamento (bloqueado). */
  close: () => boolean;
  /** Limpa o erro sem fechar o diálogo. */
  clearError: () => void;
}

interface TalkXLifecycleCopy {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  pendingLabel: string;
  tone: 'default' | 'amber' | 'danger';
  requiresReason?: boolean;
}

/**
 * Texto único das ações de ciclo de vida. As telas leem daqui — nenhuma
 * escreve o próprio título de confirmar/pausar/cancelar.
 */
export const talkXLifecycleCopy: Record<TalkXLifecycleKind, TalkXLifecycleCopy> = {
  start: {
    title: 'Confirmar disparo?',
    description: 'As mensagens começam a ser enviadas para a audiência selecionada.',
    confirmLabel: 'Confirmar envio',
    cancelLabel: 'Cancelar',
    pendingLabel: 'Iniciando…',
    tone: 'default',
  },
  resume: {
    title: 'Retomar campanha?',
    description: 'Os envios serão continuados a partir de onde pararam.',
    confirmLabel: 'Retomar',
    cancelLabel: 'Cancelar',
    pendingLabel: 'Retomando…',
    tone: 'default',
  },
  pause: {
    title: 'Pausar campanha?',
    description: 'Os envios em andamento serão concluídos, mas novos envios não serão iniciados.',
    confirmLabel: 'Pausar agora',
    cancelLabel: 'Cancelar',
    pendingLabel: 'Pausando…',
    tone: 'amber',
    requiresReason: true,
  },
  cancel: {
    title: 'Cancelar campanha?',
    description: 'O envio será interrompido e contatos pendentes não receberão mensagens.',
    confirmLabel: 'Cancelar',
    cancelLabel: 'Voltar',
    pendingLabel: 'Cancelando…',
    tone: 'danger',
  },
  schedule: {
    title: 'Agendar campanha?',
    description: 'A campanha fica agendada para a data e hora escolhidas.',
    confirmLabel: 'Agendar',
    cancelLabel: 'Cancelar',
    pendingLabel: 'Agendando…',
    tone: 'default',
  },
};

const ENVIO_NAO_ACEITO = 'O envio não foi aceito. Tente novamente.';

export function useTalkXLifecycle(): TalkXLifecycleController {
  const {
    startCampaign,
    pauseCampaign,
    cancelCampaign,
    updateCampaign,
  } = useTalkX();

  const [intent, setIntent] = useState<TalkXLifecycleIntent | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  // Espelho síncrono de `isPending`: o estado só vale depois do render e as
  // guardas precisam decidir na mesma chamada.
  const pendingRef = useRef(false);

  const runAction = useCallback(
    async (current: TalkXLifecycleIntent, currentReason: string) => {
      switch (current.kind) {
        case 'start': {
          // Executor próprio da tela (wizard): salva o rascunho e cria o
          // snapshot antes de iniciar. Sem `run`, vale o caminho padrão.
          if (current.run) {
            const accepted = await current.run();
            if (!accepted) throw new Error(ENVIO_NAO_ACEITO);
            return;
          }
          const started = await startCampaign(current.target.id);
          // `startCampaign` engole o erro e devolve `false`; sem isto o
          // diálogo fecharia como se tivesse dado certo.
          if (!started) throw new Error(ENVIO_NAO_ACEITO);
          return;
        }
        case 'resume': {
          const started = await startCampaign(current.target.id);
          if (!started) throw new Error(ENVIO_NAO_ACEITO);
          return;
        }
        case 'pause':
          await pauseCampaign(current.target.id, currentReason.trim() || undefined);
          return;
        case 'cancel':
          await cancelCampaign(current.target.id);
          return;
        case 'schedule':
          await updateCampaign.mutateAsync({
            id: current.target.id,
            status: 'scheduled',
            scheduled_at: current.scheduledAt ?? null,
          });
          return;
      }
    },
    [startCampaign, pauseCampaign, cancelCampaign, updateCampaign],
  );

  const request = useCallback((next: TalkXLifecycleRequest): boolean => {
    if (pendingRef.current) return false;
    setError(null);
    setReason('');
    setIntent(next);
    return true;
  }, []);

  const confirm = useCallback(async () => {
    if (!intent || pendingRef.current) return;
    pendingRef.current = true;
    setIsPending(true);
    setError(null);
    try {
      await runAction(intent, reason);
      setIntent(null);
      setReason('');
    } catch (e: unknown) {
      // A intenção fica montada de propósito: o diálogo continua aberto com o
      // erro para a tela tratar e o usuário tentar de novo.
      setError(e instanceof Error ? e.message : 'Não foi possível concluir a ação.');
    } finally {
      pendingRef.current = false;
      setIsPending(false);
    }
  }, [intent, reason, runAction]);

  const close = useCallback((): boolean => {
    if (pendingRef.current) return false;
    setIntent(null);
    setError(null);
    setReason('');
    return true;
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return useMemo(
    () => ({
      intent,
      isPending,
      error,
      reason,
      setReason,
      request,
      confirm,
      close,
      clearError,
    }),
    [intent, isPending, error, reason, request, confirm, close, clearError],
  );
}

/**
 * Diálogo único das ações de ciclo de vida. A tela monta UM destes e passa o
 * controlador; nenhuma tela reimplementa o confirmar/pausar/cancelar.
 */
export function TalkXLifecycleDialog({
  controller,
}: {
  controller: TalkXLifecycleController;
}) {
  const { intent, isPending, error, reason } = controller;
  const copy = intent ? talkXLifecycleCopy[intent.kind] : null;
  const details = intent?.details ?? [];

  return (
    <AlertDialog
      open={!!intent}
      onOpenChange={(open) => {
        if (!open) controller.close();
      }}
    >
      <AlertDialogContent className="rounded-2xl border-border/70">
        {copy && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{copy.title}</AlertDialogTitle>
              <AlertDialogDescription>{copy.description}</AlertDialogDescription>
            </AlertDialogHeader>

            {details.length > 0 && (
              <dl className="grid gap-1.5 rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm">
                {details.map((detail, index) => (
                  <div
                    key={`${detail.label}-${index}`}
                    className="flex items-start justify-between gap-3"
                  >
                    <dt className="text-muted-foreground">{detail.label}</dt>
                    <dd className="text-right font-medium text-foreground">{detail.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {copy.requiresReason && (
              <textarea
                aria-label="Motivo da pausa (opcional)"
                className="w-full min-h-[64px] rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Motivo da pausa (opcional)"
                value={reason}
                disabled={isPending}
                onChange={(e) => controller.setReason(e.target.value)}
              />
            )}

            {error && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </p>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>{copy.cancelLabel}</AlertDialogCancel>
              <AlertDialogAction
                disabled={isPending}
                className={cn(
                  copy.tone === 'amber' && 'bg-dash-amber hover:bg-dash-amber/90 text-black',
                  copy.tone === 'danger' && 'bg-dash-red hover:bg-dash-red/90 text-white',
                )}
                onClick={(ev: ReactMouseEvent) => {
                  // Sem `preventDefault` o Radix fecharia o diálogo antes de a
                  // ação terminar — e o erro não teria onde aparecer.
                  ev.preventDefault();
                  void controller.confirm();
                }}
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}
                {isPending ? copy.pendingLabel : copy.confirmLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
