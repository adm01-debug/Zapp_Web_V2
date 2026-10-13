import { memo } from 'react';
import { Clock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/types/chat';
import { offlineSendQueue, type OfflineQueuedMessage } from '@/lib/offlineQueue';

/**
 * Sentinela local (t_fa2f8515 / PD-63) do balão que ficou na fila offline.
 *
 * `messages.status` é `text` livre no banco, mas este valor NUNCA vem do servidor:
 * é gravado pelo próprio painel em `paraMensagemAguardandoRede`. A bolha existe
 * SÓ enquanto o item está na fila do usuário — quando a fila drena (envio saiu) o
 * item é removido e o balão desaparece.
 */
export const STATUS_AGUARDANDO_REDE = 'aguardando-rede';

/**
 * Converte um item da fila offline num `Message` para o virtualizador do chat.
 * `id` e `client_message_id` recebem o `clientMessageId`: é a chave estável que a
 * linha no servidor também carrega (`messages.client_message_id`, item 024), então
 * a bolha sintética some sozinha quando o envio real aparece na lista.
 */
// eslint-disable-next-line react-refresh/only-export-components -- o mapeamento item→Message é contrato do próprio balão (t_fa2f8515) e precisa ficar ao lado do componente que o renderiza.
export function paraMensagemAguardandoRede(item: OfflineQueuedMessage): Message {
  return {
    id: item.clientMessageId,
    content: item.content,
    created_at: new Date(item.enqueuedAt).toISOString(),
    sender: 'agent',
    timestamp: new Date(item.enqueuedAt),
    type: item.messageType as Message['type'],
    mediaUrl: item.mediaUrl ?? undefined,
    status: STATUS_AGUARDANDO_REDE,
    client_message_id: item.clientMessageId,
    contact_id: item.contactId,
  };
}

interface MessageBubbleAguardandoRedeProps {
  message: Message;
  /** Remoção do item na fila; por padrão cancela no próprio outbox offline. */
  onCancel?: (clientMessageId: string) => void;
}

/**
 * Balão de mensagem redigida sem rede: o app NÃO pode dizer "enviado" (nada saiu),
 * então mostra "Aguardando rede" — o mesmo texto que o rodapé de conexão usa — e
 * oferece "Cancelar" para tirar o item da fila antes de reconectar.
 */
export const MessageBubbleAguardandoRede = memo(function MessageBubbleAguardandoRede({
  message,
  onCancel,
}: MessageBubbleAguardandoRedeProps) {
  const cancelar = () => {
    if (onCancel) {
      onCancel(message.id);
      return;
    }
    void offlineSendQueue.remove(message.id).catch(() => {
      /* item já saiu da fila ou o disco recusou: o balão segue até a próxima leitura */
    });
  };

  return (
    <div className="flex w-full justify-end px-3 py-1" data-testid="bolha-aguardando-rede">
      <div
        className={cn(
          'max-w-[68%] rounded-2xl rounded-br-sm px-3.5 py-2 shadow-sm',
          'bg-primary text-primary-foreground opacity-90'
        )}
      >
        {message.content && (
          <p className="text-sm whitespace-pre-wrap leading-[1.45]">{message.content}</p>
        )}
        <div className="mt-1 flex items-center justify-end gap-2">
          <span className="flex items-center gap-1 text-2xs font-medium">
            <Clock className="w-3 h-3 motion-safe:animate-pulse" aria-hidden="true" />
            Aguardando rede
          </span>
          <button
            type="button"
            onClick={cancelar}
            title="Cancelar envio desta mensagem"
            aria-label="Cancelar envio desta mensagem"
            className={cn(
              'flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-2xs font-medium',
              'bg-primary-foreground/15 text-primary-foreground',
              'hover:bg-primary-foreground/25 motion-safe:transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-foreground'
            )}
          >
            <X className="w-3 h-3" aria-hidden="true" />
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
});
