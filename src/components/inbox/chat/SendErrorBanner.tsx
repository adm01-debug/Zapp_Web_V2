/**
 * Paridade V3 -> V2 (auditoria de 11/10/2026, parte 1 do chat): o aviso de mensagem não enviada.
 *
 * Antes, uma mensagem com status 'failed' só ganhava o ícone vermelho no balão — a conversa não
 * avisava nem oferecia tentar de novo. Aqui o banner conta as falhas do agente e, quando a ÚLTIMA
 * falha é do tipo texto, oferece "Enviar de novo" (reenvia o texto como mensagem NOVA via
 * `onSendMessage` — não existe RPC para recolocar a mesma linha na fila, porque
 * `enqueue_outbound_message` deduplica por `client_message_id`). Falha de mídia/interativa mostra
 * só o aviso, sem o botão. "Dispensar" esconde o banner até surgir outra falha.
 *
 * Sem DDL, sem Edge Function e sem dependência nova. Só tokens de cor do sistema.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Message } from '@/types/chat';
import type { MessageSendFields } from './messageSendTimeline';

export interface SendErrorBannerProps {
  messages: readonly (Message & MessageSendFields)[];
  onSendMessage: (content: string) => void;
  className?: string;
}

const porHorario = (a: Message, b: Message) => (a.created_at ?? '').localeCompare(b.created_at ?? '');

function falhasDoAgente(messages: readonly Message[]): Message[] {
  return messages
    .filter((message) => message.sender === 'agent' && (message.status ?? 'sending') === 'failed')
    .sort(porHorario);
}

export function SendErrorBanner({ messages, onSendMessage, className }: SendErrorBannerProps) {
  const falhas = useMemo(() => falhasDoAgente(messages), [messages]);
  // Identidade do conjunto de falhas: dispensar vale para ESTE conjunto; outra falha muda a
  // assinatura e o banner volta (cartão: "esconde até surgir outra falha").
  const assinatura = falhas.map((message) => message.id).join('|');
  const [dispensada, setDispensada] = useState<string | null>(null);

  if (falhas.length === 0 || dispensada === assinatura) return null;

  const ultima = falhas[falhas.length - 1];
  const podeReenviar = ultima.type === 'text';

  return (
    <div
      role="alert"
      data-testid="send-error-banner"
      className={cn(
        'mx-3 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2',
        className,
      )}
    >
      <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-[hsl(var(--destructive-text))]" />
      <span className="text-sm text-[hsl(var(--destructive-text))]">
        {falhas.length} {falhas.length === 1 ? 'mensagem não foi enviada' : 'mensagens não foram enviadas'}
      </span>
      {podeReenviar && (
        <Button type="button" variant="outline" size="sm" onClick={() => onSendMessage(ultima.content)}>
          Enviar de novo
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto"
        onClick={() => setDispensada(assinatura)}
      >
        Dispensar
      </Button>
    </div>
  );
}
