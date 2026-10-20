import { lazy, Suspense, useEffect } from "react";
import { getLogger } from "@/lib/logger";
import { BrowserRouter } from "react-router-dom";
import { ErrorBoundary } from "@/components/errors/ErrorBoundary";
import { SkipLinks } from "@/components/ui/skip-link";
import { LiveRegion } from "@/components/ui/visually-hidden";
import { GlobalKeyboardProvider } from "@/components/keyboard/GlobalKeyboardProvider";
import { AppProviders } from "@/providers/AppProviders";
import { AppRoutes } from "@/routes/AppRoutes";
import { useAuth } from "@/hooks/auth/useAuth";
import { useGlobalIncomingMessageAlerts } from "@/hooks/realtime/useGlobalIncomingMessageAlerts";

const log = getLogger('App');

// ---------------------------------------------------------------------------
// Deferred non-critical providers — loaded lazily AFTER first paint.
//
// These are OVERLAY providers (side-effect only). They render their own
// UI (notification banners, incoming-call overlay, keyboard easter eggs)
// WITHOUT needing to be ancestors of <AppRoutes />.
//
// If any of them crashes at load time, the app gracefully continues:
// the ErrorBoundary below recovers silently (returns null) so the main
// routing tree is never affected.
// ---------------------------------------------------------------------------
const RealtimeSentimentAlertProvider = lazy(() =>
  import("@/components/notifications/RealtimeSentimentAlertProvider")
    .then(m => ({ default: m.RealtimeSentimentAlertProvider }))
);
const IncomingCallAlert = lazy(() =>
  import("@/components/calls/IncomingCallAlert")
    .then(m => ({ default: m.IncomingCallAlert }))
);
// C02: o cartão da chamada de SAÍDA iniciada no inbox — mesmo slot global do
// alerta de entrada (overlay, não é provider de contexto).
const OutboundCallDialog = lazy(() =>
  import("@/components/calls/OutboundCallDialog")
    .then(m => ({ default: m.OutboundCallDialog }))
);
const EasterEggsProvider = lazy(() =>
  import("@/components/effects/EasterEggs")
    .then(m => ({ default: m.EasterEggsProvider }))
);
// TC-007: listener ÚNICO de notificações do Team Chat, montado no nível do app. É um
// provedor de efeito (renderiza null) e fica no chunk lazy para não pesar o bundle inicial.
const TeamChatNotificationsListener = lazy(() =>
  import("@/components/team-chat/TeamChatNotificationsListener")
    .then(m => ({ default: m.TeamChatNotificationsListener }))
);
// HZ1-10: aviso de alerta de segurança no app inteiro (antes só dentro da
// Central de Segurança). Mesmo slot e mesmo motivo do listener do Team Chat:
// overlay de efeito, no chunk lazy, para o `sonner` que ele alcança não voltar
// ao grafo estático do entry.
const SecurityPushNotificationsListener = lazy(() =>
  import("@/components/notifications/SecurityPushNotificationsListener")
    .then(m => ({ default: m.SecurityPushNotificationsListener }))
);
// O viewport de toasts do sonner é overlay: nenhum toast existe no first paint e
// o `toast()` bufferiza chamadas feitas antes do mount (Observer do pacote), então
// nada se perde na janela de carregamento. Estático, ele colocava a lib (~9 KB
// gzip) no bundle inicial — medido pelo bundle-budget.mjs em 09/10/2026.
const Sonner = lazy(() =>
  import("@/components/ui/sonner")
    .then(m => ({ default: m.Toaster }))
);
// Gamificação: host do toast de conquista/subida de nível. É overlay (renderiza o
// próprio aviso e não envolve as rotas), então vive no mesmo bloco lazy do Sonner —
// nada dele existe na primeira pintura.
const AchievementCelebrationToaster = lazy(() =>
  import("@/components/gamification/AchievementToast")
    .then(m => ({ default: m.AchievementCelebrationToaster }))
);

