import { Routes, Route } from "react-router-dom";
import { Suspense, lazy } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { Sparkles } from "lucide-react";
import { ErrorBoundary } from "@/components/errors/ErrorBoundary";
import { PageTransitionProvider } from "@/components/transitions";

// Route components
const Index = lazyWithRetry(() => import("../pages/Index"));
const Auth = lazyWithRetry(() => import("../pages/Auth"));
const NotFound = lazyWithRetry(() => import("../pages/NotFound"));
const ForgotPassword = lazyWithRetry(() => import("../pages/ForgotPassword"));
const ResetPassword = lazyWithRetry(() => import("../pages/ResetPassword"));
const VerifyEmail = lazyWithRetry(() => import("../pages/VerifyEmail"));
const SSOCallback = lazyWithRetry(() => import("../pages/SSOCallback"));
const TwoFactorAuth = lazyWithRetry(() => import("../pages/TwoFactorAuth"));
const QueueDetails = lazyWithRetry(() => import("../pages/QueueDetails"));
const QueuesComparison = lazyWithRetry(() => import("../pages/QueuesComparison"));
const SLADashboard = lazyWithRetry(() => import("../pages/SLADashboard"));
const SLAHistory = lazyWithRetry(() => import("../pages/SLAHistory"));
const RolesPage = lazyWithRetry(() => import("../pages/admin/RolesPage"));
const RateLimitDashboard = lazyWithRetry(() => import("../pages/admin/RateLimitDashboard"));
const Install = lazyWithRetry(() => import("../pages/Install"));
const ChatPopup = lazyWithRetry(() => import("../pages/ChatPopup"));

function RouteLoadingFallback() {
  return (
    <div className="flex items-center justify-center h-screen bg-background" role="status" aria-busy="true" aria-label="Carregando página">
      <div className="text-center space-y-6 max-w-xs w-full px-4">
        <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto animate-pulse-soft border border-primary/20 shadow-glow-primary/20">
          <Sparkles className="w-10 h-10 text-primary" aria-hidden="true" />
        </div>
        <div className="space-y-3">
          <div className="h-5 w-40 bg-muted rounded-full mx-auto animate-pulse-soft" />
          <div className="h-3 w-28 bg-muted/60 rounded-full mx-auto animate-pulse-soft" />
        </div>
        <span className="sr-only">Carregando página...</span>
      </div>
    </div>
  );
}

export function AppRoutes() {
  return (
    <ErrorBoundary fallback={<div className="p-4 text-center">Erro ao carregar roteamento</div>}>
      <Suspense fallback={<RouteLoadingFallback />}>
        <PageTransitionProvider>
        <Routes>
          <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/auth/callback" element={<SSOCallback />} />
          <Route path="/2fa" element={<TwoFactorAuth />} />
          <Route path="/install" element={<Install />} />
          <Route
            path="/chat-popup/:contactId"
            element={
              <ProtectedRoute>
                <ChatPopup />
              </ProtectedRoute>
            }
          />
          <Route
            path="/queue/:id"
            element={
              <ProtectedRoute>
                <QueueDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/queues/comparison"
            element={
              <ProtectedRoute>
                <QueuesComparison />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sla"
            element={
              <ProtectedRoute>
                <SLADashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sla/history"
            element={
              <ProtectedRoute>
                <SLAHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/roles"
            element={
              <ProtectedRoute requiredRoles={["admin"]}>
                <RolesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/rate-limit"
            element={
              <ProtectedRoute requiredRoles={["admin"]}>
                <RateLimitDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </PageTransitionProvider>
      </Suspense>
    </ErrorBoundary>
  );
}
