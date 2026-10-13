import { cn } from '@/lib/utils';
import { memo, useState } from 'react';
import { Conversation } from '@/types/chat';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TypingIndicatorCompact } from '../TypingIndicator';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { SLAIndicator } from '../SLAIndicator';
import { useApplicableSLA } from '@/hooks/sla/useApplicableSLA';
import { CONTACT_TYPE_CONFIG } from '@/components/contacts/contactTypeConfig';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  MoreVertical, Archive, ArchiveRestore, RotateCcw, CheckCircle, Clock, ArrowRight, ArrowLeft, ExternalLink, XCircle,
  Star, Search, Radar, GraduationCap, FileText, Info, Loader2,
} from 'lucide-react';
import { ConversationReopenDialog } from '../conversation-list/ConversationReopenDialog';
import { VisionIcon } from '../ai-tools/VisionIcon';
import { openChatPopup } from '@/lib/popupManager';
import { PinnedConversationsStack, PinnedChatItem } from './PinnedConversationsStack';

interface ChatMessage { id: string; content: string; sender: string; timestamp: string; }
type ActiveTool = 'chatSearch' | 'objections' | 'university' | 'aiAssistant' | 'summary' | null;

/** Prazo seguro de 1ª resposta enquanto o prazo aplicável ainda não chegou do hook. */
const DEFAULT_FIRST_RESPONSE_MINUTES = 5;

interface ChatPanelHeaderProps {
  conversation: Conversation;
  isContactTyping: boolean;
  showAIAssistant: boolean;
  showDetails?: boolean;
  showSummaryPanel?: boolean;
  activeTool?: ActiveTool;
  onSetActiveTool?: (tool: ActiveTool) => void;
  voiceId: string;
  speed: number;
  onToggleAIAssistant: () => void;
  onToggleDetails?: () => void;
  onOpenSearch: () => void;
  onOpenTransfer: () => void;
  onOpenSchedule: () => void;
  onVoiceChange: (voiceId: string) => void;
  onSpeedChange: (speed: number) => void;
  onBack?: () => void;
  onGenerateSummary?: () => void;
  isSummaryLoading?: boolean;
  canGenerateSummary?: boolean;
  onCloseConversation?: () => void;
  onArchive?: () => void;
  /** Reabre (resolvida) / desarquiva (arquivada) a conversa pela RPC reopen_conversation. */
  onReopenConversation?: (contactId: string) => void | Promise<void>;
  lastMessages?: string[];
  allMessages?: ChatMessage[];
  onSelectSuggestion?: (text: string) => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  /** Conversas fixadas — exibidas no canto direito do header quando os detalhes estão fechados. */
  pinnedConversations?: PinnedChatItem[];
  onSelectPinned?: (contactId: string) => void;
}

