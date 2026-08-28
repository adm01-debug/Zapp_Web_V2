import { cn } from '@/lib/utils';
import { memo } from 'react';
import { Conversation } from '@/types/chat';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { motion } from '@/components/ui/motion';
import { SLAIndicator } from '../SLAIndicator';
import { SentimentEmoji, getSentimentFromScore, type SentimentLevel } from '../SentimentIndicator';
import { QuickPeek } from '@/components/ui/quick-peek';
import {
  Clock, CheckCircle2, AlertCircle, Loader2, ExternalLink,
  MessageCircle, Instagram, Mail, Phone, UserCheck, Archive, Pin, Star, AlarmClock,
} from 'lucide-react';
import { openChatPopup } from '@/lib/popupManager';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function ChannelBadge({ type }: { type?: string | null }) {
  const iconClass = 'w-2.5 h-2.5 text-primary-foreground';
  let Icon = MessageCircle;
  let bgColor = 'bg-[hsl(142,70%,45%)]';
  if (type === 'instagram') { Icon = Instagram; bgColor = 'bg-[hsl(330,80%,55%)]'; }
  else if (type === 'email') { Icon = Mail; bgColor = 'bg-[hsl(220,70%,55%)]'; }
  else if (type === 'phone' || type === 'call') { Icon = Phone; bgColor = 'bg-[hsl(200,70%,50%)]'; }
  return (
    <span className={cn('absolute -top-0.5 -left-0.5 w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-sidebar z-10', bgColor)}>
      <Icon className={iconClass} />
    </span>
  );
}

export const statusIcons = {
  open: AlertCircle,
  pending: Clock,
  resolved: CheckCircle2,
  waiting: Loader2,
};

export const statusColors = {
  open: 'bg-status-open',
  pending: 'bg-status-pending',
  resolved: 'bg-status-resolved',
  waiting: 'bg-status-waiting',
};

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onSelect: (conversation: Conversation) => void;
  compact?: boolean;
}

