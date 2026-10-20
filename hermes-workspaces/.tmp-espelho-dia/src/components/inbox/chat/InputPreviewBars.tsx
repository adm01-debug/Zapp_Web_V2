import { AnimatePresence, motion } from 'framer-motion';
import { Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReplyPreview } from '../ReplyQuote';
import { Message } from '@/types/chat';

interface InputPreviewBarsProps {
  replyToMessage: Message | null;
  editingMessage?: Message | null;
  onCancelReply: () => void;
  onCancelEdit?: () => void;
}

export function InputPreviewBars({ replyToMessage, editingMessage, onCancelReply, onCancelEdit }: InputPreviewBarsProps) {
  return (
    <>
      <AnimatePresence>
        {replyToMessage && !editingMessage && (
          <ReplyPreview message={replyToMessage} onCancel={onCancelReply} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingMessage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-4 mt-2"
          >
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
              <Pencil className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-primary">Editando mensagem</span>
                <p className="text-xs text-muted-foreground truncate">{editingMessage.content}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="w-6 h-6 text-muted-foreground hover:text-destructive shrink-0"
                onClick={onCancelEdit}
                aria-label="Cancelar edição"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
