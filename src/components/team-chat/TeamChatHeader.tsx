import { TeamConversation } from '@/hooks/team-chat/teamChatTypes';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft,
  ArrowLeftRight,
  Users,
  User,
  UserPlus,
  PanelRightOpen,
  PanelRightClose,
  Search,
  MoreVertical,
  Archive,
  Bell,
  BellOff,
  Pin,
  BarChart2,
  Activity,
  Volume2,
} from 'lucide-react';

const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5] as const;

interface TeamChatHeaderProps {
  conversation: TeamConversation;
  showDetails?: boolean;
  voiceId: string;
  speed: number;
  showSearch: boolean;
  showStats?: boolean;
  isMuted?: boolean;
  canTransfer?: boolean;
  onBack: () => void;
  onToggleDetails?: () => void;
  onToggleSearch: () => void;
  onToggleStats?: () => void;
  onAddMembers: () => void;
  onVoiceChange: (voiceId: string) => void;
  onSpeedChange: (speed: number) => void;
  onToggleMute?: () => void;
  onTransfer?: () => void;
}

export function TeamChatHeader({
  conversation,
  showDetails,
  voiceId: _voiceId,
  speed,
  showSearch,
  showStats,
  isMuted,
  canTransfer,
  onBack,
  onToggleDetails,
  onToggleSearch,
  onToggleStats,
  onAddMembers,
  onVoiceChange: _onVoiceChange,
  onSpeedChange,
  onToggleMute,
  onTransfer,
}: TeamChatHeaderProps) {
  return (
    <div className="flex items-center justify-between px-3 md:px-5 h-[56px] md:h-[65px] pr-24 border-b border-border bg-card shrink-0" role="banner" aria-label="Cabeçalho da conversa">
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        <Button variant="ghost" size="icon" className="md:hidden shrink-0 w-8 h-8" onClick={onBack} aria-label="Voltar para lista de conversas">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Avatar className="w-9 h-9 md:w-10 md:h-10 shrink-0">
          <AvatarImage src={conversation.avatar_url || undefined} alt={conversation.name || 'Avatar'} />
          <AvatarFallback className="bg-primary/10 text-primary">
            {conversation.type === 'group' ? <Users className="w-4 h-4" /> : <User className="w-4 h-4" />}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-[15px] text-foreground truncate">{conversation.name}</h3>
          <p className="text-xs text-muted-foreground">
            {conversation.type === 'group'
              ? `${conversation.members?.length || 0} membros`
              : 'Chat direto'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("w-9 h-9 text-muted-foreground hover:text-foreground hover:bg-muted", showSearch && "text-primary bg-primary/10")}
              onClick={onToggleSearch}
              aria-label={showSearch ? 'Fechar busca' : 'Buscar mensagens'}
              aria-pressed={showSearch}
            >
              <Search className="w-[18px] h-[18px]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Buscar mensagens (⌘K)</TooltipContent>
        </Tooltip>

        {onToggleStats !== undefined && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn("w-9 h-9 text-muted-foreground hover:text-foreground hover:bg-muted", showStats && "text-primary bg-primary/10")}
                onClick={onToggleStats}
                aria-label={showStats ? 'Fechar estatísticas' : 'Ver estatísticas'}
                aria-pressed={showStats}
              >
                <BarChart2 className="w-[18px] h-[18px]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Estatísticas</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="w-9 h-9 text-muted-foreground/40 cursor-not-allowed"
              disabled
              aria-label="Performance (em breve)"
            >
              <Activity className="w-[18px] h-[18px]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Performance (em breve)</TooltipContent>
        </Tooltip>

        {conversation.type === 'group' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="w-9 h-9 text-muted-foreground hover:text-foreground hover:bg-muted" onClick={onAddMembers} aria-label="Adicionar membros">
                <UserPlus className="w-[18px] h-[18px]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Adicionar membros</TooltipContent>
          </Tooltip>
        )}

        {onToggleDetails && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn("w-9 h-9 text-muted-foreground hover:text-foreground hover:bg-muted", showDetails && "text-primary bg-primary/10")}
                onClick={onToggleDetails}
                aria-label={showDetails ? 'Fechar detalhes' : 'Ver detalhes'}
                aria-pressed={showDetails}
              >
                {showDetails ? <PanelRightClose className="w-[18px] h-[18px]" /> : <PanelRightOpen className="w-[18px] h-[18px]" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{showDetails ? 'Fechar detalhes' : 'Ver detalhes'}</TooltipContent>
          </Tooltip>
        )}

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="w-9 h-9 text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Mais ações">
                  <MoreVertical className="w-[18px] h-[18px]" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">Mais ações</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-52 bg-popover border-border">
            {onToggleMute && (
              <DropdownMenuItem onClick={onToggleMute}>
                {isMuted ? (
                  <>
                    <Bell className="w-4 h-4 mr-2" />
                    Ativar notificações
                  </>
                ) : (
                  <>
                    <BellOff className="w-4 h-4 mr-2" />
                    Silenciar
                  </>
                )}
              </DropdownMenuItem>
            )}
            {canTransfer && onTransfer && (
              <DropdownMenuItem onClick={onTransfer}>
                <ArrowLeftRight className="w-4 h-4 mr-2" />
                Transferir departamento
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground font-normal py-1.5">
              <Volume2 className="w-3.5 h-3.5" aria-hidden />
              Velocidade de voz
            </DropdownMenuLabel>
            <div className="flex gap-1 px-2 pb-2" role="group" aria-label="Velocidade de leitura">
              {SPEED_OPTIONS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSpeedChange(s)}
                  className={cn(
                    'flex-1 text-xs rounded px-1 py-0.5 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    speed === s
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                  aria-pressed={speed === s}
                  aria-label={`Velocidade ${s}x`}
                >
                  {s}×
                </button>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="opacity-50">
              <Pin className="w-4 h-4 mr-2" />
              Fixar conversa
            </DropdownMenuItem>
            <DropdownMenuItem disabled className="opacity-50">
              <Archive className="w-4 h-4 mr-2" />
              Arquivar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
