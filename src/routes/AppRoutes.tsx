import { Routes, Route } from "react-router-dom";
 import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
 import { lazyWithRetry } from "@/lib/lazyWithRetry";

 const Index = lazyWithRetry(() => import("../pages/Index"));
 const Auth = lazyWithRetry(() => import("../pages/Auth"));
 const ForgotPassword = lazyWithRetry(() => import("../pages/ForgotPassword"));
 const ResetPassword = lazyWithRetry(() => import("../pages/ResetPassword"));
 const VerifyEmail = lazyWithRetry(() => import("../pages/VerifyEmail"));
 const SSOCallback = lazyWithRetry(() => import("../pages/SSOCallback"));
 const TwoFactorAuth = lazyWithRetry(() => import("../pages/TwoFactorAuth"));
 const NotFound = lazyWithRetry(() => import("../pages/NotFound"));
 const Install = lazyWithRetry(() => import("../pages/Install"));
 const ChatPopup = lazyWithRetry(() => import("../pages/ChatPopup"));
 const QueueDetail = lazyWithRetry(() => import("../pages/QueueDetail"));
 const QueueComparison = lazyWithRetry(() => import("../pages/QueueComparison"));
 const SlaDashboard = lazyWithRetry(() => import("../pages/sla/SlaDashboard"));
 const SlaHistory = lazyWithRetry(() => import("../pages/sla/SlaHistory"));
 const RolesPage = lazyWithRetry(() => import("../pages/admin/RolesPage"));
 const RateLimitDashboard = lazyWithRetry(() => import("../pages/admin/RateLimitDashboard"));

 export function AppRoutes() {
   return (
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
              <ProtectedRoute requiredPermission="view_queues">
                <QueueDetail />
              </ProtectedRoute>
            }
          />
            <Route
            path="/queues/comparison"
            element={
              <ProtectedRoute requiredPermission="view_queues">
                <QueueComparison />
              </ProtectedRoute>
            }
          />
            <Route
            path="/sla"
            element={
              <ProtectedRoute requiredPermission="view_reports">
                <SlaDashboard />
              </ProtectedRoute>
            }
          />
            <Route
            path="/sla/history"
            element={
              <ProtectedRoute requiredPermission="view_reports">
                <SlaHistory />
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
   );
 }
