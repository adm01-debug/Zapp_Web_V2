import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Reply, Forward, Copy, MoreVertical, Trash2, CheckCheck, EyeOff, Pencil } from 'lucide-react';
import { Message } from '@/types/chat';
import { TextToSpeechButton } from '../TextToSpeechButton';
import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const log = getLogger('MessageHoverToolbar');

interface MessageHoverToolbarProps {
  message: Message;
  isSent: boolean;
  instanceName?: string;
  contactJid?: string;
  ttsLoading: boolean;
  ttsPlaying: boolean;
  ttsMessageId: string | null;
  onReply: (message: Message) => void;
  onForward: (message: Message) => void;
  onCopy: (content: string) => void;
  onSpeak: (messageId: string, text: string) => void;
  onStop: () => void;
  onEditStart?: (message: Message) => void;
  onMessageDeleted: (messageId: string) => void;
}

export function MessageHoverToolbar({
  message, isSent, instanceName, contactJid,
  ttsLoading, ttsPlaying, ttsMessageId,
  onReply, onForward, onCopy, onSpeak, onStop,
  onEditStart, onMessageDeleted,
}: MessageHoverToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    deleteMessage,
    markMessageAsRead,
    markMessageAsUnread,
    isLoading,
  } = useEvolutionApi();

  const externalId = message.external_id;

  // --- Real handlers wired to Evolution API ---

  const handleDelete = useCallback(async () => {
    try {
      if (externalId && instanceName && contactJid) {
        try {
          await deleteMessage(instanceName, externalId, contactJid, isSent);
        } catch {
          log.warn('WhatsApp API delete failed, marking locally only');
        }
      }
      // PostgREST não lança: sem checar `error` a UI confirmava uma exclusão
      // que o banco rejeitou (R2-INB-014). O fallback local (Evolution API
      // fora) só é sucesso se a marcação local persistir de fato.
      const { error } = await supabase
        .from('messages')
        .update({ is_deleted: true, content: '[Mensagem apagada]' })
        .eq('id', message.id);

      if (error) {
        log.error('Falha ao marcar mensagem como deletada', error);
        toast.error('Erro ao deletar mensagem');
        return;
      }

      toast.success(externalId ? 'Mensagem deletada para todos' : 'Mensagem removida');
      onMessageDeleted(message.id);
    } catch {
      toast.error('Erro ao deletar mensagem');
    }
  }, [instanceName, externalId, contactJid, isSent, deleteMessage, message.id, onMessageDeleted]);

  const handleMarkRead = useCallback(async () => {
    if (!externalId || !instanceName || !contactJid) return;
    try {
      await markMessageAsRead(instanceName, { remoteJid: contactJid, fromMe: isSent, id: externalId });
      toast.success('Marcada como lida');
    } catch {
      toast.error('Erro ao marcar como lida');
    }
  }, [instanceName, externalId, contactJid, isSent, markMessageAsRead]);

  const handleMarkUnread = useCallback(async () => {
    if (!externalId || !instanceName || !contactJid) return;
    try {
      await markMessageAsUnread(instanceName, { remoteJid: contactJid, fromMe: isSent, id: externalId });
      toast.success('Marcada como não lida');
    } catch {
      toast.error('Erro ao marcar como não lida');
    }
  }, [instanceName, externalId, contactJid, isSent, markMessageAsUnread]);

  const canEdit = isSent && message.type === 'text' && onEditStart && (() => {
    const ts = message.timestamp instanceof Date ? message.timestamp : new Date(message.created_at || String(message.timestamp));
    return (Date.now() - ts.getTime()) / 60000 <= 15;
  })();

  return (
    <div className={cn(
      "absolute top-1/2 -translate-y-1/2 flex items-center opacity-0 group-hover:opacity-100 transition-all duration-200 z-10",
      menuOpen && "opacity-100",
      isSent ? "right-full mr-1.5" : "left-full ml-1.5"
    )}>
      <div className="flex items-center rounded-full bg-card/95 dark:bg-[hsl(var(--card)/0.95)] border border-border/40 shadow-lg backdrop-blur-sm overflow-hidden">
        <ToolbarButton onClick={() => onReply(message)} title="Responder">
          <Reply className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => onForward(message)} title="Encaminhar">
          <Forward className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => onCopy(message.content)} title="Copiar">
          <Copy className="w-3.5 h-3.5" />
        </ToolbarButton>
        {message.type === 'text' && (
          <TextToSpeechButton
            messageId={message.id}
            text={message.content}
            isLoading={ttsLoading}
            isPlaying={ttsPlaying}
            currentMessageId={ttsMessageId}
            onSpeak={onSpeak}
            onStop={onStop}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          />
        )}

        {/* ⋮ Unified menu — all actions in one place */}
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              title="Mais opções"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-52 bg-card border-border/50 shadow-xl"
            align={isSent ? 'end' : 'start'}
            sideOffset={8}
          >
            {canEdit && (
              <>
                <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onEditStart!(message)}>
                  <Pencil className="w-4 h-4" /> Editar mensagem
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}

            {/*
              R2-INB-021 (item 317): Favoritar/Fixar/Responder depois/Reportar
              saíram daqui. Eram entradas visíveis sem handler e sem nenhuma
              implementação de mensagem (tabela, hook ou serviço) — a interface
              anunciava operações que não concluía. Voltar a oferecê-las só
              quando existir a operação por trás; até então, não anunciar.
            */}
            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={handleMarkRead}>
              <CheckCheck className="w-4 h-4" /> Marcar como lida
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={handleMarkUnread}>
              <EyeOff className="w-4 h-4" /> Marcar como não lida
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 cursor-pointer text-destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4" />
              {isSent && externalId ? 'Apagar para todos' : 'Apagar mensagem'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function ToolbarButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
    >
      {children}
    </button>
  );
}
