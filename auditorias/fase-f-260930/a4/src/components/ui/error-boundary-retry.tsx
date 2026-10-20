import React, { useCallback, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorBoundaryWithRetryProps {
  children: React.ReactNode;
  fallbackClassName?: string;
  /** Max automatic retries before showing manual button */
  maxAutoRetries?: number;
  /** Module name for error reporting */
  moduleName?: string;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
  isAutoRetrying: boolean;
}

/**
 * Enhanced error boundary with:
 * - Automatic retry with exponential backoff (up to maxAutoRetries)
 * - Manual retry button after max auto retries
 * - Error reporting callback
 * - Graceful fallback UI
 */
export class ErrorBoundaryWithRetry extends React.Component<ErrorBoundaryWithRetryProps, State> {
  private retryTimeout: ReturnType<typeof setTimeout> | null = null;

  static defaultProps = {
    maxAutoRetries: 2,
  };

  state: State = {
    hasError: false,
    error: null,
    retryCount: 0,
    isAutoRetrying: false,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.props.onError?.(error, errorInfo);

    const maxRetries = this.props.maxAutoRetries ?? 2;

    // Auto-retry with exponential backoff
    if (this.state.retryCount < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, this.state.retryCount), 8000);
      this.setState({ isAutoRetrying: true });
      this.retryTimeout = setTimeout(() => {
        this.setState((prev) => ({
          hasError: false,
          error: null,
          retryCount: prev.retryCount + 1,
          isAutoRetrying: false,
        }));
      }, delay);
    }
  }

  componentWillUnmount() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
  }

  handleManualRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      retryCount: 0,
      isAutoRetrying: false,
    });
  };

  render() {
    if (this.state.hasError && !this.state.isAutoRetrying) {
      const maxRetries = this.props.maxAutoRetries ?? 2;
      const exhaustedRetries = this.state.retryCount >= maxRetries;

      return (
        <div className={cn('flex items-center justify-center h-full p-8', this.props.fallbackClassName)}>
          <div className="text-center max-w-sm space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>

            <h2 className="text-lg font-semibold text-foreground">
              {this.props.moduleName
                ? `Erro ao carregar ${this.props.moduleName}`
                : 'Erro ao carregar módulo'}
            </h2>

            <p className="text-sm text-muted-foreground">
              {this.state.error?.message || 'Ocorreu um erro inesperado.'}
            </p>

            {exhaustedRetries && (
              <p className="text-xs text-muted-foreground/60">
                Tentativas automáticas esgotadas ({maxRetries}). Tente manualmente.
              </p>
            )}

            <Button
              onClick={this.handleManualRetry}
              variant="default"
              size="sm"
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Tentar novamente
            </Button>
          </div>
        </div>
      );
    }

    if (this.state.isAutoRetrying) {
      return (
        <div className={cn('flex items-center justify-center h-full p-8', this.props.fallbackClassName)}>
          <div className="text-center space-y-3">
            <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">
              Tentando novamente... ({this.state.retryCount + 1}/{this.props.maxAutoRetries ?? 2})
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
