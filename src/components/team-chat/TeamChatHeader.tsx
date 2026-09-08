import { TeamConversation } from '@/hooks/chat/useTeamChat';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';


import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft,
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
} from 'lucide-react';

interface TeamChatHeaderProps {
  conversation: TeamConversation;
  showDetails?: boolean;
  voiceId: string;
  speed: number;
  showSearch: boolean;
  isMuted?: boolean;
  onBack: () => void;
  onToggleDetails?: () => void;
  onToggleSearch: () => void;
  onAddMembers: () => void;
  onVoiceChange: (voiceId: string) => void;
  onSpeedChange: (speed: number) => void;
  onToggleMute?: () => void;
}

export function TeamChatHeader({
  conversation,
  showDetails,
  voiceId,
  speed,
  showSearch,
  isMuted,
  onBack,
  onToggleDetails,
  onToggleSearch,
  onAddMembers,
  onVoiceChange,
  onSpeedChange,
  onToggleMute,
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
              variant="ghost"
              size="icon"
              className={cn("w-9 h-9 text-muted-foreground hover:text-foreground hover:bg-muted", showSearch && "text-primary bg-primary/10")}
              onClick={onToggleSearch}
            >
              <Search className="w-[18px] h-[18px]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Buscar mensagens</TooltipContent>
        </Tooltip>

        {conversation.type === 'group' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="w-9 h-9 text-muted-foreground hover:text-foreground hover:bg-muted" onClick={onAddMembers}>
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
                variant="ghost"
                size="icon"
                className={cn("w-9 h-9 text-muted-foreground hover:text-foreground hover:bg-muted", showDetails && "text-primary bg-primary/10")}
                onClick={onToggleDetails}
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
                <Button variant="ghost" size="icon" className="w-9 h-9 text-muted-foreground hover:text-foreground hover:bg-muted">
                  <MoreVertical className="w-[18px] h-[18px]" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">Mais ações</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-48 bg-popover border-border">
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
