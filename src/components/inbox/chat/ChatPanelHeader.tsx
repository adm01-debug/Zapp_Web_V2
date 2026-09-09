import { memo } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  ExternalLink,
  FileText,
  GraduationCap,
  Info,
  Loader2,
  MoreVertical,
  PanelRightOpen,
  Phone,
  Radar,
  Search,
  Sparkles,
  Star,
  XCircle,
} from 'lucide-react';
import type { Conversation } from '@/types/chat';
import { CONTACT_TYPE_CONFIG } from '@/components/contacts/contactTypeConfig';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TypingIndicatorCompact } from '../TypingIndicator';
import { SLAIndicator } from '../SLAIndicator';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { getInitials } from '@/lib/avatar-colors';
import { openChatPopup } from '@/lib/popupManager';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  content: string;
  sender: string;
  timestamp: string;
}

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

const STATUS_LABELS = {
  open: { label: 'Em atendimento', className: 'bg-success' },
  waiting: { label: 'Aguardando', className: 'bg-warning' },
  resolved: { label: 'Resolvida', className: 'bg-muted-foreground' },
  archived: { label: 'Arquivada', className: 'bg-muted-foreground' },
} as const;

function HeaderAction({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClick}
          disabled={!onClick}
          aria-label={label}
          aria-pressed={active || undefined}
          className={cn(
            'h-10 w-10 shrink-0 rounded-[10px] border border-border bg-card text-muted-foreground shadow-none',
            'hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
            active && 'border-primary/40 bg-accent text-foreground',
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function ChatPanelHeaderBase({
  conversation,
  isContactTyping,
  showAIAssistant,
  showDetails,
  showSummaryPanel,
  onSetActiveTool,
  onToggleAIAssistant,
  onToggleDetails,
  onStartCall,
  onOpenSearch,
  onOpenTransfer,
  onOpenSchedule,
  onBack,
  onGenerateSummary,
  isSummaryLoading,
  onCloseConversation,
  isFavorite = false,
  onToggleFavorite,
}: ChatPanelHeaderProps) {
  const isMobile = useIsMobile();
  const tags = [...(conversation.tags ?? []), ...(conversation.contact.tags ?? [])]
    .map((tag) => tag.toLocaleLowerCase('pt-BR'));
  const isVip = tags.includes('vip');
  const contactType = conversation.contact.contact_type
    ? CONTACT_TYPE_CONFIG[conversation.contact.contact_type]
    : undefined;
  const statusKey = conversation.contact.conversation_status
    ?? (conversation.status === 'waiting' ? 'waiting' : conversation.status === 'resolved' ? 'resolved' : 'open');
  const status = STATUS_LABELS[statusKey] ?? STATUS_LABELS.open;

  return (
    <header className="flex h-[72px] shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-3 md:px-4">
      <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
        {isMobile && onBack && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-xl"
            onClick={onBack}
            aria-label="Voltar para conversas"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}

        <Avatar className="h-12 w-12 shrink-0 ring-1 ring-border">
          <AvatarImage src={conversation.contact.avatar ?? undefined} alt="" />
          <AvatarFallback className="bg-primary/15 text-sm font-semibold text-primary">
            {getInitials(conversation.contact.name || '?')}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="truncate text-lg font-bold tracking-tight text-foreground">
              {conversation.contact.name || 'Contato sem nome'}
            </h2>
            {onToggleFavorite && (
              <button
                type="button"
                onClick={onToggleFavorite}
                aria-label={isFavorite ? 'Remover contato dos favoritos' : 'Adicionar contato aos favoritos'}
                aria-pressed={isFavorite}
                className="shrink-0 rounded-md p-1 text-muted-foreground outline-none hover:bg-muted hover:text-warning focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Star className={cn('h-4 w-4', isFavorite && 'fill-warning text-warning')} />
              </button>
            )}
          </div>

          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-xs text-muted-foreground">
            {isContactTyping ? (
              <TypingIndicatorCompact isVisible />
            ) : (
              <span className="flex shrink-0 items-center gap-1.5">
                <span className={cn('h-1.5 w-1.5 rounded-full', status.className)} aria-hidden="true" />
                {status.label}
              </span>
            )}
            {contactType && (
              <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-foreground">
                {contactType.label}
              </span>
            )}
            {isVip && (
              <span className="shrink-0 rounded-md border border-warning/30 bg-warning/10 px-1.5 py-0.5 font-medium text-warning">
                VIP
              </span>
            )}
            {conversation.priority === 'high' && (
              <span className="hidden shrink-0 rounded-md border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive sm:inline-flex">
                Alta prioridade
              </span>
            )}
            <SLAIndicator
              firstMessageAt={conversation.createdAt}
              firstResponseAt={conversation.firstResponseAt ?? null}
              firstResponseMinutes={5}
            />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
        <HeaderAction label="Ligar" onClick={onStartCall}>
          <Phone className="h-[18px] w-[18px]" />
        </HeaderAction>
        <HeaderAction label="Transferir conversa" onClick={onOpenTransfer}>
          <ArrowRight className="h-[18px] w-[18px]" />
        </HeaderAction>
        <HeaderAction label="Detalhes do contato" onClick={onToggleDetails} active={showDetails}>
          <PanelRightOpen className="h-[18px] w-[18px]" />
        </HeaderAction>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-[10px] border border-border bg-card text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
                  aria-label="Mais ações da conversa"
                >
                  <MoreVertical className="h-[18px] w-[18px]" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">Mais ações</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-60 border-border bg-popover">
            <DropdownMenuItem onClick={onOpenSearch}>
              <Search className="mr-2 h-4 w-4" />Buscar na conversa
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSetActiveTool?.('objections')}>
              <Radar className="mr-2 h-4 w-4" />Monitorar objeções
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSetActiveTool?.('university')}>
              <GraduationCap className="mr-2 h-4 w-4" />Ajuda dos universitários
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleAIAssistant}>
              <Sparkles className="mr-2 h-4 w-4" />{showAIAssistant ? 'Fechar assistente' : 'Abrir assistente IA'}
            </DropdownMenuItem>
            {onGenerateSummary && (
              <DropdownMenuItem onClick={onGenerateSummary} disabled={isSummaryLoading}>
                {isSummaryLoading
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <FileText className="mr-2 h-4 w-4" />}
                {showSummaryPanel ? 'Fechar resumo' : 'Resumo da conversa'}
              </DropdownMenuItem>
            )}
            {onToggleDetails && (
              <DropdownMenuItem onClick={onToggleDetails}>
                <Info className="mr-2 h-4 w-4" />Detalhes do contato
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenSchedule}>
              <Clock className="mr-2 h-4 w-4" />Agendar mensagem
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openChatPopup(conversation.contact.id, conversation.contact.name)}>
              <ExternalLink className="mr-2 h-4 w-4" />Abrir em popup
            </DropdownMenuItem>
            {onCloseConversation && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onCloseConversation} className="text-destructive focus:text-destructive">
                  <XCircle className="mr-2 h-4 w-4" />Encerrar conversa
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export const ChatPanelHeader = memo(ChatPanelHeaderBase);
