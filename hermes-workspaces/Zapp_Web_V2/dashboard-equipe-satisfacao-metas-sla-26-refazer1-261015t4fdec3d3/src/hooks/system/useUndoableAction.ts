import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';

interface UndoableActionOptions<T> {
  /** Duration in ms before action is committed (default: 5000) */
  undoDuration?: number;
  /** Success message to show */
  successMessage: string;
  /** Message to show after undo */
  undoMessage?: string;
  /** Function to execute the action */
  action: () => Promise<T>;
  /** Function to undo the action */
  undoAction: () => Promise<void>;
  /** Callback after action is committed (undo period expired) */
  onCommit?: () => void;
}

interface UndoableActionState {
  isPending: boolean;
  canUndo: boolean;
  timeRemaining: number;
}

interface PendingOperation {
  /** Identidade da operação. O aviso só age se ainda for o dono de pendingActionRef. */
  id: number;
  undoAction: () => Promise<void>;
  onCommit?: () => void;
  /** Id do toast devolvido pelo sonner, para dispensar o aviso encerrado. */
  toastId: string | number;
}

/**
 * Hook for actions with temporal undo capability
 * Shows a toast with undo button for specified duration before committing
 *
 * R2-PLAT-007: um execute NUNCA reaproveita o undo de outro. Ao começar uma
 * operação nova, a anterior é encerrada explicitamente (aviso dispensado e
 * `onCommit` chamado) e cada aviso guarda a identidade da sua operação — o
 * clique de um aviso antigo não pode reverter a operação seguinte.
 */
export function useUndoableAction<T>() {
  const [state, setState] = useState<UndoableActionState>({
    isPending: false,
    canUndo: false,
    timeRemaining: 0,
  });

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingActionRef = useRef<PendingOperation | null>(null);
  const nextOperationIdRef = useRef(0);

  const stopTimers = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  /**
   * Encerra a operação pendente: limpa os timers, invalida a identidade (o
   * callback do aviso antigo passa a não fazer nada) e, quando `commit`,
   * dispensa o aviso e chama o `onCommit` da operação encerrada.
   */
  const endPendingOperation = useCallback((commit: boolean) => {
    const pending = pendingActionRef.current;
    pendingActionRef.current = null;
    stopTimers();
    if (!pending) return;
    toast.dismiss(pending.toastId);
    if (commit) pending.onCommit?.();
  }, [stopTimers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const execute = useCallback(async <T>(options: UndoableActionOptions<T>) => {
    const {
      undoDuration = 5000,
      successMessage,
      undoMessage = 'Ação desfeita',
      action,
      undoAction,
      onCommit,
    } = options;

    // R2-PLAT-007: encerra o undo anterior (aviso dispensado + commit) antes de
    // iniciar esta operação, para que aviso antigo e operação nova não se misturem.
    endPendingOperation(true);

    setState({
      isPending: true,
      canUndo: true,
      timeRemaining: undoDuration / 1000,
    });

    try {
      // Execute the action immediately (optimistic)
      const result = await action();

      const operationId = ++nextOperationIdRef.current;

      // Show toast with undo button
      const toastId = toast.success(successMessage, {
        duration: undoDuration,
        action: {
          label: 'Desfazer',
          onClick: async () => {
            const pending = pendingActionRef.current;
            // Só desfaz se este aviso ainda for o dono da operação pendente:
            // o clique de um aviso já encerrado não opera sobre outra operação.
            if (!pending || pending.id !== operationId) return;

            pendingActionRef.current = null;
            stopTimers();

            try {
              await pending.undoAction();
              toast.success(undoMessage);
            } catch (error) {
              toast.error('Erro ao desfazer ação');
            } finally {
              setState({
                isPending: false,
                canUndo: false,
                timeRemaining: 0,
              });
            }
          },
        },
      });

      // Store this operation's undo binding (identity + its own callbacks)
      pendingActionRef.current = { id: operationId, undoAction, onCommit, toastId };

      // Countdown interval
      const startTime = Date.now();
      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, Math.ceil((undoDuration - elapsed) / 1000));
        setState(prev => ({ ...prev, timeRemaining: remaining }));
      }, 100);

      // Set timeout to commit action
      timeoutRef.current = setTimeout(() => {
        stopTimers();
        const pending = pendingActionRef.current;
        pendingActionRef.current = null;
        pending?.onCommit?.();

        setState({
          isPending: false,
          canUndo: false,
          timeRemaining: 0,
        });
      }, undoDuration);

      return result;
    } catch (error) {
      stopTimers();
      pendingActionRef.current = null;
      setState({
        isPending: false,
        canUndo: false,
        timeRemaining: 0,
      });
      throw error;
    }
  }, [endPendingOperation, stopTimers]);

  const cancelPendingAction = useCallback(async () => {
    const pending = pendingActionRef.current;
    if (!pending) return;

    pendingActionRef.current = null;
    stopTimers();

    try {
      await pending.undoAction();
      toast.success('Ação desfeita');
    } catch (error) {
      toast.error('Erro ao desfazer ação');
    } finally {
      setState({
        isPending: false,
        canUndo: false,
        timeRemaining: 0,
      });
    }
  }, [stopTimers]);

  return {
    execute,
    cancelPendingAction,
    ...state,
  };
}
