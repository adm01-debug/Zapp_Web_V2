import { memo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { SmilePlus } from 'lucide-react';
import { MessageReactionBar, QuickReactionStrip, ReactionPicker, type ReactionGroup } from '@/components/ui/message-reactions';

interface TeamReactionBarProps {
  reactions: ReactionGroup[];
  onToggle: (emoji: string) => void;
  isMine?: boolean;
  className?: string;
}

export const TeamReactionBar = memo(function TeamReactionBar(props: TeamReactionBarProps) {
  return <MessageReactionBar {...props} />;
});

interface TeamQuickReactionBarWrapperProps {
  onToggle: (emoji: string) => void;
  isMine?: boolean;
}

export const TeamQuickReactionBarWrapper = memo(function TeamQuickReactionBarWrapper({ onToggle, isMine }: TeamQuickReactionBarWrapperProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span>
          <QuickReactionStrip
            onSelect={onToggle}
            onOpenFull={() => setOpen(true)}
            isMine={isMine}
          />
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" side="top" align={isMine ? 'end' : 'start'}>
        <ReactionPicker onSelect={e => { onToggle(e); setOpen(false); }} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
});
