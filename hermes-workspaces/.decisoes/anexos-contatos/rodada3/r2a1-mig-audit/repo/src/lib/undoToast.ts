import { toast } from 'sonner';

interface UndoToastOptions {
  /** Description of what was done */
  message: string;
  /** Callback to reverse the action */
  onUndo: () => void | Promise<void>;
  /** Delay in ms before the action is finalized (default 5000) */
  delay?: number;
  /** Optional icon emoji */
  icon?: string;
}

/**
 * Shows a toast with an "Desfazer" (Undo) button.
 * If the user clicks undo within the delay, onUndo is called.
 * 
 * Usage:
 * ```ts
 * const removed = contacts.splice(index, 1);
 * undoToast({
 *   message: 'Contato removido',
 *   onUndo: () => contacts.splice(index, 0, ...removed),
 * });
 * ```
 */
export function undoToast({ message, onUndo, delay = 5000, icon = '🗑️' }: UndoToastOptions) {
  let undone = false;

  toast(message, {
    icon,
    duration: delay,
    action: {
      label: 'Desfazer',
      onClick: () => {
        undone = true;
        onUndo();
        toast.success('Ação desfeita', { duration: 2000, icon: '↩️' });
      },
    },
    onDismiss: () => {
      if (!undone) {
        // Action finalized — could emit analytics event here
      }
    },
  });
}

/**
 * Confirmation toast for destructive actions.
 * Returns a promise that resolves to true if confirmed, false if cancelled.
 */
export function confirmToast(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    toast(message, {
      icon: '⚠️',
      duration: Infinity,
      action: {
        label: 'Confirmar',
        onClick: () => resolve(true),
      },
      cancel: {
        label: 'Cancelar',
        onClick: () => resolve(false),
      },
      onDismiss: () => resolve(false),
    });
  });
}
