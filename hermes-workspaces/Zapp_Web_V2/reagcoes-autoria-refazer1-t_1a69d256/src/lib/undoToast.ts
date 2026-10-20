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
  let finalized = false;

  const show = () => {
    toast(message, {
      icon,
      duration: delay,
      action: {
        label: 'Desfazer',
        onClick: async () => {
          // R2-MOD-053: SÓ anuncia o sucesso depois de `onUndo` resolver. Antes,
          // o `void onUndo()` seguido de `toast.success` dizia "Ação desfeita"
          // mesmo quando a reversão falhava (ou nem tinha gravado ainda). Se a
          // reversão falhar, o item continua como estava: avisamos o erro e
          // reoferecemos o Desfazer com o mesmo contexto.
          try {
            await onUndo();
          } catch {
            toast.error('Não foi possível desfazer. Tente novamente.', { duration: 4000 });
            show();
            return;
          }
          finalized = true;
          toast.success('Ação desfeita', { duration: 2000, icon: '↩️' });
        },
      },
      onDismiss: () => {
        if (!finalized) {
          // Action finalized — could emit analytics event here
        }
      },
    });
  };

  show();
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
