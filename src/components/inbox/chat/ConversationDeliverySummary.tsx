/**
 * Paridade V3 -> V2 (auditoria de 11/10/2026, parte 1 do chat): o resumo de entrega da conversa.
 *
 * `summarizeDeliveryProgress` já existia (`./messageSendTimeline`), mas nenhum componente o usava —
 * a conversa não mostrava fila nem envio em andamento. Aqui saem apenas os chips com valor MAIOR
 * que zero; com tudo confirmado o componente não renderiza nada (o cartão pede silêncio quando não
 * há pendência real). A região tem `aria-live="polite"` para o leitor de tela acompanhar a fila.
 *
 * Sem DDL, sem Edge Function e sem dependência nova: o cálculo sai das colunas que já existem em
 * `public.messages`. Só tokens de cor do sistema.
 */
import { cn } from '@/lib/utils';
import { summarizeDeliveryProgress, type MessageSendFields } from './messageSendTimeline';

export interface ConversationDeliverySummaryProps {
  messages: readonly MessageSendFields[];
  className?: string;
}

export function ConversationDeliverySummary({ messages, className }: ConversationDeliverySummaryProps) {
  const { queued, inFlight, failed } = summarizeDeliveryProgress(messages);
  if (queued === 0 && inFlight === 0 && failed === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="conversation-delivery-summary"
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 pt-2 text-2xs text-muted-foreground',
        className,
      )}
    >
      {queued > 0 && <span>{queued} na fila</span>}
      {inFlight > 0 && <span>{inFlight} enviando</span>}
      {failed > 0 && (
        <span className="text-[hsl(var(--destructive-text))]">
          {failed} com falha
        </span>
      )}
    </div>
  );
}
