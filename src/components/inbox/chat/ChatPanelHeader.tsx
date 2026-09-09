import { cn } from '@/lib/utils';
import { memo } from 'react';
import { Conversation } from '@/types/chat';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { TypingIndicatorCompact } from '../TypingIndicator';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { SLAIndicator } from '../SLAIndicator';
import { ChatHeaderToolbar } from './ChatHeaderToolbar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MoreVertical, Tag, Archive, CheckCircle, Clock, ArrowRight, ArrowLeft, ExternalLink, XCircle, Phone, Video } from 'lucide-react';
import { openChatPopup } from '@/lib/popupManager';
import { toast } from '@/hooks/ui/use-toast';

interface ChatMessage { id: string; content: string; sender: string; timestamp: string; }
type ActiveTool = 'chatSearch' | 'objections' | 'university' | 'aiAssistant' | 'summary' | null;

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
  onStartCall: () => void;
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
  lastMessages?: string[];
  allMessages?: ChatMessage[];
  onSelectSuggestion?: (text: string) => void;
}

function ChatPanelHeaderBase({
  conversation, isContactTyping, showAIAssistant, showDetails, showSummaryPanel,
  onToggleAIAssistant, onToggleDetails, onStartCall, onOpenSearch, onOpenTransfer, onOpenSchedule,
  onBack, onGenerateSummary, isSummaryLoading, onCloseConversation, activeTool, onSetActiveTool,
}: ChatPanelHeaderProps) {
  const isMobile = useIsMobile();

  return (
    <div className="flex items-center justify-between px-3 md:px-5 h-[56px] md:h-[65px] border-b border-border bg-card shrink-0">
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
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[hsl(var(--online))] border-2 border-card" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-foreground">{conversation.contact.name}</h3>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {isContactTyping ? <TypingIndicatorCompact isVisible={true} /> : (
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--online))]" />Online</span>
            )}
            <SLAIndicator
              firstMessageAt={conversation.createdAt}
              firstResponseAt={conversation.firstResponseAt ?? null}
              firstResponseMinutes={5}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-10 w-10 border border-border/30 text-muted-foreground hover:text-foreground hover:bg-muted" onClick={onStartCall} aria-label="Ligar">
            <Phone className="w-[18px] h-[18px]" />
          </Button>
        </TooltipTrigger><TooltipContent side="bottom">Ligar</TooltipContent></Tooltip>

        <Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-10 w-10 border border-border/30 text-muted-foreground hover:text-foreground hover:bg-muted" onClick={() => toast({ title: 'Em breve', description: 'Videochamada estará disponível em breve.' })} aria-label="Videochamada">
            <Video className="w-[18px] h-[18px]" />
          </Button>
        </TooltipTrigger><TooltipContent side="bottom">Videochamada</TooltipContent></Tooltip>

        <Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-10 w-10 border border-border/30 text-muted-foreground hover:text-foreground hover:bg-muted" onClick={onOpenTransfer} aria-label="Transferir">
            <ArrowRight className="w-[18px] h-[18px]" />
          </Button>
        </TooltipTrigger><TooltipContent side="bottom">Transferir</TooltipContent></Tooltip>

        <ChatHeaderToolbar
          activeTool={activeTool} showAIAssistant={showAIAssistant} showDetails={showDetails}
          showSummaryPanel={showSummaryPanel} isSummaryLoading={isSummaryLoading}
          onOpenSearch={onOpenSearch} onSetActiveTool={onSetActiveTool}
          onToggleAIAssistant={onToggleAIAssistant} onToggleDetails={onToggleDetails}
          onGenerateSummary={onGenerateSummary}
        />

        <DropdownMenu>
          <Tooltip><TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 border border-border/30 text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Mais ações">
                <MoreVertical className="w-[18px] h-[18px]" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger><TooltipContent side="bottom">Mais ações</TooltipContent></Tooltip>
          <DropdownMenuContent align="end" className="w-48 bg-popover border-border">
            <DropdownMenuItem onClick={() => openChatPopup(conversation.contact.id, conversation.contact.name)}>
              <ExternalLink className="w-4 h-4 mr-2" />Abrir em popup
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem><Tag className="w-4 h-4 mr-2" />Adicionar tag</DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenTransfer}><ArrowRight className="w-4 h-4 mr-2" />Transferir</DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenSchedule}><Clock className="w-4 h-4 mr-2" />Agendar mensagem</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem><CheckCircle className="w-4 h-4 mr-2" />Marcar como resolvido</DropdownMenuItem>
            <DropdownMenuItem><Archive className="w-4 h-4 mr-2" />Arquivar</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onCloseConversation} className="text-destructive focus:text-destructive">
              <XCircle className="w-4 h-4 mr-2" />Encerrar Conversa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export const ChatPanelHeader = memo(ChatPanelHeaderBase);
