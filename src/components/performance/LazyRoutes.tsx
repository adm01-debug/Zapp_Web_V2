import React, { Suspense, lazy, ComponentType } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

// Lazy loaded views
export const LazyDashboardView = lazy(() => import('@/components/dashboard/DashboardView').then(m => ({ default: m.DashboardView })));
export const LazyContactsView = lazy(() => import('@/components/contacts/ContactsView').then(m => ({ default: m.ContactsView })));
export const LazyAgentsView = lazy(() => import('@/components/agents/AgentsView').then(m => ({ default: m.AgentsView })));
export const LazyQueuesView = lazy(() => import('@/components/queues/QueuesView').then(m => ({ default: m.QueuesView })));
export const LazyConnectionsView = lazy(() => import('@/components/connections/ConnectionsView').then(m => ({ default: m.ConnectionsView })));
export const LazyTagsView = lazy(() => import('@/components/tags/TagsView').then(m => ({ default: m.TagsView })));
export const LazySettingsView = lazy(() => import('@/components/settings/SettingsView').then(m => ({ default: m.SettingsView })));
export const LazyClientWalletView = lazy(() => import('@/components/wallet/ClientWalletView').then(m => ({ default: m.ClientWalletView })));
export const LazyAdminView = lazy(() => import('@/components/admin/AdminView').then(m => ({ default: m.AdminView })));
export const LazyProductManagement = lazy(() => import('@/components/catalog/ExternalProductManagement').then(m => ({ default: m.ExternalProductManagement })));
export const LazyGroupsView = lazy(() => import('@/components/groups/GroupsView').then(m => ({ default: m.GroupsView })));
export const LazyTranscriptionsHistoryView = lazy(() => import('@/components/transcriptions/TranscriptionsHistoryView').then(m => ({ default: m.TranscriptionsHistoryView })));
export const LazyAdvancedReportsView = lazy(() => import('@/components/reports/AdvancedReportsView').then(m => ({ default: m.AdvancedReportsView })));
export const LazySecurityView = lazy(() => import('@/components/security/SecurityView').then(m => ({ default: m.SecurityView })));
export const LazySentimentAlertsDashboard = lazy(() => import('@/components/dashboard/SentimentAlertsDashboard').then(m => ({ default: m.SentimentAlertsDashboard })));

// Loading fallback component
interface LazyLoadFallbackProps {
  type?: 'dashboard' | 'list' | 'form' | 'chat' | 'default';
}

export function LazyLoadFallback({ type = 'default' }: LazyLoadFallbackProps) {
  const renderSkeleton = () => {
    switch (type) {
      case 'dashboard':
        return (
          <div className="p-6 space-y-6">
            <Skeleton className="h-16 w-full" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Skeleton className="h-64 lg:col-span-2" />
              <Skeleton className="h-64" />
            </div>
          </div>
        );
      case 'list':
        return (
          <div className="p-6 space-y-4">
            <Skeleton className="h-12 w-full" />
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        );
      case 'form':
        return (
          <div className="p-6 space-y-4 max-w-2xl mx-auto">
            <Skeleton className="h-10 w-48" />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
            <Skeleton className="h-10 w-32" />
          </div>
        );
      case 'chat':
        return (
          <div className="flex h-full">
            <div className="w-80 border-r p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
            <div className="flex-1 p-4 space-y-4">
              <Skeleton className="h-16 w-full" />
              <div className="flex-1 space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-3/4" style={{ marginLeft: i % 2 === 0 ? 'auto' : 0 }} />
                ))}
              </div>
              <Skeleton className="h-14 w-full" />
            </div>
          </div>
        );
      default:
        return (
          <div className="flex items-center justify-center h-full min-h-[400px]">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <motion.div
                className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-4"
                animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Sparkles className="w-8 h-8 text-primary" />
              </motion.div>
              <p className="text-muted-foreground">Carregando...</p>
              <motion.div className="flex gap-1.5 justify-center mt-4">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 rounded-full bg-primary"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </motion.div>
            </motion.div>
          </div>
        );
    }
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="h-full"
      >
        {renderSkeleton()}
      </motion.div>
    </AnimatePresence>
  );
}

// Wrapper component for lazy loaded views
interface LazyViewProps {
  children: React.ReactNode;
  fallbackType?: LazyLoadFallbackProps['type'];
}

export function LazyView({ children, fallbackType = 'default' }: LazyViewProps) {
  return (
    <Suspense fallback={<LazyLoadFallback type={fallbackType} />}>
      {children}
    </Suspense>
  );
}

// HOC for creating lazy components with custom fallback
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic HOC requires any for ComponentType inference
export function withLazyLoading<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  fallbackType: LazyLoadFallbackProps['type'] = 'default'
) {
  const LazyComponent = lazy(importFn);
  
  return function LazyWrapper(props: React.ComponentProps<T>) {
    return (
      <LazyView fallbackType={fallbackType}>
        <LazyComponent {...props} />
      </LazyView>
    );
  };
}
