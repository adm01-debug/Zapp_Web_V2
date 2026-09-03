 import { Suspense, useCallback, forwardRef, lazy, useState, useMemo } from 'react';
 import { ZenModeToggle } from '@/components/layout/ZenModeToggle';
 import { VoiceCopilotFAB } from '@/components/layout/VoiceCopilotFAB';
import { useViewTransition } from '@/hooks/ui/useViewTransition';
import { cn } from '@/lib/utils';
import { Sidebar } from '@/components/layout/Sidebar';
import { OnboardingChecklist } from '@/components/onboarding/OnboardingChecklist';
import { ViewRouter } from '@/pages/ViewRouter';
import { ViewLoadingFallback } from '@/components/layout/ViewLoadingFallback';
import { RouteLoadingBar } from '@/components/ui/route-loading-bar';
 const MobileShell = lazy(() => import('@/components/mobile/MobileShell').then(m => ({ default: m.MobileShell })));
 import { A11yBoilerplate } from '@/components/layout/A11yBoilerplate';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { useSwipeNavigation } from '@/hooks/ui/useSwipeNavigation';
import { useZenMode } from '@/hooks/ui/useZenMode';
 import { TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';
 import { useVoiceAgent } from '@/hooks/voice/useVoiceAgent';

const LazyVoiceOverlay = lazy(() => import('@/components/voice/VoiceSearchOverlayConnected'));

interface AppShellProps {
  currentView: string;
  setCurrentView: (viewId: string) => void;
  userId?: string;
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
  breadcrumbTrail: string[];
  navDirectionRef: React.MutableRefObject<'forward' | 'back'>;
  profile: { name?: string | null; avatar_url?: string | null } | null;
  userEmail: string;
  signOut: () => void;
  unreadNotifications: number;
  showChecklist: boolean;
  loading: boolean;
}

export const AppShell = forwardRef<HTMLDivElement, AppShellProps>(function AppShell({
  currentView,
  setCurrentView,
  userId,
  canGoBack,
  canGoForward,
  goBack,
  goForward,
  breadcrumbTrail,
  navDirectionRef,
  profile,
  userEmail,
  signOut,
  unreadNotifications,
  showChecklist,
  loading,
}, _ref) {
  const isMobile = useIsMobile();
  const { isZen, toggleZen } = useZenMode();
  const isInboxView = currentView === 'inbox' || currentView === 'team-chat';
  const { startTransition } = useViewTransition();
  const [voiceOpen, setVoiceOpen] = useState(false);

  const handleViewChange = useCallback((viewId: string) => {
    startTransition(() => setCurrentView(viewId));
  }, [startTransition, setCurrentView]);

   const { handleVoiceAction } = useVoiceAgent(handleViewChange);

  // Mobile edge-swipe navigation
  useSwipeNavigation({
    onSwipeBack: goBack,
    onSwipeForward: goForward,
    canGoBack,
    canGoForward,
    enabled: isMobile,
    edgeWidth: 20,
    threshold: 60,
  });

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-[100dvh] bg-background overflow-hidden relative">
      <RouteLoadingBar isLoading={loading} />

       <A11yBoilerplate />

      {/* Mobile wrapper */}
      {isMobile && (
        <Suspense fallback={null}>
          <MobileShell
            currentView={currentView}
            setCurrentView={setCurrentView}
            profile={profile}
            userEmail={userEmail}
            signOut={signOut}
            unreadNotifications={unreadNotifications}
          />
        </Suspense>
      )}

      {/* Desktop Sidebar — hidden in zen mode */}
      {!isMobile && !isZen && (
        <Sidebar
          currentView={currentView}
          onViewChange={handleViewChange}
          currentAgent={{
            name: profile?.name || userEmail || 'Usuário',
            avatar: profile?.avatar_url || undefined,
            status: 'online',
          }}
          onLogout={signOut}
          inboxBadge={unreadNotifications || undefined}
        />
      )}

      <main
        id="main-content"
        role="main"
        aria-label="Conteúdo principal"
        tabIndex={-1}
        className={cn(
          'flex flex-1 items-stretch overflow-hidden relative min-w-0 min-h-0 h-full max-h-full focus:outline-2 focus:outline-primary/40 focus:outline-offset-[-2px]',
          isMobile && 'pt-12 pb-[56px]'
        )}
      >
         {!isMobile && isInboxView && <ZenModeToggle isZen={isZen} toggleZen={toggleZen} />}
        {showChecklist && currentView === 'dashboard' && (
          <div className="absolute top-4 right-4 z-20 w-96 max-w-[calc(100%-2rem)]">
            <OnboardingChecklist onNavigate={handleViewChange} />
          </div>
        )}

        <Suspense fallback={<ViewLoadingFallback />}>
              <ViewRouter
                currentView={currentView}
                userId={userId}
                canGoBack={canGoBack}
                canGoForward={canGoForward}
                onGoBack={goBack}
                onGoForward={goForward}
                breadcrumbTrail={breadcrumbTrail}
                onNavigateTo={handleViewChange}
              />
        </Suspense>
      </main>

       {!isMobile && <VoiceCopilotFAB onClick={() => setVoiceOpen(true)} />}

      {/* Voice Overlay (lazy loaded) */}
      {voiceOpen && (
        <Suspense fallback={null}>
          <LazyVoiceOverlay
            isOpen={voiceOpen}
            onClose={() => setVoiceOpen(false)}
            onAction={handleVoiceAction}
            onError={(msg) => toast.error(msg)}
          />
        </Suspense>
      )}

    </div>
  );
});
