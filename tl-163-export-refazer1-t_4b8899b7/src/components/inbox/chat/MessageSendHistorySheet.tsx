/**
 * SL-198 (itens 061-062 do inventário de paridade) — os TRÊS desenhos da lacuna "sem
 * `MessageAttemptsTimeline`/`MessageSendHistorySheet`":
 *   `MessageAttemptsTimeline` — a linha do tempo vertical de envio de uma mensagem;
 *   `MessageSendHistorySheet` — o "Histórico de envio" (Sheet do sistema) com a timeline dentro;
 *   `ChatQueueProgress` — a barra de falhas/progresso de fila da conversa (metade de cliente do 062).
 *
 * O CÁLCULO (quais passos, com que horário, o que conta como fila/falha) está em
 * `./messageSendTimeline` — colunas reais de `public.messages`, nenhuma inventada, e nenhuma
 * coluna/migration/Edge nova. O corte é a regra da casa `react-refresh/only-export-components`
 * (contada pelo lint-ratchet): este arquivo exporta só componente.
 *
 * Regras respeitadas: só tokens de cor do sistema (`--destructive-text` no texto de estado, o par
 * AA do E.3; `--info` só no ícone), animação apenas com `motion-safe:`, nada de exportar/baixar novo
 * e nenhum selo de canal/origem.
 */
import { AlertCircle, Check, Clock, Loader2, type LucideIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  buildMessageSendTimeline,
  summarizeDeliveryProgress,
  type MessageSendFields,
  type SendTimelineState,
  type SendTimelineStep,
} from './messageSendTimeline';

const ESTADO_ICONE: Record<SendTimelineState, LucideIcon> = {
  done: Check,
  current: Loader2,
  pending: Clock,
  error: AlertCircle,
};

const ESTADO_CLASSE: Record<SendTimelineState, string> = {
  done: 'text-muted-foreground',
  current: 'text-info',
  pending: 'text-muted-foreground',
  error: 'text-destructive',
};

export interface MessageAttemptsTimelineProps {
  steps: SendTimelineStep[];
  className?: string;
}

/** A linha do tempo vertical (o `MessageAttemptsTimeline` do V3). */
export function MessageAttemptsTimeline({ steps, className }: MessageAttemptsTimelineProps) {
  return (
    <ol className={cn('space-y-0', className)} data-testid="message-attempts-timeline">
      {steps.map((step, index) => {
        const Icon = ESTADO_ICONE[step.state];
        const ultimo = index === steps.length - 1;
        return (
          <li key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <Icon
                aria-hidden="true"
                className={cn(
                  'h-4 w-4 shrink-0',
                  ESTADO_CLASSE[step.state],
                  step.state === 'current' && 'motion-safe:animate-spin',
                )}
              />
              {!ultimo && <span aria-hidden="true" className="mt-1 w-px flex-1 bg-border" />}
            </div>
            <div className={cn('min-w-0', ultimo ? 'pb-0' : 'pb-4')}>
              <p
                className={cn(
                  'text-sm break-words',
                  step.state === 'error' ? 'text-[hsl(var(--destructive-text))]' : 'text-foreground',
                )}
              >
                {step.label}
              </p>
              {step.at && <p className="text-2xs text-muted-foreground">{format(new Date(step.at), 'HH:mm:ss')}</p>}
              {step.detail && <p className="text-2xs text-muted-foreground">{step.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export interface MessageSendHistorySheetProps {
  message: MessageSendFields;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

/**
 * O "Histórico de envio" do menu da mensagem (o `MessageSendHistorySheet` do V3).
 * Sem botão "tentar agora": o reenvio manual de uma mensagem falha é o item 021 (DLQ operável,
 * `rpc_dlq_*`; plano, linha 473), que não existe no V2 — botão que não faz nada seria pior que
 * a ausência dele.
 */
export function MessageSendHistorySheet({ message, open, onOpenChange, className }: MessageSendHistorySheetProps) {
  const steps = buildMessageSendTimeline(message);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={cn('w-full overflow-y-auto sm:max-w-md', className)}>
        <SheetHeader>
          <SheetTitle>Histórico de envio</SheetTitle>
          <SheetDescription>Tentativas de entrega registradas para esta mensagem.</SheetDescription>
        </SheetHeader>
        <div className="mt-6">
          {steps.length > 0 ? (
            <MessageAttemptsTimeline steps={steps} />
          ) : (
            <p className="text-sm text-muted-foreground">Esta mensagem não tem envio para acompanhar.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export interface ChatQueueProgressProps {
  messages: readonly MessageSendFields[];
  className?: string;
}

/**
 * Barra de falhas e progresso de fila da conversa (o `ChatQueueProgress` do V3).
 * Só aparece quando há fila ou falha: mensagem entregue não gera banner nenhum (o cartão pede
 * "sem toasts repetidos").
 */
export function ChatQueueProgress({ messages, className }: ChatQueueProgressProps) {
  const progress = summarizeDeliveryProgress(messages);
  const pendentes = progress.queued + progress.inFlight + progress.failed;
  if (progress.total === 0 || pendentes === 0) return null;

  const fatia = (n: number) => `${(n / progress.total) * 100}%`;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.confirmed}
        aria-label={`Progresso de envio: ${progress.confirmed} de ${progress.total} confirmadas, ${progress.failed} com falha`}
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <span className="h-full bg-success" style={{ width: fatia(progress.confirmed) }} />
        <span className="h-full bg-info" style={{ width: fatia(progress.inFlight) }} />
        <span className="h-full bg-destructive" style={{ width: fatia(progress.failed) }} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-muted-foreground">
        {progress.queued > 0 && <span>{progress.queued} na fila</span>}
        {progress.inFlight > 0 && <span>{progress.inFlight} em envio</span>}
        {progress.failed > 0 && (
          <span className="text-[hsl(var(--destructive-text))]">
            {progress.failed} falha{progress.failed === 1 ? '' : 's'}
          </span>
        )}
        {progress.confirmed > 0 && <span>{progress.confirmed} confirmada{progress.confirmed === 1 ? '' : 's'}</span>}
      </div>
    </div>
  );
}
