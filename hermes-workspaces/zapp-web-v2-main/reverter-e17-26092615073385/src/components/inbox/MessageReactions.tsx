import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SmilePlus, X } from 'lucide-react';
import { useMessageReactions } from '@/hooks/chat/useMessageReactions';

const WHATSAPP_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const EXTENDED_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉', '👏', '💯', '✅', '❌'];

interface MessageReactionsProps {
  messageId: string;
  isSent?: boolean;
  showExtended?: boolean;
  instanceName?: string;
  contactJid?: string;
  externalId?: string;
  senderType?: 'contact' | 'agent';
  refreshKey?: string;
  disableRealtime?: boolean;
}

export function MessageReactions({
  messageId,
  isSent,
  showExtended = false,
  instanceName,
  contactJid,
  externalId,
  senderType,
  refreshKey,
  disableRealtime,
}: MessageReactionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const {
    reactions,
    addReaction,
    removeReaction,
    hasReacted,
    currentProfileId,
  } = useMessageReactions(messageId, {
    instanceName,
    contactJid,
    externalId,
    senderType,
    refreshKey,
    disableRealtime,
  });

  const groupedReactions = reactions.reduce((acc, reaction) => {
    if (!acc[reaction.emoji]) {
      acc[reaction.emoji] = {
        emoji: reaction.emoji,
        count: 0,
        users: [],
        hasCurrentUser: false,
      };
    }

    acc[reaction.emoji].count++;
    acc[reaction.emoji].users.push(reaction.user_name || 'Usuário');

    if (reaction.user_id === currentProfileId) {
      acc[reaction.emoji].hasCurrentUser = true;
    }

    return acc;
  }, {} as Record<string, { emoji: string; count: number; users: string[]; hasCurrentUser: boolean }>);

  const reactionsList = Object.values(groupedReactions);
  const availableReactions = showExtended ? EXTENDED_REACTIONS : WHATSAPP_REACTIONS;

  const handleReact = async (emoji: string) => {
    const existingReaction = groupedReactions[emoji];

    if (existingReaction?.hasCurrentUser) {
      await removeReaction(emoji);
    } else {
      await addReaction(emoji);
    }

    setIsOpen(false);
  };

  return (
    <div className={cn('flex items-center gap-1 flex-wrap', isSent ? 'justify-end' : 'justify-start')}>
      <TooltipProvider>
        {reactionsList.map((reaction) => (
          <Tooltip key={reaction.emoji}>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleReact(reaction.emoji)}
                className={cn(
                  'flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs',
                  'border transition-all cursor-pointer hover:scale-110 active:scale-90',
                  reaction.hasCurrentUser
                    ? 'bg-primary/10 border-primary/30 ring-1 ring-primary/20'
                    : 'bg-muted/80 hover:bg-muted border-border/50'
                )}
              >
                <span className="text-sm">{reaction.emoji}</span>
                {reaction.count > 1 && (
                  <span className={cn(
                    'text-3xs font-medium',
                    reaction.hasCurrentUser ? 'text-primary' : 'text-muted-foreground'
                  )}>
                    {reaction.count}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <div className="max-w-[150px]">
                {reaction.users.slice(0, 5).join(', ')}
                {reaction.users.length > 5 && ` +${reaction.users.length - 5}`}
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </TooltipProvider>

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              'p-1 rounded-full transition-all hover:scale-110 active:scale-90',
              'hover:bg-muted/80 text-muted-foreground hover:text-foreground',
              reactionsList.length === 0
                ? 'opacity-0 group-hover:opacity-100'
                : 'opacity-60 hover:opacity-100'
            )}
          >
            <SmilePlus className="w-3.5 h-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-2 bg-popover"
          align={isSent ? 'end' : 'start'}
          sideOffset={4}
        >
          <div className="flex flex-wrap items-center gap-1 max-w-[200px]">
            {availableReactions.map((emoji) => {
              const userHasReacted = hasReacted(emoji);

              return (
                <motion.button
                  key={emoji}
                  whileHover={{ scale: 1.25 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handleReact(emoji)}
                  className={cn(
                    'p-1.5 rounded-md transition-all text-lg relative',
                    userHasReacted
                      ? 'bg-primary/10 ring-1 ring-primary/30'
                      : 'hover:bg-muted'
                  )}
                >
                  {emoji}
                  {userHasReacted && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-primary rounded-full flex items-center justify-center"
                    >
                      <X className="w-2 h-2 text-primary-foreground" />
                    </motion.div>
                  )}
                </motion.button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface QuickReactionBarProps {
  messageId: string;
  isSent?: boolean;
  instanceName?: string;
  contactJid?: string;
  externalId?: string;
  senderType?: 'contact' | 'agent';
  refreshKey?: string;
  disableRealtime?: boolean;
}

export function QuickReactionBar({
  messageId,
  isSent,
  instanceName,
  contactJid,
  externalId,
  senderType,
  refreshKey,
  disableRealtime,
}: QuickReactionBarProps) {
  const [showPicker, setShowPicker] = useState(false);
  const { addReaction, removeReaction, hasReacted } = useMessageReactions(messageId, {
    instanceName,
    contactJid,
    externalId,
    senderType,
    refreshKey,
    disableRealtime,
  });

  const handleReact = async (emoji: string) => {
    if (hasReacted(emoji)) {
      await removeReaction(emoji);
    } else {
      await addReaction(emoji);
    }
    setShowPicker(false);
  };

  return (
    <div className={cn(
      'absolute -top-9 flex items-center opacity-0 group-hover:opacity-100 transition-all duration-200 z-20',
      showPicker && 'opacity-100',
      isSent ? 'right-0' : 'left-0'
    )}>
      <motion.div
        initial={{ opacity: 0, y: 4, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.12 }}
        className="flex items-center gap-0.5 px-1.5 py-1 rounded-full bg-card/95 dark:bg-[hsl(var(--card)/0.95)] border border-border/40 shadow-lg backdrop-blur-sm"
      >
        {WHATSAPP_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => handleReact(emoji)}
            className={cn(
              'w-7 h-7 flex items-center justify-center rounded-full hover:bg-muted/80 hover:scale-125 transition-all text-base',
              hasReacted(emoji) && 'bg-primary/10 ring-1 ring-primary/30'
            )}
          >
            {emoji}
          </button>
        ))}

        <Popover open={showPicker} onOpenChange={setShowPicker}>
          <PopoverTrigger asChild>
            <button className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-muted/80 transition-all text-muted-foreground hover:text-foreground">
              <SmilePlus className="w-4 h-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-2 bg-popover"
            align={isSent ? 'end' : 'start'}
            sideOffset={4}
          >
            <div className="flex flex-wrap items-center gap-1 max-w-[220px]">
              {EXTENDED_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleReact(emoji)}
                  className={cn(
                    'w-8 h-8 flex items-center justify-center rounded-md text-lg hover:bg-muted transition-all hover:scale-110',
                    hasReacted(emoji) && 'bg-primary/10 ring-1 ring-primary/30'
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </motion.div>
    </div>
  );
}
