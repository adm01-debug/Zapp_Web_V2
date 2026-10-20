import React, { Component, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { log } from '@/lib/logger';
import { reportClientError } from '@/lib/errorReporter';
import {
  hasExhaustedChunkReloads,
  isChunkLoadError,
  resetChunkReloadGuard,
  triggerChunkReload,
} from '@/lib/chunkReload';
import { StaleBundleNotice } from './StaleBundleNotice';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /**
   * Chamado UMA vez a cada transicao erro -> ok (seja porque o `resetKey`
   * mudou, seja porque o usuario clicou "Tentar novamente"). Quem recuperou
   * avisa o pai para ele zerar contadores de tentativa por sessao.
   */
  onReset?: () => void;
  resetKey?: string | number;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  prevResetKey?: string | number;
}

// eslint-disable-next-line react-refresh/only-export-components -- deteccao unica de chunk error compartilhada com error-boundary-retry (cartao t_4f86c0a2); implementacao em src/lib/chunkReload.ts
export { isChunkLoadError };

// eslint-disable-next-line react-refresh/only-export-components -- reuso exigido pelo boundary da view (cartao t_4f86c0a2); a guarda unica agora vive em src/lib/chunkReload.ts
export function clearReloadFlag(): void {
  resetChunkReloadGuard();
}

/**
 * Recursao infinita: o React estoura "Maximum call stack size exceeded" quando um
 * componente se renderiza sem parar. Cenario proprio — aqui "Tentar novamente"
 * nao resolve (o erro volta na hora), so recarregar.
 */
function isStackOverflowError(error: Error | null): boolean {
  if (!error) return false;
  return (error.message ?? '').toLowerCase().includes('maximum call stack');
}

/**
 * Fallback enxuto dos cenarios de chunk/recursao. DE PROPOSITO sem
 * framer-motion: se o erro veio do proprio motion, usar motion aqui criaria um
 * laco de crash (mesmo motivo do fallback generico logo abaixo).
 */
function FallbackDeCenario({
  icone: Icone,
  titulo,
  descricao,
  acao,
  onClick,
}: {
  icone: typeof AlertTriangle;
  titulo: string;
  descricao: string;
  acao: string;
  onClick: () => void;
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background p-4"
      role="alert"
      aria-live="assertive"
    >
      <Card className="max-w-lg w-full shadow-2xl border-border">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
              <Icone className="w-10 h-10 text-muted-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">{titulo}</CardTitle>
          <CardDescription className="text-muted-foreground mt-2">{descricao}</CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <Button onClick={onClick} className="w-full min-h-11">
            <RefreshCw className="w-4 h-4 mr-2" />
            {acao}
          </Button>
        </CardContent>
      </Card>
    </div>
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

  /**
   * Avisa o pai quando o boundary se recupera de um erro.
   *
   * O React chama `componentDidUpdate` depois de todo render com o estado
   * anterior, entao a transicao `prevState.hasError=true -> hasError=false`
   * dispara exatamente uma vez por recuperacao — tanto quando o
   * `getDerivedStateFromProps` limpa o erro por causa do `resetKey` quanto
   * quando `handleRetry` zera o estado na mao. Sem isto o contador de
   * tentativas do pai (AppProviders) nunca voltava a zero e erros ja
   * recuperados ao longo da sessao somavam ate derrubar o app.
   */
  public componentDidUpdate(_prevProps: Props, prevState: State): void {
    if (prevState.hasError && !this.state.hasError) {
      this.props.onReset?.();
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    log.error('ErrorBoundary caught an error:', error, errorInfo);
    reportClientError(error, {
      source: 'ErrorBoundary',
      componentStack: (errorInfo.componentStack ?? '').slice(0, 1500),
    });
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);

    // ChunkLoadError = o HTML ja carregado aponta para hashes de um deploy que a
    // producao apagou. Quem decide a recarga e UMA unica fonte
    // (src/lib/chunkReload.ts): orcamento de 2 por sessao, cooldown de 30 s e
    // tolerancia de relogio. Quando ela nao acontece, o render mostra a tela
    // acionavel ao usuario em vez de recarregar em silencio (laco invisivel).
    if (isChunkLoadError(error)) {
      const recarregou = triggerChunkReload();
      if (recarregou) {
        log.warn('ChunkLoadError detectado -- recarregando para pegar os assets do deploy novo');
      } else {
        log.warn(
          'ChunkLoadError sem recarga automatica disponivel (orcamento esgotado ou cooldown) -- mostrando a tela de nova versao'
        );
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

  /** Cenario 1 — chunk de deploy antigo: recarga manual liberada pelo usuario. */
  private renderFallbackDeChunk = () => (
    <FallbackDeCenario
      icone={RefreshCw}
      titulo="Atualização disponível"
      descricao="Uma versão nova do Zapp já está no ar e esta tela não conseguiu carregar. Recarregue para continuar."
      acao="Recarregar"
      onClick={this.handleReload}
    />
  );

  /** Cenario 2 — recursao infinita: "tentar novamente" repetiria o estouro. */
  private renderFallbackDeRecursao = () => (
    <FallbackDeCenario
      icone={AlertTriangle}
      titulo="Tela em loop"
      descricao="Um componente ficou se chamando sem parar. Recarregue para voltar ao normal."
      acao="Recarregar"
      onClick={this.handleReload}
    />
  );

  public render() {
    if (this.state.hasError) {
      // Presenca da prop, nao veracidade: `fallback={null}` (e `fallback={false}`)
      // e o pedido explicito de NAO renderizar nada — usado em App.tsx para
      // retirar um overlay que quebrou sem derrubar o app. Com `if
      // (this.props.fallback)` o null era tratado como "sem fallback" e a tela
      // global de erro tomava o lugar do overlay. (#383 / R2-INF-041)
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }

      // Cenario chunk: se o orcamento automatico da sessao acabou (ou o cooldown
      // barra a recarga), a unica saida e o usuario atualizar — a tela "Nova
      // versao disponivel" zera a guarda e recarrega.
      if (isChunkLoadError(this.state.error)) {
        if (hasExhaustedChunkReloads()) {
          return <StaleBundleNotice />;
        }
        return this.renderFallbackDeChunk();
      }

      // Cenario recursao infinita (Maximum call stack).
      if (isStackOverflowError(this.state.error)) {
        return this.renderFallbackDeRecursao();
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
