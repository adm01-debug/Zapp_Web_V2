import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { HOVER_REVEAL_TAP } from '../hoverActions';
import { Reply, Forward, Copy, MoreVertical, Trash2, CheckCheck, EyeOff, Pencil, History } from 'lucide-react';
import { Message } from '@/types/chat';
import { TextToSpeechButton } from '../TextToSpeechButton';
import { MessageSendHistorySheet } from './MessageSendHistorySheet';
import { MessageActionMenuItems } from './MessageActionMenuItems';
import { markUnreadInZapp } from '@/services/message-unread.service';
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
  // SL-198 (inventário 061): o "Histórico de envio" (MessageSendHistorySheet) existia
  // pronto e testado, mas nenhuma tela o importava — o agente nunca via as tentativas
  // de entrega. O estado do sheet mora aqui, dono do menu "⋮" que o abre.
  const [historyOpen, setHistoryOpen] = useState(false);
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
      // QA-SWEEP: o toast dizia "deletada para todos" só por `externalId` ser
      // truthy, mesmo quando a chamada à Evolution API abaixo falhava (ou nem
      // era tentada) — o contato continuava vendo a mensagem no WhatsApp dele
      // enquanto o Zapp confirmava sucesso completo. `evolutionDeletedOk` guarda
      // o resultado real da tentativa para o toast refletir o que de fato aconteceu.
      let evolutionDeletedOk = false;
      if (externalId && instanceName && contactJid) {
        try {
          await deleteMessage(instanceName, externalId, contactJid, isSent);
          evolutionDeletedOk = true;
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

      if (!externalId) {
        toast.success('Mensagem removida');
      } else if (evolutionDeletedOk) {
        toast.success('Mensagem deletada para todos');
      } else {
        toast.warning('Mensagem removida apenas no Zapp — o contato pode continuar vendo ela no WhatsApp dele');
      }
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
    // Estado do Zapp primeiro (é o que o selo e a lista leem). Depois, bônus no
    // WhatsApp pela ação `mark-unread` da edge (evolution-api): na Evolution v2 ela
    // chama /chat/markChatUnread; na Evolution GO, que não tem essa rota, responde
    // 200 com `notSupported` — isso NÃO é erro para o atendente, a marcação do Zapp
    // já valeu. Falha do provedor também só vira log.
    const local = await markUnreadInZapp(message);
    if (local === 'erro') {
      toast.error('Erro ao marcar como não lida');
      return;
    }
    if (local === 'sem_mensagem_do_contato') {
      toast.info('Nenhuma mensagem do cliente para marcar como não lida');
      return;
    }
    if (externalId && instanceName && contactJid) {
      try {
        const res = await markMessageAsUnread(instanceName, { remoteJid: contactJid, fromMe: isSent, id: externalId }) as { notSupported?: boolean } | null | undefined;
        if (res?.notSupported) log.info('Provedor sem "marcar como não lida"; mantida só no Zapp');
      } catch (err) {
        log.warn('WhatsApp não marcou como não lida; mantida no Zapp', err);
      }
    }
    toast.success('Marcada como não lida');
  }, [message, instanceName, externalId, contactJid, isSent, markMessageAsUnread]);

  const canEdit = isSent && message.type === 'text' && onEditStart && (() => {
    const ts = message.timestamp instanceof Date ? message.timestamp : new Date(message.created_at || String(message.timestamp));
    return (Date.now() - ts.getTime()) / 60000 <= 15;
  })();

  return (
    <div className={cn(
      `absolute top-1/2 -translate-y-1/2 flex items-center ${HOVER_REVEAL_TAP} transition-all duration-200 z-10`,
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
              R2-INB-021 (item 317) tirou Favoritar/Fixar/Responder depois/Reportar
              daqui enquanto não existia operação por trás. As tabelas e RPCs
              entraram (message_favorites/message_pins/message_reports,
              toggle_message_favorite, pin_message, unpin_message,
              report_message, remind_me_about_message): as quatro voltam, agora
              com handler real, em MessageActionMenuItems — montado só com o menu
              aberto, para a conversa não carregar estado que ninguém vê.
            */}
            <MessageActionMenuItems message={message} />

            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={handleMarkRead}>
              <CheckCheck className="w-4 h-4" /> Marcar como lida
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 cursor-pointer" onClick={handleMarkUnread}>
              <EyeOff className="w-4 h-4" /> Marcar como não lida
            </DropdownMenuItem>

            {/* SL-198 (inventário 061): só a mensagem do agente tem envio para
                acompanhar — a recebida não ganha a entrada. */}
            {message.sender === 'agent' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => setHistoryOpen(true)}>
                  <History className="w-4 h-4" /> Histórico de envio
                </DropdownMenuItem>
              </>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 cursor-pointer text-destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4" />
              {isSent && externalId ? 'Apagar para todos' : 'Apagar mensagem'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <MessageSendHistorySheet message={message} open={historyOpen} onOpenChange={setHistoryOpen} />
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
