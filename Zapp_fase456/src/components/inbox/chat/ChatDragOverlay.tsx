import { motion, AnimatePresence } from '@/components/ui/motion';
import { Paperclip } from 'lucide-react';

interface ChatDragOverlayProps {
  isDraggingOver: boolean;
}

export function ChatDragOverlay({ isDraggingOver }: ChatDragOverlayProps) {
  return (
    <AnimatePresence>
      {isDraggingOver && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg flex items-center justify-center"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-card p-8 rounded-xl shadow-xl border border-primary/30 text-center"
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
              <Paperclip className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">Soltar arquivos aqui</h3>
            <p className="text-sm text-muted-foreground">
              Arraste múltiplos arquivos para enviar em sequência
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
