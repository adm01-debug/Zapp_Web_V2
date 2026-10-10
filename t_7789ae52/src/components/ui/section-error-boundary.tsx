import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { log } from '@/lib/logger';
import { reportClientError } from '@/lib/errorReporter';

interface Props {
  children: React.ReactNode;
  sectionName?: string;
  className?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Lightweight error boundary for individual sections/panels.
 * Unlike the global ErrorBoundary, this renders an inline fallback
 * so only the broken section is affected — the rest of the app keeps working.
 */
export class SectionErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    log.error(`[SectionError] ${this.props.sectionName || 'Unknown'}:`, error, info.componentStack);
    reportClientError(error, {
      source: 'SectionErrorBoundary',
      section: this.props.sectionName ?? 'Unknown',
      componentStack: (info.componentStack ?? '').slice(0, 1500),
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className={cn(
          "flex flex-col items-center justify-center gap-3 p-6 text-center rounded-lg border border-border/50 bg-muted/20",
          this.props.className
        )}>
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              {this.props.sectionName ? `Erro em "${this.props.sectionName}"` : 'Erro ao carregar seção'}
            </p>
            <p className="text-xs text-muted-foreground max-w-xs">
              {this.state.error?.message || 'Algo deu errado. Tente recarregar.'}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={this.handleRetry} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Tentar novamente
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
