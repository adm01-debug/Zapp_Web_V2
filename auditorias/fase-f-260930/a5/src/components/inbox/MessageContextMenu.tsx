import { ReactNode } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Reply,
  Forward,
  Copy,
  Star,
  Pin,
  Trash2,
  Flag,
  Volume2,
  Download,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Message } from '@/types/chat';

interface MessageContextMenuProps {
  children: ReactNode;
  message: Message;
  onReply?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onCopy?: (content: string) => void;
  onStar?: (messageId: string) => void;
  onPin?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onReport?: (messageId: string) => void;
  onSpeak?: (content: string, messageId: string) => void;
  onDownload?: (mediaUrl: string) => void;
  onScheduleReply?: (message: Message) => void;
  onMarkAsRead?: (messageId: string) => void;
  onMarkAsUnread?: (messageId: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
}

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export function MessageContextMenu({
  children,
  message,
  onReply,
  onForward,
  onCopy,
  onStar,
  onPin,
  onDelete,
  onReport,
  onSpeak,
  onDownload,
  onScheduleReply,
  onMarkAsRead,
  onMarkAsUnread,
  onReact,
}: MessageContextMenuProps) {
  const hasMedia = message.type !== 'text' && message.mediaUrl;
  const isFromAgent = message.sender === 'agent';

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56 bg-card border-border/50 shadow-xl">
        {/* Quick Reactions */}
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/50">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-lg hover:scale-125"
              onClick={() => onReact?.(message.id, emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Main Actions */}
        <ContextMenuItem
          onClick={() => onReply?.(message)}
          className="gap-2 cursor-pointer"
        >
          <Reply className="w-4 h-4" />
          Responder
          <ContextMenuShortcut>⌘R</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => onForward?.(message)}
          className="gap-2 cursor-pointer"
        >
          <Forward className="w-4 h-4" />
          Encaminhar
          <ContextMenuShortcut>⌘F</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => onCopy?.(message.content)}
          className="gap-2 cursor-pointer"
        >
          <Copy className="w-4 h-4" />
          Copiar texto
          <ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Text-to-Speech */}
        {message.type === 'text' && (
          <ContextMenuItem
            onClick={() => onSpeak?.(message.content, message.id)}
            className="gap-2 cursor-pointer"
          >
            <Volume2 className="w-4 h-4" />
            Ouvir mensagem
          </ContextMenuItem>
        )}

        {/* Media Download - BLOCKED */}
        {hasMedia && (
          <ContextMenuItem
            onClick={() => {
              import('sonner').then(({ toast }) => toast.error('🔒 Download bloqueado por política de segurança'));
            }}
            className="gap-2 cursor-pointer opacity-50"
          >
            <Download className="w-4 h-4" />
            Download Bloqueado 🔒
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />

        {/* Organization Actions */}
        <ContextMenuItem
          onClick={() => onStar?.(message.id)}
          className="gap-2 cursor-pointer"
        >
          <Star className="w-4 h-4" />
          Favoritar mensagem
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => onPin?.(message.id)}
          className="gap-2 cursor-pointer"
        >
          <Pin className="w-4 h-4" />
          Fixar mensagem
        </ContextMenuItem>

        {/* Schedule Reply */}
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2">
            <Clock className="w-4 h-4" />
            Responder depois
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48 bg-card border-border/50">
            <ContextMenuItem
              onClick={() => onScheduleReply?.(message)}
              className="gap-2 cursor-pointer"
            >
              Em 1 hora
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onScheduleReply?.(message)}
              className="gap-2 cursor-pointer"
            >
              Em 3 horas
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onScheduleReply?.(message)}
              className="gap-2 cursor-pointer"
            >
              Amanhã
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onScheduleReply?.(message)}
              className="gap-2 cursor-pointer"
            >
              Escolher data/hora...
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        {/* Status Actions */}
        <ContextMenuItem
          onClick={() => onMarkAsRead?.(message.id)}
          className="gap-2 cursor-pointer"
        >
          <CheckCircle className="w-4 h-4" />
          Marcar como lido
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => onMarkAsUnread?.(message.id)}
          className="gap-2 cursor-pointer"
        >
          <XCircle className="w-4 h-4" />
          Marcar como não lido
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Danger Zone */}
        {!isFromAgent && (
          <ContextMenuItem
            onClick={() => onReport?.(message.id)}
            className="gap-2 cursor-pointer text-warning"
          >
            <Flag className="w-4 h-4" />
            Reportar mensagem
          </ContextMenuItem>
        )}

        {isFromAgent && (
          <ContextMenuItem
            onClick={() => onDelete?.(message.id)}
            className="gap-2 cursor-pointer text-destructive"
          >
            <Trash2 className="w-4 h-4" />
            Excluir mensagem
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
