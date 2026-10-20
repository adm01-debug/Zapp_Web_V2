export type FeedbackType = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface FeedbackOptions {
  title?: string;
  description: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface WithFeedbackOptions<T> {
  loadingMessage?: string;
  successMessage?: string | ((result: T) => string);
  errorMessage?: string;
  showLoading?: boolean;
  onSuccess?: (result: T) => void;
  onError?: (error: Error) => void;
}

export interface UndoableOptions<T> {
  description: string;
  undoDuration?: number;
  onUndo: () => void;
  onConfirm?: (result: T) => void;
}

export const FEEDBACK_ICONS: Record<FeedbackType, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
  loading: '⟳',
};

export const FEEDBACK_TITLES: Record<FeedbackType, string> = {
  success: 'Sucesso!',
  error: 'Erro!',
  warning: 'Atenção',
  info: 'Informação',
  loading: 'Processando...',
};

export const FEEDBACK_VARIANTS: Record<FeedbackType, 'default' | 'destructive'> = {
  success: 'default',
  error: 'destructive',
  warning: 'default',
  info: 'default',
  loading: 'default',
};

export const FEEDBACK_DURATIONS: Record<FeedbackType, number> = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 3000,
  loading: 60000,
};