function ConversationItemBase({ conversation, isSelected, onSelect, compact = false }: ConversationItemProps) {
  const StatusIcon = statusIcons[conversation.status];
  const sentiment: SentimentLevel | null = (conversation.sentiment as SentimentLevel | null) || 
    (conversation.sentimentScore !== undefined && conversation.sentimentScore !== null ? getSentimentFromScore(conversation.sentimentScore) : null);

  if (compact) {
    return (
      <motion.div onClick={() => onSelect(conversation)} whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.15 }}
        className={cn('relative p-[var(--density-padding-x)] rounded-lg cursor-pointer transition-all duration-200 h-full mx-2', isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/30 border border-transparent')}>
        {isSelected && <motion.div layoutId="conversationActiveCompact" className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-full bg-primary" />}
        <div className="flex items-center gap-2 relative z-10">
          <div className="relative flex-shrink-0">
            <ChannelBadge type={conversation.contact.contact_type} />
            <Avatar className="w-8 h-8">
              <AvatarImage src={conversation.contact.avatar} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">{conversation.contact.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</AvatarFallback>
            </Avatar>
            {conversation.assignedTo ? (
              <Avatar className="absolute -bottom-0.5 -right-0.5 w-4 h-4 ring-1 ring-sidebar">
                <AvatarImage src={conversation.assignedTo.avatar} />
                <AvatarFallback className="bg-secondary text-secondary-foreground text-[7px] font-bold">{conversation.assignedTo.name[0]}</AvatarFallback>
              </Avatar>
            ) : (
              <span className={cn('absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-1 ring-sidebar', statusColors[conversation.status])} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 min-w-0">
                <span className={cn("font-medium text-xs truncate", isSelected ? "text-primary" : "text-foreground")}>{conversation.contact.name}</span>
                {sentiment && <SentimentEmoji sentiment={sentiment} animated={false} />}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(conversation.updatedAt, { addSuffix: false, locale: ptBR })}</span>
                {conversation.unreadCount > 0 && <span className="min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-bold bg-primary text-primary-foreground">{conversation.unreadCount}</span>}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground truncate">{conversation.lastMessage?.content || 'Sem mensagens'}</p>
          </div>
          {conversation.priority === 'high' && <div className="w-0.5 h-5 rounded-full bg-destructive flex-shrink-0" />}
        </div>
      </motion.div>
    );
  }

  const quickPeekPreview = (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-foreground">{conversation.contact.name}</p>
      {conversation.lastMessage?.content && <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">{conversation.lastMessage.content}</p>}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 pt-1 border-t border-border/30">
        <span>{conversation.unreadCount > 0 ? `${conversation.unreadCount} não lidas` : 'Sem novas'}</span>
        {conversation.status && <span>• {conversation.status === 'resolved' ? 'Resolvido' : 'Aberto'}</span>}
      </div>
    </div>
  );

  return (
    <QuickPeek preview={quickPeekPreview} enabled={!isSelected} delay={500}>
      <motion.div onClick={() => onSelect(conversation)} whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.15 }}
        className={cn('relative p-[var(--density-padding-x)] rounded-xl cursor-pointer transition-all duration-200 group h-full mx-2', isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/30 border border-transparent')}>
        {isSelected && <motion.div layoutId="conversationActive" className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-primary" />}
        <div className="flex items-start gap-3 relative z-10">
          <div className="relative flex-shrink-0">
            <ChannelBadge type={conversation.contact.contact_type} />
            <Avatar className={cn("w-11 h-11 ring-2 transition-all", isSelected ? "ring-primary/40" : "ring-border/30")}>
              <AvatarImage src={conversation.contact.avatar} />
              <AvatarFallback className="bg-primary/10 text-primary font-medium">{conversation.contact.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</AvatarFallback>
            </Avatar>
            {conversation.assignedTo ? (
              <Avatar className="absolute -bottom-1 -right-1 w-5 h-5 ring-2 ring-sidebar">
                <AvatarImage src={conversation.assignedTo.avatar} />
                <AvatarFallback className="bg-secondary text-secondary-foreground text-[8px] font-bold">{conversation.assignedTo.name[0]}</AvatarFallback>
              </Avatar>
            ) : (
              <span className={cn('absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-sidebar', statusColors[conversation.status])}>
                <StatusIcon className="w-2.5 h-2.5 text-primary-foreground" />
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={cn("font-medium text-sm truncate transition-colors", isSelected ? "text-primary" : "text-foreground")}>{conversation.contact.name}</span>
                {sentiment && <SentimentEmoji sentiment={sentiment} animated={false} />}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                <span className="text-xs text-muted-foreground">{formatDistanceToNow(conversation.updatedAt, { addSuffix: false, locale: ptBR })}</span>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                        onClick={(e) => { e.stopPropagation(); openChatPopup(conversation.contact.id, conversation.contact.name); }} title="Abrir em popup">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="text-xs">Abrir em popup</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground truncate pr-2">{conversation.lastMessage?.content || 'Sem mensagens'}</p>
              {conversation.unreadCount > 0 && <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center text-[10px] font-bold bg-primary text-primary-foreground">{conversation.unreadCount}</span>}
            </div>
            <div className="flex items-center gap-0.5 mt-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0">
              <TooltipProvider delayDuration={200}>
                <Tooltip><TooltipTrigger asChild><button onClick={(e) => e.stopPropagation()} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-emerald-500 hover:bg-emerald-500/10 active:scale-90 transition-all duration-150"><CheckCircle2 className="w-3.5 h-3.5" /></button></TooltipTrigger><TooltipContent side="bottom" className="text-xs font-medium">Resolver</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild><button onClick={(e) => e.stopPropagation()} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-primary hover:bg-primary/10 active:scale-90 transition-all duration-150"><UserCheck className="w-3.5 h-3.5" /></button></TooltipTrigger><TooltipContent side="bottom" className="text-xs font-medium">Transferir</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild><button onClick={(e) => e.stopPropagation()} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-amber-500 hover:bg-amber-500/10 active:scale-90 transition-all duration-150"><Pin className="w-3.5 h-3.5" /></button></TooltipTrigger><TooltipContent side="bottom" className="text-xs font-medium">Fixar</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild><button onClick={(e) => e.stopPropagation()} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-amber-400 hover:bg-amber-400/10 active:scale-90 transition-all duration-150"><Star className="w-3.5 h-3.5" /></button></TooltipTrigger><TooltipContent side="bottom" className="text-xs font-medium">Favoritar</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild><button onClick={(e) => e.stopPropagation()} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-sky-500 hover:bg-sky-500/10 active:scale-90 transition-all duration-150"><AlarmClock className="w-3.5 h-3.5" /></button></TooltipTrigger><TooltipContent side="bottom" className="text-xs font-medium">Adiar</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild><button onClick={(e) => e.stopPropagation()} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 active:scale-90 transition-all duration-150"><Archive className="w-3.5 h-3.5" /></button></TooltipTrigger><TooltipContent side="bottom" className="text-xs font-medium">Arquivar</TooltipContent></Tooltip>
              </TooltipProvider>
            </div>
            <div className="mt-1">
              <SLAIndicator firstMessageAt={conversation.createdAt} firstResponseAt={conversation.status === 'resolved' ? conversation.updatedAt : null} resolvedAt={conversation.status === 'resolved' ? conversation.updatedAt : null} firstResponseMinutes={conversation.priority === 'high' ? 2 : 5} resolutionMinutes={conversation.priority === 'high' ? 30 : 60} compact />
            </div>
            {conversation.tags.length > 0 && (
              <div className="flex items-center gap-1 mt-2 flex-wrap">
                {conversation.tags.slice(0, 2).map((tag) => <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0 bg-muted/50 border-border/20">{tag}</Badge>)}
                {conversation.tags.length > 2 && <span className="text-[10px] text-muted-foreground">+{conversation.tags.length - 2}</span>}
              </div>
            )}
          </div>
          {conversation.priority === 'high' && <div className="w-1 h-8 rounded-full bg-destructive flex-shrink-0" />}
        </div>
      </motion.div>
    </QuickPeek>
  );
}

export const ConversationItem = memo(ConversationItemBase);
