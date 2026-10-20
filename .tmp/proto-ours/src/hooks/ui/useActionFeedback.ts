import { useCallback } from 'react';
import { useToast } from '@/hooks/ui/use-toast';
import type { FeedbackType, FeedbackOptions, WithFeedbackOptions } from '../feedback/feedbackTypes';
import { FEEDBACK_ICONS, FEEDBACK_TITLES, FEEDBACK_VARIANTS, FEEDBACK_DURATIONS } from '../feedback/feedbackTypes';

export type { FeedbackType, FeedbackOptions, WithFeedbackOptions };

export function useActionFeedback() {
  const { toast } = useToast();

  const showFeedback = useCallback((type: FeedbackType, options: FeedbackOptions) => {
    const icon = FEEDBACK_ICONS[type];
    const title = options.title || FEEDBACK_TITLES[type];
    const duration = options.duration ?? FEEDBACK_DURATIONS[type];
    return toast({ title, description: `${icon} ${options.description}`, variant: FEEDBACK_VARIANTS[type], duration });
  }, [toast]);

  const success = useCallback((d: string, t?: string) => showFeedback('success', { description: d, title: t }), [showFeedback]);
  const error = useCallback((d: string, t?: string) => showFeedback('error', { description: d, title: t }), [showFeedback]);
  const warning = useCallback((d: string, t?: string) => showFeedback('warning', { description: d, title: t }), [showFeedback]);
  const info = useCallback((d: string, t?: string) => showFeedback('info', { description: d, title: t }), [showFeedback]);
  const loading = useCallback((d: string, t?: string) => showFeedback('loading', { description: d, title: t }), [showFeedback]);

  const withFeedback = useCallback(async <T,>(action: () => Promise<T>, options: WithFeedbackOptions<T> = {}): Promise<T | undefined> => {
    const { loadingMessage = 'Processando...', successMessage = 'Operação concluída com sucesso!', errorMessage = 'Ocorreu um erro.', showLoading = true, onSuccess, onError } = options;
    const loadingToast = showLoading ? loading(loadingMessage) : null;
    try {
      const result = await action();
      loadingToast?.dismiss();
      success(typeof successMessage === 'function' ? successMessage(result) : successMessage);
      onSuccess?.(result);
      return result;
    } catch (err) {
      loadingToast?.dismiss();
      const e = err instanceof Error ? err : new Error(String(err));
      error(e.message || errorMessage);
      onError?.(e);
      return undefined;
    }
  }, [loading, success, error]);

  return { showFeedback, success, error, warning, info, loading, withFeedback };
}
