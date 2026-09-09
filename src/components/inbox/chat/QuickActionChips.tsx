import { type ReactNode, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { motion } from '@/components/ui/motion';
import {
  MessageSquareText, Sparkles, Paperclip, CalendarClock, ArrowLeftRight, MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickReplyItem { id: string; title: string; shortcut: string; content: string; category: string }

interface QuickActionChipsProps {
  quickReplies: QuickReplyItem[];
  onQuickReply: (reply: QuickReplyItem) => void;
  onOpenAiAssistant: () => void;
  onAttach: () => void;
  onOpenSchedule: () => void;
  onOpenTransfer?: () => void;
  /** Conteúdo do popover "⋯ Mais" — o restante da SecondaryToolbar/TertiaryToolsMenu. */
  moreContent: ReactNode;
}

function Chip({ icon: Icon, label, onClick, testId }: { icon: typeof MessageSquareText; label: string; onClick?: () => void; testId?: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="h-9 px-3 rounded-lg bg-muted/60 border border-border text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground gap-2 inline-flex items-center whitespace-nowrap shrink-0 transition-colors"
    >
      <Icon className="w-[15px] h-[15px]" />
      {label}
    </button>
  );
}

export function QuickActionChips({
  quickReplies, onQuickReply, onOpenAiAssistant, onAttach, onOpenSchedule, onOpenTransfer, moreContent,
}: QuickActionChipsProps) {
  const [quickReplyOpen, setQuickReplyOpen] = useState(false);
  return (
    <div className="flex items-center gap-2 px-4 pt-2 overflow-x-auto scrollbar-none" data-testid="quick-action-chips">
      <Popover open={quickReplyOpen} onOpenChange={setQuickReplyOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="chip-quick-reply"
            className="h-9 px-3 rounded-lg bg-muted/60 border border-border text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground gap-2 inline-flex items-center whitespace-nowrap shrink-0 transition-colors"
          >
            <MessageSquareText className="w-[15px] h-[15px]" />
            Resposta Rápida
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0 bg-popover border-border" align="start" side="top">
          <div className="p-3 border-b border-border">
            <h4 className="font-medium text-sm text-foreground">Respostas Rápidas</h4>
          </div>
          <div className="max-h-64 overflow-y-auto p-2 space-y-1">
            {quickReplies.slice(0, 50).map((reply) => (
              <motion.button
                key={reply.id}
                whileHover={{ x: 4 }}
                onClick={() => { onQuickReply(reply); setQuickReplyOpen(false); }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/60 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{reply.content}</span>
                  <Badge variant="outline" className="text-[10px] border-primary/30 shrink-0">{reply.shortcut}</Badge>
                </div>
              </motion.button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Chip icon={Sparkles} label="Assistente IA" onClick={onOpenAiAssistant} testId="chip-ai-assistant" />
      <Chip icon={Paperclip} label="Anexar" onClick={onAttach} testId="chip-attach" />
      <Chip icon={CalendarClock} label="Agendar" onClick={onOpenSchedule} testId="chip-schedule" />
      {onOpenTransfer && <Chip icon={ArrowLeftRight} label="Transferir" onClick={onOpenTransfer} testId="chip-transfer" />}

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="chip-more"
            className={cn(
              'h-9 px-3 rounded-lg bg-muted/60 border border-border text-[13px] font-medium text-muted-foreground',
              'hover:bg-muted hover:text-foreground gap-2 inline-flex items-center whitespace-nowrap shrink-0 transition-colors'
            )}
          >
            <MoreHorizontal className="w-[15px] h-[15px]" />
            Mais
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2 bg-popover border-border max-h-[70vh] overflow-y-auto" align="start" side="top">
          {moreContent}
        </PopoverContent>
      </Popover>
    </div>
  );
}
