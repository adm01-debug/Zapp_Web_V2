import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { WifiOff, RefreshCw, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSupabaseConnectivity } from '@/hooks/system/useSupabaseConnectivity';
import { useNetworkStatus } from '@/hooks/system/useNetworkStatus';

interface SupabaseConnectivityBannerProps {
  className?: string;
}

/**
 * Faixa discreta no topo quando o backend Supabase não responde.
 *
 * Cobre o cenário em que o navegador do usuário está online mas o servidor
 * Supabase está inacessível (VPS fora do ar, rede bloqueada, proxy/Kong down):
 * o `OfflineIndicator` só enxerga `navigator.onLine` e ficava mudo nesse caso.
 * A sonda é o `useSupabaseConnectivity` (cartão pai) — aqui só se consome o
 * estado dele, sem sondar por conta própria.
 *
 * Regra de convivência: navegador offline continua sendo do `OfflineIndicator`;
 * este banner só aparece com o navegador online e a sonda em `degraded`/`offline`
 * (backend inacessível). Ao voltar, anuncia "Conexão restabelecida" por alguns
 * segundos. Movimento só em opacidade/transform e desligado quando o usuário
 * pede movimento reduzido.
 */
export function SupabaseConnectivityBanner({ className }: SupabaseConnectivityBannerProps) {
  const { status, retryNow } = useSupabaseConnectivity();
  const { isOnline: browserOnline } = useNetworkStatus();
  const reducedMotion = useReducedMotion();

  const backendDown =
    browserOnline && (status === 'degraded' || status === 'offline');

  const [restored, setRestored] = useState(false);
  const prevBackendDownRef = useRef(backendDown);

  // Anúncio curto na transição backend-inacessível → backend OK.
  useEffect(() => {
    const wasDown = prevBackendDownRef.current;
    prevBackendDownRef.current = backendDown;
    if (!wasDown || backendDown || !browserOnline) return;
    setRestored(true);
    const timer = setTimeout(() => setRestored(false), 4000);
    return () => clearTimeout(timer);
  }, [backendDown, browserOnline]);

  const handleRetry = useCallback(() => {
    retryNow();
  }, [retryNow]);

  // Navegador offline: quem cuida é o OfflineIndicator.
  if (!browserOnline) return null;

  // Só transform/opacidade; nada de deslocamento com movimento reduzido.
  const downMotion = reducedMotion
    ? { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: -12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -12 } };
  const restoredMotion = reducedMotion
    ? { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 12 } };

  return (
    <AnimatePresence>
      {backendDown ? (
        <motion.div
          key="backend-down"
          {...downMotion}
          role="status"
          aria-live="polite"
          className={cn(
            'fixed left-0 right-0 top-0 z-50 flex items-center justify-center gap-3 px-4 py-2',
            'bg-warning text-warning-foreground shadow-lg',
            className,
          )}
        >
          <WifiOff className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">Sem conexão com o servidor</span>
          <span className="hidden text-xs opacity-90 sm:inline">
            Verifique sua conexão e tente novamente.
          </span>
          <button
            type="button"
            onClick={handleRetry}
            className="ml-2 inline-flex items-center gap-1.5 rounded bg-warning-foreground/20 px-2 py-0.5 text-xs font-semibold motion-safe:transition-colors hover:bg-warning-foreground/30"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Tentar agora
          </button>
        </motion.div>
      ) : null}

      {restored && !backendDown ? (
        <motion.div
          key="restored"
          {...restoredMotion}
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-success px-4 py-2 text-sm font-medium text-success-foreground shadow-lg"
        >
          <Wifi className="h-4 w-4" />
          Conexão restabelecida
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
