import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from '@/components/ui/motion';
import { X } from 'lucide-react';

interface QuickReplyItem {
  id: string;
  title: string;
  shortcut: string;
  content: string;
  category: string;
}

interface ChatQuickRepliesPopoverProps {
  show: boolean;
  replies: QuickReplyItem[];
  onSelect: (reply: QuickReplyItem) => void;
  onClose: () => void;
}

export function ChatQuickRepliesPopover({ show, replies, onSelect, onClose }: ChatQuickRepliesPopoverProps) {
  return (
    <AnimatePresence>
      {show && replies.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="absolute bottom-20 left-4 right-4 bg-popover border border-border rounded-lg shadow-lg p-2 z-10"
        >
          <div className="flex items-center justify-between mb-2 px-2">
            <span className="text-xs font-medium text-muted-foreground">
              Respostas rápidas
            </span>
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button
                variant="ghost"
                size="icon"
                className="w-5 h-5"
                onClick={onClose}
              >
                <X className="w-3 h-3" />
              </Button>
            </motion.div>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {replies.map((reply) => (
              <motion.button
                key={reply.id}
                whileHover={{ x: 4 }}
                onClick={() => onSelect(reply)}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-accent transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{reply.title}</span>
                  <Badge variant="outline" className="text-3xs">
                    {reply.shortcut}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {reply.content}
                </p>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
