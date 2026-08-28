import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/auth/useAuth";
import { ThemeSync } from "@/hooks/ui/useTheme";
import { HighContrastProvider } from "@/components/theme/HighContrastToggle";
import { AccessibleToastProvider } from "@/components/ui/accessible-toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeInitializer } from "@/components/ThemeInitializer";
import { ErrorBoundary } from "@/components/errors/ErrorBoundary";
import { getLogger } from "@/lib/logger";
import { useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { QuarantineMonitorProvider } from "@/providers/QuarantineMonitorProvider";

const log = getLogger('AppProviders');

const MAX_RETRIES = 3;

/**
 * Singleton QueryClient — created once at module level so all instances
 * share the same cache. Stable across re-renders and HMR cycles.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
      // Evita refetch automático ao remontar componentes — o staleTime de 5min
      // já garante dados frescos e elimina rajadas de requisição em navegação
      // entre rotas SPA.
      refetchOnMount: false,
      // 'online' faz queries pausarem sem rede em vez de falharem com retry,
      // economizando bateria/CPU em conexões instáveis.
      networkMode: 'online',
    },
    mutations: {
      retry: 1,
      networkMode: 'online',
    },
  },
});

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [errorKey, setErrorKey] = useState(0);
  const [failed, setFailed] = useState(false);
  const retryCountRef = useRef(0);

  const handleError = (error: Error) => {
    log.error('ErrorBoundary caught:', error.message, error.stack);
    if (retryCountRef.current < MAX_RETRIES) {
      retryCountRef.current += 1;
      log.warn(`Auto-retry ${retryCountRef.current}/${MAX_RETRIES}`);
      setTimeout(() => setErrorKey(prev => prev + 1), 2000 * retryCountRef.current);
    } else {
      log.error('Max retries reached. Manual intervention required.');
      setFailed(true);
    }
  };

  if (failed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 text-center">
        <div className="max-w-md space-y-6">
          <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-10 h-10 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Falha Crítica na Inicialização</h1>
          <p className="text-muted-foreground">
            O sistema não conseguiu iniciar após várias tentativas. Isso pode ser causado
            por um problema de conexão ou cache do navegador.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md font-medium"
            >
              Recarregar Aplicativo
            </button>
            <button
              onClick={() => { localStorage.clear(); window.location.reload(); }}
              className="px-6 py-2 bg-muted text-muted-foreground rounded-md text-sm italic"
            >
              Limpar Cache e Recarregar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary resetKey={errorKey} onError={handleError}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <HighContrastProvider>
            <AccessibleToastProvider>
              <TooltipProvider delayDuration={300}>
                <ThemeSync />
                <ThemeInitializer />
                <QuarantineMonitorProvider>
                  {children}
                </QuarantineMonitorProvider>
              </TooltipProvider>
            </AccessibleToastProvider>
          </HighContrastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
