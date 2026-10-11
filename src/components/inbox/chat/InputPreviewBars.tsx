import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReplyPreview } from '../ReplyQuote';
import { Message } from '@/types/chat';
import { zappMotion, zappTransition } from '@/lib/motion';

interface InputPreviewBarsProps {
  replyToMessage: Message | null;
  editingMessage?: Message | null;
  onCancelReply: () => void;
  onCancelEdit?: () => void;
}

export function InputPreviewBars({ replyToMessage, editingMessage, onCancelReply, onCancelEdit }: InputPreviewBarsProps) {
  const reduceMotion = useReducedMotion() ?? false;

  // Movimento reduzido: sem deslocamento de altura; só a opacidade entra e sai.
  const editBarVariants: Variants = reduceMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration: zappMotion.duration.normal } },
        exit: { opacity: 0, transition: { duration: zappMotion.duration.fast } },
      }
    : {
        hidden: { opacity: 0, height: 0 },
        visible: { opacity: 1, height: 'auto', transition: zappTransition.normal },
        exit: { opacity: 0, height: 0, transition: zappTransition.fast },
      };

  return (
    <>
      <AnimatePresence>
        {replyToMessage && !editingMessage && (
          <ReplyPreview key="reply-preview" message={replyToMessage} onCancel={onCancelReply} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingMessage && (
          <motion.div
            key="edit-bar"
            data-testid="edit-mode-bar"
            variants={editBarVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="mx-4 mt-2"
          >
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2">
              <Pencil className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <span className="text-xs font-medium text-primary">Modo de edição</span>
                <p className="truncate text-xs text-muted-foreground">{editingMessage.content}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={onCancelEdit}
                aria-label="Cancelar edição"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