/**
 * Side-effect overlay providers — no children needed here.
 * They self-render their own portals/overlays independently.
 *
 * ARCH-2 FIX: removed the unused `children?` prop that was incorrectly
 * suggesting these providers wrap the route tree. They don't. If a provider
 * needs to expose a React context consumed by AppRoutes, it belongs in
 * AppProviders (src/providers/AppProviders.tsx), not here.
 */
function DeferredProviders() {
  // Aviso de mensagem nova em QUALQUER tela (aba oculta ou view fora da inbox).
  // Vive aqui como os outros listeners globais (TeamChatNotificationsListener):
  // é side-effect, self-render (toast) e precisa de AuthProvider + QueryClient,
  // que estão acima (AppProviders). `profile.id` é o valor de
  // `contacts.assigned_to` — nunca o auth user id.
  const { profile } = useAuth();
  useGlobalIncomingMessageAlerts({ myProfileId: profile?.id ?? null });

  return (
    // ARCH-3 FIX: fallback={null} is intentional for side-effect providers —
    // the app must remain usable even if a non-critical overlay fails to load.
    <Suspense fallback={null}>
      <RealtimeSentimentAlertProvider />
      <IncomingCallAlert />
      <OutboundCallDialog />
      <TeamChatNotificationsListener />
      <SecurityPushNotificationsListener />
      {/* EasterEggsProvider is purely a keyboard/shake listener. No children needed. */}
      <EasterEggsProvider>{null}</EasterEggsProvider>
      <Sonner />
      <AchievementCelebrationToaster />
    </Suspense>
  );
}

/**
 * Lazy-loads non-critical hooks after the first paint so they don't
 * block the initial render. Uses a plain functional component —
 * no forwardRef needed since we never pass a ref to this element.
 */
const DeferredHooks = lazy(() =>
  Promise.all([
    import('@/hooks/system/useServiceWorker'),
    import('@/hooks/ui/useScreenProtection'),
    // Item 025: a fila offline drena também na ABERTURA (sob sessão autenticada),
    // não só no evento `online` — ver lib/offlineQueue.ts.
    import('@/hooks/system/useOfflineSendQueueDrain'),
  ]).then(([swMod, spMod, offlineMod]) => ({
    default: function DeferredHooksRunner() {
      swMod.useServiceWorker();
      spMod.useScreenProtection();
      offlineMod.useOfflineSendQueueDrain();
      return null;
    },
  }))
);

function AppContent() {
  useEffect(() => {
    log.info('AppContent mounted');
    if (window.performance && typeof window.performance.mark === 'function') {
      performance.mark('app-content-mounted');
      const measure = performance.measure('total-load', undefined, 'app-content-mounted');
      log.info(`Total Load Time: ${measure.duration.toFixed(2)}ms`);
    }
  }, []);

  // Global unhandled rejection / error handler
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (reason && typeof reason === 'object' && 'name' in reason) {
        const name = (reason as { name: string }).name;
        if (name === 'TimeoutError' || name === 'InvalidStateError') {
          event.preventDefault();
          return;
        }
      }
      log.error("Unhandled promise rejection:", event.reason);
      event.preventDefault();
    };

    const handleError = (event: ErrorEvent) => {
      log.error("Uncaught error:", event.error);
    };

    window.addEventListener("unhandledrejection", handleRejection);
    window.addEventListener("error", handleError);

    return () => {
      window.removeEventListener("unhandledrejection", handleRejection);
      window.removeEventListener("error", handleError);
    };
  }, []);

  return (
    <BrowserRouter>
      <SkipLinks />
      <LiveRegion />
      <GlobalKeyboardProvider>
        {/*
          ARCH-2 FIX: ErrorBoundary wraps only the DeferredProviders (overlays).
          AppRoutes is OUTSIDE this boundary so overlay crashes never affect routing.
          fallback={null} is correct: if an overlay provider crashes, we silently
          remove the overlay — the core app keeps running.
        */}
        <ErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <DeferredProviders />
            <DeferredHooks />
          </Suspense>
        </ErrorBoundary>
        <AppRoutes />
      </GlobalKeyboardProvider>
    </BrowserRouter>
  );
}

const App = () => (
  <AppProviders>
    <AppContent />
  </AppProviders>
);

export default App;
