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

/**
 * Hook for actions with temporal undo capability
 * Shows a toast with undo button for specified duration before committing
 */
export function useUndoableAction<T>() {
  const [state, setState] = useState<UndoableActionState>({
    isPending: false,
    canUndo: false,
    timeRemaining: 0,
  });

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingActionRef = useRef<{
    undoAction: () => Promise<void>;
    onCommit?: () => void;
  } | null>(null);

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

    // Clear any existing pending action
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);

    setState({
      isPending: true,
      canUndo: true,
      timeRemaining: undoDuration / 1000,
    });

    try {
      // Execute the action immediately (optimistic)
      const result = await action();

      // Store undo action
      pendingActionRef.current = { undoAction, onCommit };

      // Countdown interval
      const startTime = Date.now();
      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, Math.ceil((undoDuration - elapsed) / 1000));
        setState(prev => ({ ...prev, timeRemaining: remaining }));
      }, 100);

      // Show toast with undo button
      toast.success(successMessage, {
        duration: undoDuration,
        action: {
          label: 'Desfazer',
          onClick: async () => {
            // Cancel commit
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (intervalRef.current) clearInterval(intervalRef.current);

            try {
              await pendingActionRef.current?.undoAction();
              toast.success(undoMessage);
            } catch (error) {
              toast.error('Erro ao desfazer ação');
            } finally {
              pendingActionRef.current = null;
              setState({
                isPending: false,
                canUndo: false,
                timeRemaining: 0,
              });
            }
          },
        },
      });

      // Set timeout to commit action
      timeoutRef.current = setTimeout(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        
        pendingActionRef.current?.onCommit?.();
        pendingActionRef.current = null;
        
        setState({
          isPending: false,
          canUndo: false,
          timeRemaining: 0,
        });
      }, undoDuration);

      return result;
    } catch (error) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setState({
        isPending: false,
        canUndo: false,
        timeRemaining: 0,
      });
      throw error;
    }
  }, []);

  const cancelPendingAction = useCallback(async () => {
    if (!pendingActionRef.current) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);

    try {
      await pendingActionRef.current.undoAction();
      toast.success('Ação desfeita');
    } catch (error) {
      toast.error('Erro ao desfazer ação');
    } finally {
      pendingActionRef.current = null;
      setState({
        isPending: false,
        canUndo: false,
        timeRemaining: 0,
      });
    }
  }, []);

  return {
    execute,
    cancelPendingAction,
    ...state,
  };
}