function ChatPanelHeaderBase({
  conversation, isContactTyping, showAIAssistant, showDetails, showSummaryPanel,
  onToggleAIAssistant, onToggleDetails, onOpenSearch, onOpenTransfer, onOpenSchedule,
  onBack, onGenerateSummary, isSummaryLoading, onCloseConversation, onArchive, onReopenConversation, activeTool, onSetActiveTool,
  isFavorite, onToggleFavorite, pinnedConversations, onSelectPinned,
}: ChatPanelHeaderProps) {
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const { data: applicableSla } = useApplicableSLA({
    contactId: conversation.contact.id,
    company: conversation.contact.company ?? null,
    jobTitle: conversation.contact.job_title ?? null,
    contactType: conversation.contact.contact_type ?? null,
    queueId: conversation.queue?.id ?? conversation.contact.queue_id ?? null,
    agentId: conversation.assignedTo?.id ?? null,
  });
  const firstResponseMinutes = applicableSla?.firstResponseMinutes ?? DEFAULT_FIRST_RESPONSE_MINUTES;
  const typeConfig = conversation.contact.contact_type ? CONTACT_TYPE_CONFIG[conversation.contact.contact_type] : null;
  const isVip = (conversation.tags ?? []).some(t => t.toLowerCase() === 'vip');
  const isHighPriority = conversation.priority === 'high';
  const showPinnedStack = !showDetails && !isMobile
    && !!pinnedConversations && pinnedConversations.length > 0 && !!onSelectPinned;

  // Estado persistido do contato (ADR-005) — os mesmos literais que chipCounts usa
  // para os chips Resolvidas/Arquivadas, então o item de menu aparece exatamente
  // quando a conversa está fora do fluxo ativo.
  const statusConversa = conversation.contact.conversation_status ?? null;
  const conversaArquivada = statusConversa === 'archived';
  const conversaResolvida = statusConversa === 'resolved';
  const podeReabrir = !!onReopenConversation && (conversaArquivada || conversaResolvida);
  const rotuloReabrir = conversaArquivada ? 'Desarquivar conversa' : 'Reabrir conversa';

  const confirmarReabertura = async () => {
    if (!onReopenConversation) return;
    setReopening(true);
    setReopenError(null);
    try {
      await onReopenConversation(conversation.contact.id);
      setReopenOpen(false);
    } catch {
      setReopenError('Não foi possível reabrir a conversa. Tente novamente.');
    } finally {
      setReopening(false);
    }
  };

  return (
    <div className="flex items-center justify-between px-3 md:px-5 h-[72px] border-b border-border bg-inbox-panel shrink-0">
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        {isMobile && onBack && (
          <Button variant="ghost" size="icon" className="w-8 h-8 rounded-xl shrink-0 touch-manipulation" onClick={onBack} aria-label="Voltar">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        )}
        <div className="relative shrink-0">
          <Avatar className="w-12 h-12 ring-2 ring-border">
            <AvatarImage src={conversation.contact.avatar ?? undefined} alt={conversation.contact.name || 'Avatar'} />
            <AvatarFallback className="bg-primary/15 text-primary font-semibold text-sm">
              {conversation.contact.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
            </AvatarFallback>
          </Avatar>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="text-lg font-bold text-foreground truncate" title={conversation.contact.name}>{conversation.contact.name}</h2>
            {onToggleFavorite && (
              <button
                aria-label={isFavorite ? 'Remover favorito' : 'Favoritar conversa'}
                onClick={onToggleFavorite}
                className="text-muted-foreground/40 hover:text-warning transition-colors shrink-0"
              >
                <Star className={cn('w-4 h-4', isFavorite && 'fill-warning text-warning')} />
              </button>
            )}
            {conversation.assignedTo && (
              <button
                onClick={onOpenTransfer}
                className="flex items-center gap-1 h-5 px-1.5 rounded-md bg-muted text-2xs text-muted-foreground hover:text-foreground shrink-0"
                aria-label={`Atribuído a ${conversation.assignedTo.name} — clique para transferir`}
              >
                <Avatar className="w-3.5 h-3.5">
                  <AvatarImage src={conversation.assignedTo.avatar ?? undefined} alt={conversation.assignedTo.name || 'Agente'} />
                  <AvatarFallback className="text-3xs">{conversation.assignedTo.name[0]}</AvatarFallback>
                </Avatar>
                {conversation.assignedTo.name}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground flex-wrap">
            {/* R2-INB-030: não estar digitando NÃO é sinal de presença online. Sem um
                sinal de presença do contato, o cabeçalho mostra o estado neutro
                (desconhecido) em vez de afirmar "Online"; o indicador de digitação
                continua sendo o único sinal real exibido aqui. */}
            {isContactTyping ? <TypingIndicatorCompact isVisible={true} /> : (
              <span
                data-testid="contact-presence"
                role="img"
                aria-label="Presença do contato não informada"
                title="Presença do contato não informada"
                className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40"
              />
            )}
            {typeConfig && (
              <>
                <span>·</span>
                <span className="text-muted-foreground">{typeConfig.label}</span>
              </>
            )}
            {isVip && <Badge variant="outline" className="h-5 px-2 rounded-full text-2xs font-semibold bg-warning/15 text-warning border-warning/40">VIP</Badge>}
            {isHighPriority && <Badge variant="outline" className="h-5 px-2 rounded-full text-2xs font-semibold bg-destructive/15 text-destructive border-destructive/40">Alta prioridade</Badge>}
            <SLAIndicator
              firstMessageAt={conversation.createdAt}
              firstResponseAt={conversation.firstResponseAt ?? null}
              firstResponseMinutes={firstResponseMinutes}
            />
          </div>
        </div>
      </div>

      <div className={cn('flex items-center gap-2', showPinnedStack && 'lg:flex-1 lg:justify-center lg:px-4')}>
        <DropdownMenu>
          <Tooltip><TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="chat-header-more-actions" className="h-10 w-10 rounded-[10px] border border-border text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Mais ações">
                <MoreVertical className="w-[18px] h-[18px]" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger><TooltipContent side="bottom">Mais ações</TooltipContent></Tooltip>
          <DropdownMenuContent align="end" className="w-56 bg-popover border-border">
            <DropdownMenuItem onClick={onOpenSearch}><Search className="w-4 h-4 mr-2" />Buscar na conversa (Ctrl+F)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSetActiveTool?.('objections')}><Radar className="w-4 h-4 mr-2" />Monitoramento de Objeções</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSetActiveTool?.('university')}><GraduationCap className="w-4 h-4 mr-2" />Ajuda dos Universitários</DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleAIAssistant}><VisionIcon className="w-4 h-4 mr-2" />Visão</DropdownMenuItem>
            {onGenerateSummary && (
              <DropdownMenuItem onClick={onGenerateSummary} disabled={isSummaryLoading}>
                {isSummaryLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                Resumo da conversa
              </DropdownMenuItem>
            )}
            {onToggleDetails && (
              <DropdownMenuItem onClick={onToggleDetails}><Info className="w-4 h-4 mr-2" />Detalhes do contato</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openChatPopup(conversation.contact.id, conversation.contact.name)}>
              <ExternalLink className="w-4 h-4 mr-2" />Abrir em popup
            </DropdownMenuItem>
            {/* R2-INB-021 (item 317): "Adicionar tag" saiu daqui — era item sem
                onClick e sem editor de tags no chat (as tags vivem em Contatos).
                Item de menu só volta quando a operação por trás existir. */}
            <DropdownMenuItem onClick={onOpenTransfer}><ArrowRight className="w-4 h-4 mr-2" />Transferir</DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenSchedule}><Clock className="w-4 h-4 mr-2" />Agendar mensagem</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onCloseConversation}><CheckCircle className="w-4 h-4 mr-2" />Marcar como resolvido</DropdownMenuItem>
            <DropdownMenuItem onClick={onArchive}><Archive className="w-4 h-4 mr-2" />Arquivar</DropdownMenuItem>
            {/* Reabrir/Desarquivar: só para conversa resolvida/arquivada e pela RPC
                reopen_conversation (mesma que o gatilho do contato usa). */}
            {podeReabrir && (
              <DropdownMenuItem
                onClick={() => { setReopenError(null); setReopenOpen(true); }}
                disabled={reopening}
                aria-label={rotuloReabrir}
              >
                {conversaArquivada ? <ArchiveRestore className="w-4 h-4 mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />}
                {conversaArquivada ? 'Desarquivar conversa' : 'Reabrir conversa'}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onCloseConversation} className="text-destructive focus:text-destructive">
              <XCircle className="w-4 h-4 mr-2" />Encerrar Conversa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {showPinnedStack && (
        <div className="hidden lg:flex items-center shrink-0">
          <PinnedConversationsStack
            items={pinnedConversations}
            activeId={conversation.contact.id}
            onSelect={onSelectPinned}
          />
        </div>
      )}

      <ConversationReopenDialog
        open={reopenOpen}
        onOpenChange={(open) => { if (!reopening) { setReopenOpen(open); if (!open) setReopenError(null); } }}
        action={conversaArquivada ? 'unarchive' : 'reopen'}
        contactName={conversation.contact.name ?? undefined}
        isPending={reopening}
        error={reopenError}
        onConfirm={confirmarReabertura}
      />
    </div>
  );
}

export const ChatPanelHeader = memo(ChatPanelHeaderBase);
