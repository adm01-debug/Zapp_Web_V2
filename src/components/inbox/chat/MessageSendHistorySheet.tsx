/**
 * SL-198 (item 061 do inventário de paridade) — os DOIS desenhos da lacuna "sem
 * `MessageAttemptsTimeline`/`MessageSendHistorySheet`":
 *   `MessageAttemptsTimeline` — a linha do tempo vertical de envio de uma mensagem;
 *   `MessageSendHistorySheet` — o "Histórico de envio" (Sheet do sistema) com a timeline dentro.
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

