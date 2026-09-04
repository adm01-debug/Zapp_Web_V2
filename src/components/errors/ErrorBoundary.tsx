import React, { Component, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { log } from '@/lib/logger';
import { reportClientError } from '@/lib/errorReporter';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKey?: string | number;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  prevResetKey?: string | number;
}

// sessionStorage key to throttle auto-reload -- avoids infinite loop
// when a chunk is genuinely broken (not just stale).
const CHUNK_RELOAD_KEY = 'zapp_chunk_reload_v1';

// sessionStorage lanca quando o navegador bloqueia storage (private browsing,
// cookies de terceiros, iframe sandbox). Sem estes wrappers, qualquer acesso
// derruba o proprio boundary ou os botoes de recuperacao.
function readReloadFlag(): { ok: boolean; value: string | null } {
  try {
    return { ok: true, value: sessionStorage.getItem(CHUNK_RELOAD_KEY) };
  } catch {
    return { ok: false, value: null };
  }
}

function writeReloadFlag(): boolean {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

function clearReloadFlag(): void {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch {
    // sem storage nao ha flag para limpar
  }
}

function isChunkLoadError(error: Error): boolean {
  return (
    error.name === 'ChunkLoadError' ||
    error.message.includes('Failed to fetch dynamically imported module') ||
    error.message.includes('Loading chunk') ||
    error.message.includes('Loading CSS chunk')
  );
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error, errorInfo: null };
  }

  public static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== undefined && props.resetKey !== state.prevResetKey) {
      return { hasError: false, error: null, errorInfo: null, prevResetKey: props.resetKey };
    }
    return null;
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    log.error('ErrorBoundary caught an error:', error, errorInfo);
    reportClientError(error, {
      source: 'ErrorBoundary',
      componentStack: (errorInfo.componentStack ?? '').slice(0, 1500),
    });
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);

    // Auto-reload on ChunkLoadError -- happens when the browser has a stale
    // index.html referencing chunk hashes from a previous Vercel deployment.
    // One reload per session to prevent infinite loops if the chunk is
    // genuinely missing (not just stale).
    if (isChunkLoadError(error)) {
      const flag = readReloadFlag();
      if (!flag.ok) {
        // Sem storage nao da para registrar que ja recarregamos; recarregar aqui
        // viraria loop infinito quando o chunk esta mesmo faltando.
        log.warn('ChunkLoadError com sessionStorage indisponivel (leitura) -- mostrando UI de erro em vez de recarregar');
      } else if (flag.value) {
        log.warn('ChunkLoadError depois de ja ter recarregado -- chunk realmente ausente, mostrando UI de erro');
      } else if (writeReloadFlag()) {
        log.warn('ChunkLoadError detectado -- recarregando para pegar os assets do deploy novo');
        window.location.reload();
        return;
      } else {
        // Leitura passou mas escrita falhou (Safari em navegacao privada, quota
        // estourada). Diagnostico proprio: nao e chunk ausente, e storage.
        log.warn('ChunkLoadError com sessionStorage indisponivel (escrita) -- mostrando UI de erro em vez de recarregar');
      }
    }
  }

  private handleRetry = () => {
    clearReloadFlag();
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleGoHome = () => {
    clearReloadFlag();
    window.location.href = '/';
  };

  private handleReload = () => {
    clearReloadFlag();
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // IMPORTANT: No framer-motion here! If framer-motion caused the error,
      // using it in the fallback would create an infinite crash loop.
      return (
        <div
          className="min-h-screen flex items-center justify-center bg-background p-4"
          role="alert"
          aria-live="assertive"
        >
          <Card className="max-w-lg w-full shadow-2xl border-destructive/20">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-4">
                <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="w-10 h-10 text-destructive" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold text-foreground">
                Ops! Algo deu errado
              </CardTitle>
              <CardDescription className="text-muted-foreground mt-2">
                Encontramos um erro inesperado. Tente recarregar a página.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* BUG-5 FIX: use import.meta.env.DEV, not process.env.NODE_ENV
                    process.env.NODE_ENV is not populated by Vite in browser builds,
                    so this block would NEVER render in development with the old code. */}
              {import.meta.env.DEV && this.state.error && (
                <details className="text-sm bg-muted/50 rounded-lg p-3 border border-border">
                  <summary className="cursor-pointer font-medium text-foreground flex items-center gap-2">
                    <Bug className="w-4 h-4" />
                    Detalhes do erro (desenvolvimento)
                  </summary>
                  <div className="mt-2 space-y-2">
                    <p className="text-destructive font-mono text-xs break-all">
                      {this.state.error.message}
                    </p>
                    {this.state.errorInfo?.componentStack && (
                      <pre className="text-xs text-muted-foreground overflow-auto max-h-32 bg-background p-2 rounded">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    )}
                  </div>
                </details>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  onClick={this.handleRetry}
                  className="flex-1"
                  variant="default"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Tentar novamente
                </Button>
                <Button
                  onClick={this.handleGoHome}
                  variant="outline"
                  className="flex-1"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Voltar ao início
                </Button>
              </div>

              <button
                onClick={this.handleReload}
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
              >
                Ou recarregue a página completamente
              </button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// HOC para envolver componentes com Error Boundary.
// Uses ComponentType<P> directly (imported), NOT React.ComponentType<P>,
// to avoid requiring React as a namespace when using named imports only.
export function withErrorBoundary<P extends object>(
  WrappedComponent: ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundaryWrapper(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

// Hook-like component for functional error boundaries
export function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-lg">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-foreground">Erro ao carregar componente</h3>
          <p className="text-sm text-muted-foreground truncate">{error.message}</p>
        </div>
        <Button size="sm" variant="outline" onClick={resetErrorBoundary}>
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}
