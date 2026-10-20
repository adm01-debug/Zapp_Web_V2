import { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface ToolPanelProps {
  isOpen: boolean;
  onClose: () => void;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  headerRight?: ReactNode;
}

export function ToolPanel({ isOpen, onClose, icon, title, subtitle, children, className, headerRight }: ToolPanelProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop translúcido */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-20 bg-black/50 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Modal centralizado */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className={cn(
              "absolute left-2 right-2 z-30 flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden",
              "max-w-[470px] max-h-[70%] mx-auto top-[15%]",
              className
            )}
          >
            {/* Header padronizado */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
                {subtitle && (
                  <p className="text-2xs text-muted-foreground truncate">{subtitle}</p>
                )}
              </div>
              {headerRight}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg shrink-0 hover:bg-destructive/10 hover:text-destructive"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Corpo com scroll */}
            <ScrollArea className="flex-1">
              <div className="p-5">
                {children}
              </div>
            </ScrollArea>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
