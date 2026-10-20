import React, { useCallback, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clearReloadFlag, isChunkLoadError } from '@/components/errors/ErrorBoundary';
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

    // Chunk com fetch falho nao se resolve remontando: a instancia React.lazy
    // guarda a rejeicao e re-lanca a MESMA sem novo fetch — o auto-retry aqui
    // so repete o erro. Re-lancar entrega o erro ao ErrorBoundary global
    // (AppProviders), que ja recarrega a pagina uma vez por sessao.
    if (isChunkLoadError(error)) {
      throw error;
    }

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
    // Falha de chunk com o fallback ja na tela: remontar re-lanca a mesma
    // rejeicao do lazy. O unico caminho que funciona e recarregar a pagina,
    // igual ao handleReload do boundary global (limpando a flag da sessao).
    if (this.state.error && isChunkLoadError(this.state.error)) {
      clearReloadFlag();
      window.location.reload();
      return;
    }
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
              <p className="text-xs text-muted-foreground">
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
