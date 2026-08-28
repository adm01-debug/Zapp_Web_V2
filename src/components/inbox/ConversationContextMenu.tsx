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
  Archive,
  Pin,
  PinOff,
  Star,
  StarOff,
  Check,
  RotateCcw,
  ArrowRight,
  Tag,
  Users,
  Clock,
  Bell,
  BellOff,
  Trash2,
  MessageSquare,
  AlertTriangle,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface ConversationContextMenuProps {
  children: ReactNode;
  conversationId: string;
  contactName: string;
  isPinned?: boolean;
  isStarred?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  onPin?: (id: string) => void;
  onUnpin?: (id: string) => void;
  onStar?: (id: string) => void;
  onUnstar?: (id: string) => void;
  onMute?: (id: string) => void;
  onUnmute?: (id: string) => void;
  onArchive?: (id: string) => void;
  onMarkAsRead?: (id: string) => void;
  onMarkAsUnread?: (id: string) => void;
  onTransfer?: (id: string) => void;
  onAddTag?: (id: string) => void;
  onAssign?: (id: string) => void;
  onSnooze?: (id: string, duration: string) => void;
  onDelete?: (id: string) => void;
  onSetPriority?: (id: string, priority: 'high' | 'medium' | 'low') => void;
  onOpenSummary?: (id: string) => void;
}

export function ConversationContextMenu({
  children,
  conversationId,
  contactName,
  isPinned = false,
  isStarred = false,
  isMuted = false,
  isArchived = false,
  onPin,
  onUnpin,
  onStar,
  onUnstar,
  onMute,
  onUnmute,
  onArchive,
  onMarkAsRead,
  onMarkAsUnread,
  onTransfer,
  onAddTag,
  onAssign,
  onSnooze,
  onDelete,
  onSetPriority,
  onOpenSummary,
}: ConversationContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56 bg-card border-border/50 shadow-xl">
        {/* Header */}
        <div className="px-2 py-1.5 border-b border-border/50">
          <p className="text-sm font-medium text-foreground truncate">{contactName}</p>
          <p className="text-xs text-muted-foreground">Ações da conversa</p>
        </div>

        {/* Quick Actions */}
        <ContextMenuItem
          onClick={() => onMarkAsRead?.(conversationId)}
          className="gap-2 cursor-pointer"
        >
          <Check className="w-4 h-4" />
          Marcar como lido
          <ContextMenuShortcut>⌘L</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => onMarkAsUnread?.(conversationId)}
          className="gap-2 cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          Marcar como não lido
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Organization */}
        <ContextMenuItem
          onClick={() => isPinned ? onUnpin?.(conversationId) : onPin?.(conversationId)}
          className="gap-2 cursor-pointer"
        >
          {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
          {isPinned ? 'Desafixar' : 'Fixar no topo'}
          <ContextMenuShortcut>⌘P</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => isStarred ? onUnstar?.(conversationId) : onStar?.(conversationId)}
          className="gap-2 cursor-pointer"
        >
          {isStarred ? <StarOff className="w-4 h-4" /> : <Star className="w-4 h-4" />}
          {isStarred ? 'Remover favorito' : 'Favoritar'}
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => isMuted ? onUnmute?.(conversationId) : onMute?.(conversationId)}
          className="gap-2 cursor-pointer"
        >
          {isMuted ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          {isMuted ? 'Ativar notificações' : 'Silenciar'}
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Tags & Assignment */}
        <ContextMenuItem
          onClick={() => onAddTag?.(conversationId)}
          className="gap-2 cursor-pointer"
        >
          <Tag className="w-4 h-4" />
          Adicionar tag
          <ContextMenuShortcut>⌘T</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => onAssign?.(conversationId)}
          className="gap-2 cursor-pointer"
        >
          <Users className="w-4 h-4" />
          Atribuir a agente
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => onTransfer?.(conversationId)}
          className="gap-2 cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          Transferir
          <ContextMenuShortcut>⌘⇧T</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Priority */}
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2">
            <AlertTriangle className="w-4 h-4" />
            Definir prioridade
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-40 bg-card border-border/50">
            <ContextMenuItem
              onClick={() => onSetPriority?.(conversationId, 'high')}
              className="gap-2 cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-destructive" />
              Alta
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onSetPriority?.(conversationId, 'medium')}
              className="gap-2 cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-warning" />
              Média
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onSetPriority?.(conversationId, 'low')}
              className="gap-2 cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-success" />
              Baixa
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        {/* Snooze */}
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2">
            <Clock className="w-4 h-4" />
            Adiar
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48 bg-card border-border/50">
            <ContextMenuItem
              onClick={() => onSnooze?.(conversationId, '1h')}
              className="gap-2 cursor-pointer"
            >
              Em 1 hora
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onSnooze?.(conversationId, '3h')}
              className="gap-2 cursor-pointer"
            >
              Em 3 horas
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onSnooze?.(conversationId, 'tomorrow')}
              className="gap-2 cursor-pointer"
            >
              Amanhã às 9h
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onSnooze?.(conversationId, 'nextweek')}
              className="gap-2 cursor-pointer"
            >
              Próxima semana
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        {/* AI Summary */}
        <ContextMenuItem
          onClick={() => onOpenSummary?.(conversationId)}
          className="gap-2 cursor-pointer"
        >
          <MessageSquare className="w-4 h-4" />
          Ver resumo IA
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Archive & Delete */}
        <ContextMenuItem
          onClick={() => onArchive?.(conversationId)}
          className="gap-2 cursor-pointer"
        >
          <Archive className="w-4 h-4" />
          {isArchived ? 'Desarquivar' : 'Arquivar'}
          <ContextMenuShortcut>⌘E</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => onDelete?.(conversationId)}
          className="gap-2 cursor-pointer text-destructive"
        >
          <Trash2 className="w-4 h-4" />
          Excluir conversa
          <ContextMenuShortcut>⌘⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
