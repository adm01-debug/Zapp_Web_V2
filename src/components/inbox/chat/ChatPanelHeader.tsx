import { cn } from '@/lib/utils';
import { memo, useState } from 'react';
import { Conversation } from '@/types/chat';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TypingIndicatorCompact } from '../TypingIndicator';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { SLAIndicator } from '../SLAIndicator';
import { RealtimeCollaboration } from '../RealtimeCollaboration';
import { CONTACT_TYPE_CONFIG } from '@/components/contacts/contactTypeConfig';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  MoreVertical, Tag, Archive, CheckCircle, Clock, ArrowRight, ArrowLeft, ExternalLink, XCircle,
  Phone, Video, UserPlus, Star, Search, Radar, GraduationCap, FileText, Info, Loader2,
} from 'lucide-react';
import { VisionIcon } from '../ai-tools/VisionIcon';
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
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

function ChatPanelHeaderBase({
  conversation, isContactTyping, showAIAssistant, showDetails, showSummaryPanel,
  onToggleAIAssistant, onToggleDetails, onStartCall, onOpenSearch, onOpenTransfer, onOpenSchedule,
  onBack, onGenerateSummary, isSummaryLoading, onCloseConversation, activeTool, onSetActiveTool,
  isFavorite, onToggleFavorite,
}: ChatPanelHeaderProps) {
  const isMobile = useIsMobile();
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const typeConfig = conversation.contact.contact_type ? CONTACT_TYPE_CONFIG[conversation.contact.contact_type] : null;
  const isVip = (conversation.tags ?? []).some(t => t.toLowerCase() === 'vip');
  const isHighPriority = conversation.priority === 'high';

  return (
    <div className="flex items-center justify-between px-3 md:px-5 h-[72px] border-b border-border bg-card shrink-0">
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
          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[hsl(var(--online))] border-2 border-card" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-lg font-bold text-foreground truncate">{conversation.contact.name}</h3>
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
                className="flex items-center gap-1 h-5 px-1.5 rounded-md bg-muted text-[11px] text-muted-foreground hover:text-foreground shrink-0"
                aria-label={`Atribuído a ${conversation.assignedTo.name} — clique para transferir`}
              >
                <Avatar className="w-3.5 h-3.5">
                  <AvatarImage src={conversation.assignedTo.avatar ?? undefined} alt={conversation.assignedTo.name || 'Agente'} />
                  <AvatarFallback className="text-[8px]">{conversation.assignedTo.name[0]}</AvatarFallback>
                </Avatar>
                {conversation.assignedTo.name}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground flex-wrap">
            {isContactTyping ? <TypingIndicatorCompact isVisible={true} /> : (
              <span className="flex items-center gap-1.5 font-medium text-success"><span className="w-1.5 h-1.5 rounded-full bg-success" />Online</span>
            )}
            {typeConfig && (
              <>
                <span>·</span>
                <span className="text-muted-foreground">{typeConfig.label}</span>
              </>
            )}
            {isVip && <Badge variant="outline" className="h-5 px-2 rounded-full text-[11px] font-semibold bg-warning/15 text-warning border-warning/40">VIP</Badge>}
            {isHighPriority && <Badge variant="outline" className="h-5 px-2 rounded-full text-[11px] font-semibold bg-destructive/15 text-destructive border-destructive/40">Alta prioridade</Badge>}
            <SLAIndicator
              firstMessageAt={conversation.createdAt}
              firstResponseAt={conversation.firstResponseAt ?? null}
              firstResponseMinutes={5}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-[10px] border border-border text-muted-foreground hover:text-foreground hover:bg-muted" onClick={onStartCall} aria-label="Ligar">
            <Phone className="w-[18px] h-[18px]" />
          </Button>
        </TooltipTrigger><TooltipContent side="bottom">Ligar</TooltipContent></Tooltip>

        <Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-[10px] border border-border text-muted-foreground hover:text-foreground hover:bg-muted" onClick={() => toast({ title: 'Em breve', description: 'Videochamada estará disponível em breve.' })} aria-label="Videochamada">
            <Video className="w-[18px] h-[18px]" />
          </Button>
        </TooltipTrigger><TooltipContent side="bottom">Videochamada</TooltipContent></Tooltip>

        <Popover open={participantsOpen} onOpenChange={setParticipantsOpen}>
          <Tooltip><TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-[10px] border border-border text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Adicionar participante">
                <UserPlus className="w-[18px] h-[18px]" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger><TooltipContent side="bottom">Adicionar participante</TooltipContent></Tooltip>
          <PopoverContent align="end" className="w-80">
            <RealtimeCollaboration contactId={conversation.contact.id} />
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <Tooltip><TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-[10px] border border-border text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Mais ações">
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
