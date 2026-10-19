import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/hooks/auth/useAuth";
import { ThemeSync } from "@/hooks/ui/useTheme";
import { HighContrastProvider } from "@/components/theme/HighContrastToggle";
import { AccessibleToastProvider } from "@/components/ui/accessible-toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeInitializer } from "@/components/ThemeInitializer";
import { ErrorBoundary } from "@/components/errors/ErrorBoundary";
import { getLogger } from "@/lib/logger";
import { useRef, useState, lazy, Suspense, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { QuarantineMonitorProvider } from "@/providers/QuarantineMonitorProvider";
import { CallSessionProvider } from "@/providers/CallSessionProvider";

const log = getLogger('AppProviders');

// A11Y: MotionConfig com reducedMotion="user" cobre todos os consumidores de
// motion.* abaixo. Carregado lazy para manter o framer-motion fora do bundle
// inicial — quem anima primeiro faz o fetch; enquanto isso, children ja renderizam.
const LazyMotionConfig = lazy(() =>
  import('framer-motion').then((mod) => ({
    default: ({ children }: { children: ReactNode }) => (
      <mod.MotionConfig reducedMotion="user">{children}</mod.MotionConfig>
    ),
  }))
);

const MAX_RETRIES = 3;


/**
 * Tela minima de erro do nivel mais externo.
 *
 * DE PROPOSITO sem contexto nenhum (sem tema, sem i18n, sem tooltip, sem
 * framer-motion): este boundary fica ACIMA do AppProviders (montado em
 * src/main.tsx), entao quando o proprio provider (AuthProvider, QueryClient,
 * CallSession...) quebra nao ha contexto para consumir — usar um componente
 * que dependa de provider aqui reintroduziria o crash que ela existe para
 * cobrir. Estilo por classe utilitaria (CSS puro), sem js em runtime alem do
 * "Recarregar".
 */
function TelaMinimaDeErro() {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background p-4 text-center"
      role="alert"
    >
      <div className="max-w-md space-y-4">
        <h1 className="text-xl font-bold text-foreground">Nao foi possivel carregar o Zapp</h1>
        <p className="text-muted-foreground">
          Um erro inesperado interrompeu o aplicativo. Recarregue para tentar de novo.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-md font-medium min-h-11"
        >
          Recarregar
        </button>
      </div>
    </div>
  );
}

/**
 * Boundary mais externo do app (montado em src/main.tsx, acima do
 * `AppProviders`). Existe para o caso que o boundary interno do AppProviders
 * nao alcanca: erro no proprio provider (AuthProvider e cia.) durante o
 * primeiro render, que sem isto virava tela branca. Sem `resetKey`: erro
 * aqui nao tem recuperacao automatica confiavel — a saida e recarregar.
 */
export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary fallback={<TelaMinimaDeErro />}>{children}</ErrorBoundary>;
}


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

  // Toda recuperacao (o boundary voltou ao normal) zera o contador: o orcamento
  // de 3 tentativas e por falha CONSECUTIVA, nao por sessao. Sem isto, tres
  // erros recuperados em qualquer momento do dia somavam ate o 4o derrubar o
  // app em "Falha Critica na Inicializacao".
  const handleReset = () => {
    retryCountRef.current = 0;
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
    <ErrorBoundary resetKey={errorKey} onError={handleError} onReset={handleReset}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <HighContrastProvider>
            <AccessibleToastProvider>
              <TooltipProvider delayDuration={300}>
                <ThemeSync />
                <ThemeInitializer />
                <QuarantineMonitorProvider>
                  <CallSessionProvider>
                    {/*
                      A11Y: MotionConfig lazy — framer-motion fora do bundle
                      inicial. Children renderizam imediatamente via fallback;
                      reducedMotion="user" entra assim que o chunk carrega.
                    */}
                    <Suspense fallback={<>{children}</>}>
                      <LazyMotionConfig>
                        {children}
                      </LazyMotionConfig>
                    </Suspense>
                  </CallSessionProvider>
                </QuarantineMonitorProvider>
              </TooltipProvider>
            </AccessibleToastProvider>
          </HighContrastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
