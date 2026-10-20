/**
 * Componente de Barra de Ações em Massa
 * 
 * @module components/BulkActionsBar
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { X, Loader2 } from 'lucide-react';
import { BulkAction } from '@/hooks/inbox/useBulkActions';
import { cn } from '@/lib/utils';

interface BulkActionsBarProps<T> {
  selectionCount: number;
  actions: BulkAction<T>[];
  onAction: (actionId: string) => Promise<void>;
  onClear: () => void;
  isExecuting?: boolean;
  className?: string;
}

export function BulkActionsBar<T>({
  selectionCount,
  actions,
  onAction,
  onClear,
  isExecuting = false,
  className,
}: BulkActionsBarProps<T>) {
  if (selectionCount === 0) return null;

  return (
    <AnimatePresence>
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(
        'fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border bg-background p-2 shadow-lg',
        className
      )}
    >
      <div className="flex items-center gap-2 px-2">
        <span className="text-sm font-medium">
          {selectionCount} selecionado{selectionCount > 1 ? 's' : ''}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClear}
          disabled={isExecuting}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Limpar seleção</span>
        </Button>
      </div>

      <div className="h-6 w-px bg-border" />

      <div className="flex items-center gap-1">
        {actions.map((action) => {
          const ActionButton = (
            <Button
              key={action.id}
              variant={action.variant ?? 'outline'}
              size="sm"
              disabled={isExecuting}
              onClick={action.confirm ? undefined : () => onAction(action.id)}
              className="gap-2"
            >
              {isExecuting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                action.icon && <action.icon className="h-4 w-4" />
              )}
              {action.label}
            </Button>
          );

          if (action.confirm) {
            return (
              <AlertDialog key={action.id}>
                <AlertDialogTrigger asChild>{ActionButton}</AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{action.confirm.title}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {action.confirm.description}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onAction(action.id)}
                      className={
                        action.variant === 'destructive'
                          ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                          : ''
                      }
                    >
                      Confirmar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            );
          }

          return ActionButton;
        })}
      </div>
    </motion.div>
    </AnimatePresence>
  );
}

export default BulkActionsBar;
