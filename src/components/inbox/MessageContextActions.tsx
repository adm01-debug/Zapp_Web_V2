import { useCallback } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('MessageContextActions');
import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';
import { supabase } from '@/integrations/supabase/client';
import { Message } from '@/types/chat';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  MoreVertical,
  Pencil,
  Trash2,
  Archive,
  CheckCheck,
  EyeOff,
  Ban,
} from 'lucide-react';

interface MessageContextActionsProps {
  message: Message;
  instanceName: string;
  contactJid: string;
  onEditStart?: (message: Message) => void;
  onMessageDeleted?: (messageId: string) => void;
}

export function MessageContextActions({
  message,
  instanceName,
  contactJid,
  onEditStart,
  onMessageDeleted,
}: MessageContextActionsProps) {
  const {
    deleteMessage,
    updateMessage,
    markMessageAsRead,
    markMessageAsUnread,
    archiveChat,
    updateBlockStatus,
    isLoading,
  } = useEvolutionApi();

  const isSent = message.sender === 'agent';
  const externalId = message.external_id;

  const handleDelete = useCallback(async () => {
    try {
      // If message has external ID, also delete from WhatsApp
      if (externalId) {
        try {
          await deleteMessage(instanceName, externalId, contactJid, isSent);
        } catch {
          // WhatsApp deletion failed, but still mark locally as deleted
          log.warn('WhatsApp API delete failed, marking locally only');
        }
      }
      // Always mark as deleted in local DB
      await supabase.from('messages').update({ is_deleted: true, content: '[Mensagem apagada]' }).eq('id', message.id);
      toast.success(externalId ? 'Mensagem deletada para todos' : 'Mensagem removida');
      onMessageDeleted?.(message.id);
    } catch {
      toast.error('Erro ao deletar mensagem');
    }
  }, [instanceName, externalId, contactJid, isSent, deleteMessage, message.id, onMessageDeleted]);

  const handleMarkRead = useCallback(async () => {
    if (!externalId) return;
    try {
      await markMessageAsRead(instanceName, {
        remoteJid: contactJid,
        fromMe: isSent,
        id: externalId,
      });
      toast.success('Marcada como lida');
    } catch {
      toast.error('Erro ao marcar como lida');
    }
  }, [instanceName, externalId, contactJid, isSent, markMessageAsRead]);

  const handleMarkUnread = useCallback(async () => {
    if (!externalId) return;
    try {
      await markMessageAsUnread(instanceName, {
        remoteJid: contactJid,
        fromMe: isSent,
        id: externalId,
      });
      toast.success('Marcada como não lida');
    } catch {
      toast.error('Erro ao marcar como não lida');
    }
  }, [instanceName, externalId, contactJid, isSent, markMessageAsUnread]);

  const handleArchive = useCallback(async () => {
    try {
      await archiveChat(instanceName, {}, contactJid, true);
      toast.success('Chat arquivado');
    } catch {
      toast.error('Erro ao arquivar');
    }
  }, [instanceName, contactJid, archiveChat]);

  const handleBlock = useCallback(async () => {
    try {
      await updateBlockStatus(instanceName, contactJid, 'block');
    } catch {
      toast.error('Erro ao bloquear contato');
    }
  }, [instanceName, contactJid, updateBlockStatus]);

  const handleUnblock = useCallback(async () => {
    try {
      await updateBlockStatus(instanceName, contactJid, 'unblock');
    } catch {
      toast.error('Erro ao desbloquear contato');
    }
  }, [instanceName, contactJid, updateBlockStatus]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={isSent ? 'end' : 'start'} className="w-48">
        {isSent && message.type === 'text' && onEditStart && (() => {
          const ts = message.timestamp instanceof Date ? message.timestamp : new Date(message.created_at || String(message.timestamp));
          const minutesAgo = (Date.now() - ts.getTime()) / 60000;
          return minutesAgo <= 15;
        })() && (
          <DropdownMenuItem onClick={() => onEditStart(message)}>
            <Pencil className="w-4 h-4 mr-2" />
            Editar mensagem
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleDelete} className="text-destructive">
          <Trash2 className="w-4 h-4 mr-2" />
          {isSent && externalId ? 'Apagar para todos' : 'Apagar mensagem'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleMarkRead}>
          <CheckCheck className="w-4 h-4 mr-2" />
          Marcar como lida
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleMarkUnread}>
          <EyeOff className="w-4 h-4 mr-2" />
          Marcar como não lida
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
